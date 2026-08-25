export type UserRole = 'ADMIN' | 'MEMBER' | 'VIEWER';
export interface User {
    id: string;
    email: string;
    password_hash: string;
    full_name: string;
    created_at: Date;
    updated_at: Date;
}
export interface Organization {
    id: string;
    name: string;
    slug: string;
    created_at: Date;
    updated_at: Date;
}
export interface OrganizationMembership {
    id: string;
    organization_id: string;
    user_id: string;
    role: UserRole;
    created_at: Date;
    updated_at: Date;
}
export interface Project {
    id: string;
    organization_id: string;
    name: string;
    slug: string;
    created_at: Date;
    updated_at: Date;
}
export type RetryStrategy = 'FIXED' | 'LINEAR' | 'EXPONENTIAL';
export interface RetryPolicy {
    id: string;
    project_id: string;
    name: string;
    strategy: RetryStrategy;
    max_attempts: number;
    initial_interval_ms: number;
    max_interval_ms: number;
    backoff_factor: number;
    created_at: Date;
}
export interface Queue {
    id: string;
    project_id: string;
    retry_policy_id: string | null;
    name: string;
    priority: number;
    concurrency_limit: number;
    is_paused: boolean;
    shard_count: number;
    created_at: Date;
    updated_at: Date;
    stats?: QueueStats;
}
export interface QueueStats {
    total_jobs: number;
    queued_jobs: number;
    running_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    dead_letter_jobs: number;
}
export type JobStatus = 'WAITING' | 'QUEUED' | 'SCHEDULED' | 'CLAIMED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER' | 'CANCELLED';
export interface Job {
    id: string;
    queue_id: string;
    retry_policy_id: string | null;
    idempotency_key: string | null;
    job_type: string;
    payload: Record<string, any>;
    priority: number;
    status: JobStatus;
    max_attempts: number;
    attempt_count: number;
    run_at: Date;
    timeout_ms: number;
    locked_by: string | null;
    locked_at: Date | null;
    created_at: Date;
    started_at: Date | null;
    completed_at: Date | null;
}
export type ExecutionStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMED_OUT';
export interface JobExecution {
    id: string;
    job_id: string;
    worker_id: string | null;
    attempt_number: number;
    status: ExecutionStatus;
    started_at: Date;
    finished_at: Date | null;
    duration_ms: number | null;
    error_message: string | null;
    error_stack: string | null;
}
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export interface JobLog {
    id: number;
    job_execution_id: string;
    level: LogLevel;
    message: string;
    data: Record<string, any> | null;
    logged_at: Date;
}
export interface ScheduledJob {
    id: string;
    project_id: string;
    queue_id: string;
    name: string;
    cron_expression: string;
    job_type: string;
    payload: Record<string, any>;
    timezone: string;
    is_active: boolean;
    last_run_at: Date | null;
    next_run_at: Date;
    created_at: Date;
}
export interface DeadLetterEntry {
    id: string;
    job_id: string;
    queue_id: string;
    failed_reason: string;
    total_attempts: number;
    entered_at: Date;
    replayed_at: Date | null;
    replayed_by: string | null;
    ai_summary: string | null;
    ai_summary_generated_at: Date | null;
    job?: Job;
}
export interface JobDependency {
    id: string;
    job_id: string;
    depends_on_job_id: string;
    created_at: Date;
}
export interface WebhookTrigger {
    id: string;
    project_id: string;
    queue_id: string;
    name: string;
    signing_secret: string;
    job_type: string;
    default_priority: number;
    is_active: boolean;
    total_triggers: number;
    created_at: Date;
    last_triggered_at: Date | null;
}
export type WorkerStatus = 'ONLINE' | 'DRAINING' | 'OFFLINE';
export interface Worker {
    id: string;
    hostname: string;
    pid: number;
    status: WorkerStatus;
    concurrency_limit: number;
    active_jobs_count: number;
    shard_id: number;
    started_at: Date;
    last_heartbeat_at: Date;
}
export interface WorkerHeartbeat {
    id: number;
    worker_id: string;
    cpu_usage_pct: number | null;
    memory_usage_mb: number | null;
    active_jobs_count: number;
    timestamp: Date;
}
export interface AuthTokenPayload {
    userId: string;
    email: string;
    organizationId?: string;
    role?: UserRole;
}
