import { query, withTransaction } from '../db/client.js';
import { Job, Worker } from '../types/index.js';
import { LockService } from './lock.service.js';
import { eventBus } from '../events/event-bus.js';
import { config } from '../config.js';

export class ReaperService {
  /**
   * DISTRIBUTED LOCKING (bonus feature): if you run more than one reaper
   * process (e.g. one per API/scheduler instance for HA), only a single
   * instance should actually run the recovery sweep on a given tick —
   * otherwise two reapers could both see the same dead worker and race
   * to requeue/DLQ its orphaned jobs. We guard the whole sweep with a
   * cluster-wide advisory lock keyed by "reaper:sweep".
   */
  static async recoverStaleWorkersIfLeader(staleThresholdMs: number = 30000) {
    const result = await LockService.withLock('reaper:sweep', config.locking.holderId, () =>
      this.recoverStaleWorkers(staleThresholdMs)
    );
    return result ?? { offlineWorkersCount: 0, recoveredJobsCount: 0, skippedNotLeader: true };
  }

  static async recoverStaleWorkers(staleThresholdMs: number = 30000): Promise<{
    offlineWorkersCount: number;
    recoveredJobsCount: number;
  }> {
    const thresholdDate = new Date(Date.now() - staleThresholdMs);

    const result = await withTransaction(async (client) => {
      // 1. Find dead workers
      const deadWorkersRes = await client.query<Worker>(
        `SELECT id, hostname, pid
         FROM workers
         WHERE status = 'ONLINE'
           AND last_heartbeat_at < $1`,
        [thresholdDate]
      );

      if (deadWorkersRes.rows.length === 0) {
        return { offlineWorkersCount: 0, recoveredJobsCount: 0, deadWorkerIds: [] as string[] };
      }

      const deadWorkerIds = deadWorkersRes.rows.map((w) => w.id);
      const workerPlaceholders = deadWorkerIds.map((_, i) => `$${i + 1}`).join(', ');

      // 2. Mark workers as OFFLINE
      await client.query(
        `UPDATE workers
         SET status = 'OFFLINE'
         WHERE id IN (${workerPlaceholders})`,
        deadWorkerIds
      );

      // 3. Find and recover orphaned jobs
      const orphanedJobsRes = await client.query<Job>(
        `SELECT id, queue_id, attempt_count, max_attempts
         FROM jobs
         WHERE locked_by IN (${workerPlaceholders})
           AND status IN ('CLAIMED', 'RUNNING')`,
        deadWorkerIds
      );

      let recoveredCount = 0;

      for (const job of orphanedJobsRes.rows) {
        if (job.attempt_count < job.max_attempts) {
          await client.query(
            `UPDATE jobs
             SET status = 'QUEUED',
                 locked_by = NULL,
                 locked_at = NULL
             WHERE id = $1`,
            [job.id]
          );
        } else {
          await client.query(
            `UPDATE jobs
             SET status = 'DEAD_LETTER',
                 locked_by = NULL,
                 completed_at = NOW()
             WHERE id = $1`,
            [job.id]
          );

          await client.query(
            `INSERT INTO dead_letter_queue (job_id, queue_id, failed_reason, total_attempts)
             VALUES ($1, $2, 'Worker timed out / crashed during execution', $3)
             ON CONFLICT (job_id) DO NOTHING`,
            [job.id, job.queue_id, job.attempt_count]
          );
        }
        recoveredCount++;
      }

      return {
        offlineWorkersCount: deadWorkerIds.length,
        recoveredJobsCount: recoveredCount,
        deadWorkerIds,
      };
    });

    for (const workerId of result.deadWorkerIds) {
      eventBus.publish('WORKER_UPDATED', { workerId, status: 'OFFLINE' });
    }
    if (result.recoveredJobsCount > 0) {
      eventBus.publish('JOB_UPDATED', { message: `Reaper recovered ${result.recoveredJobsCount} orphaned job(s)` });
    }

    return { offlineWorkersCount: result.offlineWorkersCount, recoveredJobsCount: result.recoveredJobsCount };
  }
}
