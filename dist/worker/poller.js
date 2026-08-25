import { query } from '../core/db/client.js';
import { WorkerService } from '../core/services/worker.service.js';
export class QueuePoller {
    workerId;
    concurrencyLimit;
    shardId;
    activeJobs = new Set();
    constructor(workerId, concurrencyLimit, shardId = 0) {
        this.workerId = workerId;
        this.concurrencyLimit = concurrencyLimit;
        this.shardId = shardId;
    }
    getActiveCount() {
        return this.activeJobs.size;
    }
    getAvailableCapacity() {
        return Math.max(0, this.concurrencyLimit - this.activeJobs.size);
    }
    trackJobStarted(jobId) {
        this.activeJobs.add(jobId);
    }
    trackJobFinished(jobId) {
        this.activeJobs.delete(jobId);
    }
    /**
     * Polls all unpaused queues ordered by priority DESC and attempts atomic claim
     */
    async pollAndClaim() {
        const available = this.getAvailableCapacity();
        if (available <= 0)
            return [];
        // Get active unpaused queues ordered by priority
        const queuesRes = await query('SELECT id, name, priority, concurrency_limit FROM queues WHERE is_paused = FALSE ORDER BY priority DESC');
        if (queuesRes.rows.length === 0)
            return [];
        const claimedJobs = [];
        let remainingCapacity = available;
        for (const queue of queuesRes.rows) {
            if (remainingCapacity <= 0)
                break;
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
//# sourceMappingURL=poller.js.map