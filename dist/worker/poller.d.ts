import { Job } from '../core/types/index.js';
export declare class QueuePoller {
    private workerId;
    private concurrencyLimit;
    private shardId;
    private activeJobs;
    constructor(workerId: string, concurrencyLimit: number, shardId?: number);
    getActiveCount(): number;
    getAvailableCapacity(): number;
    trackJobStarted(jobId: string): void;
    trackJobFinished(jobId: string): void;
    /**
     * Polls all unpaused queues ordered by priority DESC and attempts atomic claim
     */
    pollAndClaim(): Promise<Job[]>;
}
