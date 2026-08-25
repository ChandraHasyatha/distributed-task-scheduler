-- Distributed Job Scheduler Database Schema
-- Version: 001_init.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Organization Memberships (Multi-tenancy mapping)
CREATE TABLE IF NOT EXISTS organization_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ADMIN', 'MEMBER', 'VIEWER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_org_user UNIQUE (organization_id, user_id)
);

-- 4. Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_org_project_slug UNIQUE (organization_id, slug)
);

-- 5. Retry Policies
CREATE TABLE IF NOT EXISTS retry_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    strategy VARCHAR(50) NOT NULL CHECK (strategy IN ('FIXED', 'LINEAR', 'EXPONENTIAL')),
    max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
    initial_interval_ms INT NOT NULL DEFAULT 1000 CHECK (initial_interval_ms >= 0),
    max_interval_ms INT NOT NULL DEFAULT 60000 CHECK (max_interval_ms >= initial_interval_ms),
    backoff_factor NUMERIC(4,2) NOT NULL DEFAULT 2.0 CHECK (backoff_factor >= 1.0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Queues
CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    retry_policy_id UUID REFERENCES retry_policies(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    priority INT NOT NULL DEFAULT 10 CHECK (priority >= 1),
    concurrency_limit INT NOT NULL DEFAULT 5 CHECK (concurrency_limit >= 1),
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_queue_name UNIQUE (project_id, name)
);

-- 7. Workers
CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname VARCHAR(255) NOT NULL,
    pid INT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'DRAINING', 'OFFLINE')),
    concurrency_limit INT NOT NULL DEFAULT 5 CHECK (concurrency_limit >= 1),
    active_jobs_count INT NOT NULL DEFAULT 0 CHECK (active_jobs_count >= 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Worker Heartbeats
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    id BIGSERIAL PRIMARY KEY,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    cpu_usage_pct NUMERIC(5,2) NULL,
    memory_usage_mb NUMERIC(8,2) NULL,
    active_jobs_count INT NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Jobs
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    retry_policy_id UUID REFERENCES retry_policies(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(255) NULL,
    job_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority INT NOT NULL DEFAULT 10 CHECK (priority >= 1),
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('WAITING', 'QUEUED', 'SCHEDULED', 'CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'CANCELLED')),
    max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
    attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    timeout_ms INT NOT NULL DEFAULT 30000 CHECK (timeout_ms >= 1000),
    locked_by UUID REFERENCES workers(id) ON DELETE SET NULL,
    locked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_queue_idempotency UNIQUE (queue_id, idempotency_key)
);

-- 10. Job Executions
CREATE TABLE IF NOT EXISTS job_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    attempt_number INT NOT NULL CHECK (attempt_number >= 1),
    status VARCHAR(50) NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'TIMED_OUT')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ NULL,
    duration_ms INT NULL,
    error_message TEXT NULL,
    error_stack TEXT NULL
);

-- 11. Job Logs
CREATE TABLE IF NOT EXISTS job_logs (
    id BIGSERIAL PRIMARY KEY,
    job_execution_id UUID NOT NULL REFERENCES job_executions(id) ON DELETE CASCADE,
    level VARCHAR(20) NOT NULL DEFAULT 'INFO' CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
    message TEXT NOT NULL,
    data JSONB NULL,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Scheduled Jobs (Recurring Cron Definitions)
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    cron_expression VARCHAR(100) NOT NULL,
    job_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ NULL,
    next_run_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Dead Letter Queue
CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    failed_reason TEXT NOT NULL,
    total_attempts INT NOT NULL,
    entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replayed_at TIMESTAMPTZ NULL,
    replayed_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ==========================================
-- INDEXES FOR HIGH-PERFORMANCE CLAIMING & QUERIES
-- ==========================================

-- Partial Index for high-speed job claiming
CREATE INDEX IF NOT EXISTS idx_jobs_claimable ON jobs (queue_id, priority DESC, run_at ASC, created_at ASC)
WHERE status = 'QUEUED';

-- Partial Index for in-flight active jobs per queue
CREATE INDEX IF NOT EXISTS idx_jobs_in_flight ON jobs (queue_id)
WHERE status IN ('CLAIMED', 'RUNNING');

-- Partial Index for delayed/scheduled jobs promotion
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_run_at ON jobs (run_at ASC)
WHERE status = 'SCHEDULED';

-- Index for explorer and filtering
CREATE INDEX IF NOT EXISTS idx_jobs_explorer ON jobs (queue_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_executions_job_id ON job_executions (job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_logs_execution_id ON job_logs (job_execution_id, logged_at ASC);

-- Index for scheduled cron jobs due check
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due ON scheduled_jobs (next_run_at ASC)
WHERE is_active = TRUE;

-- Index for worker heartbeat monitor & reaper
CREATE INDEX IF NOT EXISTS idx_workers_heartbeat ON workers (last_heartbeat_at ASC)
WHERE status = 'ONLINE';

CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_lookup ON worker_heartbeats (worker_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dlq_lookup ON dead_letter_queue (queue_id, entered_at DESC);
