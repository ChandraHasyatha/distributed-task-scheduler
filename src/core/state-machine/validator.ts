import { JobStatus, ExecutionStatus } from '../types/index.js';

export const VALID_JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  // WAITING: a job with unmet workflow/DAG dependencies (see WorkflowService).
  // Promoted to QUEUED once all parent jobs COMPLETE, or CANCELLED directly.
  WAITING: ['QUEUED', 'CANCELLED'],
  QUEUED: ['CLAIMED', 'CANCELLED'],
  SCHEDULED: ['QUEUED', 'CANCELLED'],
  CLAIMED: ['RUNNING', 'FAILED', 'QUEUED'], // QUEUED if orphaned/recovered
  RUNNING: ['COMPLETED', 'FAILED', 'DEAD_LETTER'],
  FAILED: ['SCHEDULED', 'QUEUED', 'DEAD_LETTER'],
  DEAD_LETTER: ['QUEUED'], // Manual replay moves back to QUEUED
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  const allowed = VALID_JOB_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function validateJobTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransitionJob(from, to)) {
    throw new Error(`Invalid job state transition from '${from}' to '${to}'`);
  }
}

export const VALID_EXECUTION_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  RUNNING: ['COMPLETED', 'FAILED', 'TIMED_OUT'],
  COMPLETED: [],
  FAILED: [],
  TIMED_OUT: [],
};

export function canTransitionExecution(from: ExecutionStatus, to: ExecutionStatus): boolean {
  const allowed = VALID_EXECUTION_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
