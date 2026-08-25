import { Job, Worker, WorkerStatus } from '../types/index.js';
export declare class WorkerService {
    static registerWorker(params: {
        hostname?: string;
        pid?: number;
        concurrencyLimit?: number;
        shardId?: number;
    }): Promise<Worker>;
    static recordHeartbeat(params: {
        workerId: string;
        activeJobsCount: number;
        cpuUsagePct?: number;
        memoryUsageMb?: number;
    }): Promise<void>;
    static setWorkerStatus(workerId: string, status: WorkerStatus): Promise<void>;
    /**
     * ATOMIC CLAIM TRANSACTION:
     * 1. Acquires queue mutex & locks target queue row (FOR UPDATE)
     * 2. Evaluates queue concurrency limit
     * 3. Selects claimable jobs with FOR UPDATE SKIP LOCKED
     * 4. Updates claimed jobs
     */
    static claimJobsFromQueue(params: {
        workerId: string;
        queueId: string;
        capacity: number;
        shardId?: number;
    }): Promise<Job[]>;
    static claimJobsFromQueueAndNotify(params: {
        workerId: string;
        queueId: string;
        capacity: number;
        shardId?: number;
    }): Promise<Job[]>;
    static listWorkers(): Promise<Worker[]>;
}
