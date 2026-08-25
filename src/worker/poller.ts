import { query } from '../core/db/client.js';
import { WorkerService } from '../core/services/worker.service.js';
import { Job, Queue } from '../core/types/index.js';
import { logger } from '../core/logger/index.js';

export class QueuePoller {
  private workerId: string;
  private concurrencyLimit: number;
  private shardId: number;
  private activeJobs: Set<string> = new Set();

  constructor(workerId: string, concurrencyLimit: number, shardId: number = 0) {
    this.workerId = workerId;
    this.concurrencyLimit = concurrencyLimit;
    this.shardId = shardId;
  }

  getActiveCount(): number {
    return this.activeJobs.size;
  }

  getAvailableCapacity(): number {
    return Math.max(0, this.concurrencyLimit - this.activeJobs.size);
  }

  trackJobStarted(jobId: string): void {
    this.activeJobs.add(jobId);
  }

  trackJobFinished(jobId: string): void {
    this.activeJobs.delete(jobId);
  }

  /**
   * Polls all unpaused queues ordered by priority DESC and attempts atomic claim
   */
  async pollAndClaim(): Promise<Job[]> {
    const available = this.getAvailableCapacity();
    if (available <= 0) return [];

    // Get active unpaused queues ordered by priority
    const queuesRes = await query<Queue>(
      'SELECT id, name, priority, concurrency_limit FROM queues WHERE is_paused = FALSE ORDER BY priority DESC'
    );

    if (queuesRes.rows.length === 0) return [];

    const claimedJobs: Job[] = [];
    let remainingCapacity = available;

    for (const queue of queuesRes.rows) {
      if (remainingCapacity <= 0) break;

      const jobs = await WorkerService.claimJobsFromQueueAndNotify({
        workerId: this.workerId,
        queueId: queue.id,
        capacity: remainingCapacity,
        shardId: this.shardId,
      });

      if (jobs.length > 0) {
        claimedJobs.push(...jobs);
        remainingCapacity -= jobs.length;
      }
    }

    return claimedJobs;
  }
}
