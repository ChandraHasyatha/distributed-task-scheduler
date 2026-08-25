import { Job } from '../types/index.js';
/**
 * WORKFLOW / DAG DEPENDENCIES
 * ===========================
 * A job created with `dependsOn: [jobIdA, jobIdB, ...]` is inserted with
 * status WAITING instead of QUEUED/SCHEDULED. It becomes eligible for
 * claiming only once every parent job reaches COMPLETED. This models a
 * directed acyclic graph of job dependencies (a lightweight workflow
 * engine) without needing an external orchestrator.
 *
 * Promotion (WAITING -> QUEUED) happens two ways:
 *  1. Eagerly, right after a parent job completes (see `onJobCompleted`),
 *     so dependents run as soon as possible.
 *  2. As a safety net, `promoteUnblockedJobs()` is called from the
 *     scheduler tick to catch anything missed by (1) (e.g. after a
 *     restart).
 */
export declare class WorkflowService {
    static addDependencies(jobId: string, dependsOnJobIds: string[]): Promise<void>;
    static getDependencyGraph(jobId: string): Promise<{
        dependsOn: Job[];
        dependents: Job[];
    }>;
    static isUnblocked(jobId: string): Promise<boolean>;
    /** Promotes any WAITING job whose parents have all completed to QUEUED. */
    static promoteUnblockedJobs(): Promise<number>;
    /** Call right after a job transitions to COMPLETED to unblock children immediately. */
    static onJobCompleted(completedJobId: string): Promise<string[]>;
}
