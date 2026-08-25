import os from 'os';
import { query, withTransaction } from '../db/client.js';
import { Job, Worker, WorkerStatus } from '../types/index.js';
import { eventBus } from '../events/event-bus.js';

// In-process mutex for serializing claiming transactions per queue
const queueLocks = new Map<string, Promise<void>>();

export class WorkerService {
  static async registerWorker(params: {
    hostname?: string;
    pid?: number;
    concurrencyLimit?: number;
    shardId?: number;
  }): Promise<Worker> {
    const hostname = params.hostname || os.hostname();
    const pid = params.pid || process.pid;
    const concurrencyLimit = params.concurrencyLimit || 5;
    const shardId = params.shardId ?? 0;

    const res = await query<Worker>(
      `INSERT INTO workers (hostname, pid, status, concurrency_limit, active_jobs_count, shard_id, started_at, last_heartbeat_at)
       VALUES ($1, $2, 'ONLINE', $3, 0, $4, NOW(), NOW())
       RETURNING *`,
      [hostname, pid, concurrencyLimit, shardId]
    );
    eventBus.publish('WORKER_UPDATED', { workerId: res.rows[0].id, status: 'ONLINE' });
    return res.rows[0];
  }

  static async recordHeartbeat(params: {
    workerId: string;
    activeJobsCount: number;
    cpuUsagePct?: number;
    memoryUsageMb?: number;
  }): Promise<void> {
    const { workerId, activeJobsCount, cpuUsagePct = 0, memoryUsageMb = 0 } = params;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE workers
         SET last_heartbeat_at = NOW(),
             active_jobs_count = $1
         WHERE id = $2`,
        [activeJobsCount, workerId]
      );

      await client.query(
        `INSERT INTO worker_heartbeats (worker_id, cpu_usage_pct, memory_usage_mb, active_jobs_count, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [workerId, cpuUsagePct, memoryUsageMb, activeJobsCount]
      );
    });

    eventBus.publish('WORKER_UPDATED', { workerId, activeJobsCount, cpuUsagePct, memoryUsageMb });
  }

  static async setWorkerStatus(workerId: string, status: WorkerStatus): Promise<void> {
    await query('UPDATE workers SET status = $1 WHERE id = $2', [status, workerId]);
    eventBus.publish('WORKER_UPDATED', { workerId, status });
  }

  /**
   * ATOMIC CLAIM TRANSACTION:
   * 1. Acquires queue mutex & locks target queue row (FOR UPDATE)
   * 2. Evaluates queue concurrency limit
   * 3. Selects claimable jobs with FOR UPDATE SKIP LOCKED
   * 4. Updates claimed jobs
   */
  static async claimJobsFromQueue(params: {
    workerId: string;
    queueId: string;
    capacity: number;
    shardId?: number;
  }): Promise<Job[]> {
    const { workerId, queueId, capacity, shardId } = params;
    if (capacity <= 0) return [];

    // Acquire queue-level lock
    while (queueLocks.has(queueId)) {
      await queueLocks.get(queueId);
    }

    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    queueLocks.set(queueId, lockPromise);

    let claimedJobs: Job[] = [];
    try {
      claimedJobs = await withTransaction(async (client) => {
        // Step 1: Lock queue row in PostgreSQL
        const qRes = await client.query<{
          id: string;
          concurrency_limit: number;
          is_paused: boolean;
          shard_count: number;
        }>(
          `SELECT id, concurrency_limit, is_paused, shard_count
           FROM queues
           WHERE id = $1
           FOR UPDATE`,
          [queueId]
        );

        if (qRes.rows.length === 0) return [];
        const queue = qRes.rows[0];

        if (queue.is_paused) return [];

        // Step 2: In-flight count under queue lock
        const countRes = await client.query<{ count: string }>(
          `SELECT COUNT(*) as count
           FROM jobs
           WHERE queue_id = $1
             AND status IN ('CLAIMED', 'RUNNING')`,
          [queueId]
        );
        const inFlightCount = parseInt(countRes.rows[0]?.count || '0', 10);
        const availableSlots = queue.concurrency_limit - inFlightCount;

        if (availableSlots <= 0) return [];

        const claimLimit = Math.max(1, Math.min(capacity, availableSlots));

        // QUEUE SHARDING (bonus feature): when a queue has shard_count > 1,
        // its claimable job set is horizontally partitioned across worker
        // pools by hashing the job id, so each shard only ever contends
        // for (and locks) a disjoint subset of rows. This reduces lock
        // contention under FOR UPDATE SKIP LOCKED at high worker counts
        // and lets shards scale independently.
        const shardCount = queue.shard_count || 1;
        const effectiveShardId = shardId ?? 0;
        const shardFilter =
          shardCount > 1
            ? `AND MOD(ABS(hashtext(id::text)), ${shardCount}) = ${effectiveShardId}`
            : '';

        // Step 3: Fetch and lock claimable jobs. Jobs in WAITING (blocked
        // by unmet workflow dependencies, see WorkflowService) are never
        // matched here since only status = 'QUEUED' is eligible.
        const claimRes = await client.query<{ id: string }>(
          `SELECT id
           FROM jobs
           WHERE queue_id = $1
             AND status = 'QUEUED'
             AND run_at <= NOW()
             ${shardFilter}
           ORDER BY priority DESC, created_at ASC
           LIMIT ${claimLimit}
           FOR UPDATE SKIP LOCKED`,
          [queueId]
        );

        if (claimRes.rows.length === 0) return [];

        const jobIds = claimRes.rows.map((r) => r.id);
        const placeholders = jobIds.map((_, i) => `$${i + 2}`).join(', ');

        // Step 4: Atomically update status to CLAIMED
        const updatedJobs = await client.query<Job>(
          `UPDATE jobs
           SET status = 'CLAIMED',
               locked_by = $1,
               locked_at = NOW(),
               attempt_count = attempt_count + 1
           WHERE id IN (${placeholders})
           RETURNING *`,
          [workerId, ...jobIds]
        );

        return updatedJobs.rows;
      });
    } finally {
      queueLocks.delete(queueId);
      releaseLock();
    }

    return claimedJobs;
  }

  static async claimJobsFromQueueAndNotify(params: {
    workerId: string;
    queueId: string;
    capacity: number;
    shardId?: number;
  }): Promise<Job[]> {
    const jobs = await this.claimJobsFromQueue(params);
    for (const job of jobs) {
      eventBus.publish('JOB_UPDATED', { jobId: job.id, status: 'CLAIMED', queueId: job.queue_id, workerId: params.workerId });
    }
    return jobs;
  }

  static async listWorkers(): Promise<Worker[]> {
    const res = await query<Worker>('SELECT * FROM workers ORDER BY started_at DESC');
    return res.rows;
  }
}
