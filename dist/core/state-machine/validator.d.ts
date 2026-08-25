import { JobStatus, ExecutionStatus } from '../types/index.js';
export declare const VALID_JOB_TRANSITIONS: Record<JobStatus, JobStatus[]>;
export declare function canTransitionJob(from: JobStatus, to: JobStatus): boolean;
export declare function validateJobTransition(from: JobStatus, to: JobStatus): void;
export declare const VALID_EXECUTION_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]>;
export declare function canTransitionExecution(from: ExecutionStatus, to: ExecutionStatus): boolean;
