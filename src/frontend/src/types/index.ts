export type UserRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  fullName: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface OrganizationMembership {
  id: string;
  organization_id: string;
  organization_name: string;
  role: UserRole;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface QueueStats {
  total_jobs: number;
  queued_jobs: number;
  running_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  dead_letter_jobs: number;
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
  created_at: string;
  stats?: QueueStats;
}

export type JobStatus =
  | 'WAITING'
  | 'QUEUED'
  | 'SCHEDULED'
  | 'CLAIMED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'DEAD_LETTER'
  | 'CANCELLED';

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
  run_at: string;
  timeout_ms: number;
  locked_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  executions?: JobExecution[];
}

export interface JobExecution {
  id: string;
  job_id: string;
  worker_id: string | null;
  attempt_number: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMED_OUT';
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  error_stack: string | null;
}
export interface JobLog {
  id: number;
  job_execution_id: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  data: Record<string, any> | null;
  logged_at: string;
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
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
}

export interface DeadLetterEntry {
  id: string;
  job_id: string;
  queue_id: string;
  job_type: string;
  payload: Record<string, any>;
  failed_reason: string;
  total_attempts: number;
  entered_at: string;
  replayed_at: string | null;
  ai_summary: string | null;
  ai_summary_generated_at: string | null;
}

export interface Worker {
  id: string;
  hostname: string;
  pid: number;
  status: 'ONLINE' | 'DRAINING' | 'OFFLINE';
  concurrency_limit: number;
  active_jobs_count: number;
  shard_id: number;
  started_at: string;
  last_heartbeat_at: string;
}

// WORKFLOW / DAG (bonus feature)
export interface JobDependencyGraph {
  dependsOn: Job[];
  dependents: Job[];
}

// EVENT-DRIVEN EXECUTION (bonus feature)
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
  created_at: string;
  last_triggered_at: string | null;
}

// DISTRIBUTED LOCKING (bonus feature)
export interface DistributedLock {
  id: number;
  lock_key: string;
  holder: string;
  acquired_at: string;
  released_at: string | null;
}

// WEBSOCKET LIVE UPDATES (bonus feature)
export type RealtimeEventType =
  | 'JOB_CREATED'
  | 'JOB_UPDATED'
  | 'QUEUE_UPDATED'
  | 'WORKER_UPDATED'
  | 'DLQ_UPDATED'
  | 'SCHEDULE_TRIGGERED'
  | 'HELLO';

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload: Record<string, any>;
  timestamp: string;
}

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
