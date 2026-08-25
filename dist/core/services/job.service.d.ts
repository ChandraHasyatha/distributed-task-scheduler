import { Job, JobExecution, JobLog, JobStatus } from '../types/index.js';
export interface EnqueueJobParams {
    queueId: string;
    jobType: string;
    payload?: Record<string, any>;
    priority?: number;
    idempotencyKey?: string;
    delayMs?: number;
    runAt?: Date;
    maxAttempts?: number;
    timeoutMs?: number;
    retryPolicyId?: string;
    /** WORKFLOW/DAG (bonus feature): job IDs that must reach COMPLETED before
     *  this job becomes claimable. When provided, the job is created in
     *  WAITING status instead of QUEUED/SCHEDULED. */
    dependsOn?: string[];
}
export declare class JobService {
    static enqueueJob(params: EnqueueJobParams): Promise<Job>;
    static enqueueBatch(queueId: string, jobs: Omit<EnqueueJobParams, 'queueId'>[]): Promise<Job[]>;
    static getJobById(id: string): Promise<Job | null>;
    static listJobs(params: {
        queueId?: string;
        status?: JobStatus;
        jobType?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        jobs: Job[];
        total: number;
    }>;
    static cancelJob(id: string): Promise<Job | null>;
    static getJobExecutions(jobId: string): Promise<JobExecution[]>;
    static getExecutionLogs(executionId: string): Promise<JobLog[]>;
}
