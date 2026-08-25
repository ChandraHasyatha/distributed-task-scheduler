-- Distributed Job Scheduler Database Schema
-- Version: 002_bonus_features.sql
-- Adds support for: Workflow/DAG dependencies, AI failure summaries,
-- event-driven webhooks, queue sharding metadata, and RBAC audit trail.

-- ==========================================
-- 1. WORKFLOW / DAG DEPENDENCIES
-- ==========================================
-- A job may depend on one or more other jobs completing successfully
-- before it becomes eligible for claiming. This models a directed
-- acyclic graph (DAG) of job dependencies within a queue/project.
CREATE TABLE IF NOT EXISTS job_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    depends_on_job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_job_dependency UNIQUE (job_id, depends_on_job_id),
    CONSTRAINT chk_no_self_dependency CHECK (job_id <> depends_on_job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_dependencies_job_id ON job_dependencies (job_id);
CREATE INDEX IF NOT EXISTS idx_job_dependencies_depends_on ON job_dependencies (depends_on_job_id);

-- NOTE: the 'WAITING' job status (used for jobs blocked on unmet
-- dependencies) is defined directly on the `jobs.status` CHECK
-- constraint in 001_init.sql rather than altered here, since ALTER
-- TABLE ... DROP/ADD CONSTRAINT on an unnamed inline CHECK is brittle
-- across Postgres versions/tools (the auto-generated constraint name
-- isn't guaranteed) and this schema hasn't shipped to production yet.

-- ==========================================
-- 2. AI-GENERATED FAILURE SUMMARIES
-- ==========================================
ALTER TABLE dead_letter_queue ADD COLUMN IF NOT EXISTS ai_summary TEXT NULL;
ALTER TABLE dead_letter_queue ADD COLUMN IF NOT EXISTS ai_summary_generated_at TIMESTAMPTZ NULL;

-- ==========================================
-- 3. EVENT-DRIVEN EXECUTION (WEBHOOKS)
-- ==========================================
-- External systems can register a webhook trigger that enqueues a job
-- the instant a POST is received, instead of waiting on the poll loop.
CREATE TABLE IF NOT EXISTS webhook_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    signing_secret VARCHAR(255) NOT NULL,
    job_type VARCHAR(100) NOT NULL,
    default_priority INT NOT NULL DEFAULT 10,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    total_triggers INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_triggered_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_triggers_project ON webhook_triggers (project_id);

-- ==========================================
-- 4. QUEUE SHARDING
-- ==========================================
-- Workers can be assigned to a shard so that a single logical queue's
-- claimable-job set is horizontally partitioned across worker pools.
-- Sharding is computed at claim-time via hashtext(job.id) % shard_count,
-- so no column is required on `jobs`; we only track shard config on the queue.
ALTER TABLE queues ADD COLUMN IF NOT EXISTS shard_count INT NOT NULL DEFAULT 1 CHECK (shard_count >= 1);

-- Workers advertise which shard(s) they serve.
ALTER TABLE workers ADD COLUMN IF NOT EXISTS shard_id INT NOT NULL DEFAULT 0 CHECK (shard_id >= 0);

-- ==========================================
-- 5. DISTRIBUTED LOCKING (audit trail)
-- ==========================================
-- Actual mutual exclusion uses Postgres advisory locks (pg_try_advisory_lock),
-- which require no table. This table is a lightweight observability log so
-- the dashboard/tests can show which process currently holds which lock.
CREATE TABLE IF NOT EXISTS distributed_lock_log (
    id BIGSERIAL PRIMARY KEY,
    lock_key VARCHAR(255) NOT NULL,
    holder VARCHAR(255) NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_distributed_lock_log_key ON distributed_lock_log (lock_key, acquired_at DESC);

-- ==========================================
-- 6. RBAC AUDIT TRAIL
-- ==========================================
-- Tracks privileged actions (queue pause/resume/delete, DLQ purge, etc.)
-- so ADMIN-only mutations are auditable.
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    role_at_time VARCHAR(50) NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255) NULL,
    metadata JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id, created_at DESC);
