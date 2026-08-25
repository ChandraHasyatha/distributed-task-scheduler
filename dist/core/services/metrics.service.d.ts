export interface SystemMetrics {
    totalJobs: number;
    queuedJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    deadLetterJobs: number;
    activeWorkers: number;
    totalQueues: number;
    avgDurationMs: number;
}
export declare class MetricsService {
    static getSystemMetrics(): Promise<SystemMetrics>;
    static getRecentThroughput(hours?: number): Promise<{
        time: string;
        completed: number;
        failed: number;
    }[]>;
}
