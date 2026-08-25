import { Job } from '../core/types/index.js';
export declare class JobExecutor {
    static execute(job: Job, workerId: string): Promise<void>;
    private static runTaskWithTimeout;
    private static dispatchTaskHandler;
    private static handleJobFailure;
    static appendLog(executionId: string, level: string, message: string, data?: any): Promise<void>;
}
