import { query, withTransaction } from '../db/client.js';
import { WorkflowService } from './workflow.service.js';
import { eventBus } from '../events/event-bus.js';
export class JobService {
    static async enqueueJob(params) {
        const { queueId, jobType, payload = {}, priority = 10, idempotencyKey = null, delayMs, runAt: scheduledRunAt, maxAttempts, timeoutMs = 30000, retryPolicyId, dependsOn = [], } = params;
        if (idempotencyKey) {
            const existing = await query('SELECT * FROM jobs WHERE queue_id = $1 AND idempotency_key = $2', [queueId, idempotencyKey]);
            if (existing.rows.length > 0) {
                return existing.rows[0];
            }
        }
        let status = 'QUEUED';
        let targetRunAt = new Date();
        if (delayMs && delayMs > 0) {
            status = 'SCHEDULED';
            targetRunAt = new Date(Date.now() + delayMs);
        }
        else if (scheduledRunAt && scheduledRunAt.getTime() > Date.now()) {
            status = 'SCHEDULED';
            targetRunAt = scheduledRunAt;
        }
        // WORKFLOW/DAG: a job with unmet dependencies starts WAITING and is
        // promoted to QUEUED once every parent job completes (see
        // WorkflowService.onJobCompleted / promoteUnblockedJobs).
        if (dependsOn.length > 0) {
            status = 'WAITING';
        }
        let effectiveMaxAttempts = maxAttempts ?? 3;
        let effectiveRetryPolicyId = retryPolicyId ?? null;
        if (!maxAttempts || !retryPolicyId) {
            const qRes = await query(`SELECT q.retry_policy_id, r.max_attempts
         FROM queues q
         LEFT JOIN retry_policies r ON q.retry_policy_id = r.id
         WHERE q.id = $1`, [queueId]);
            if (qRes.rows.length > 0) {
                if (!retryPolicyId && qRes.rows[0].retry_policy_id) {
                    effectiveRetryPolicyId = qRes.rows[0].retry_policy_id;
                }
                if (!maxAttempts && qRes.rows[0].max_attempts) {
                    effectiveMaxAttempts = qRes.rows[0].max_attempts;
                }
            }
        }
        const res = await query(`INSERT INTO jobs (
        queue_id, retry_policy_id, idempotency_key, job_type, payload,
        priority, status, max_attempts, attempt_count, run_at, timeout_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)
      RETURNING *`, [
            queueId,
            effectiveRetryPolicyId,
            idempotencyKey,
            jobType,
            JSON.stringify(payload),
            priority,
            status,
            effectiveMaxAttempts,
            targetRunAt.toISOString(),
            timeoutMs,
        ]);
        const job = res.rows[0];
        if (dependsOn.length > 0) {
            await WorkflowService.addDependencies(job.id, dependsOn);
            // Re-check in case all parents already completed by the time we got here.
            const unblocked = await WorkflowService.isUnblocked(job.id);
            if (unblocked) {
                await query(`UPDATE jobs SET status = 'QUEUED' WHERE id = $1`, [job.id]);
                job.status = 'QUEUED';
            }
        }
        eventBus.publish('JOB_CREATED', { jobId: job.id, queueId: job.queue_id, status: job.status, jobType: job.job_type });
        return job;
    }
    static async enqueueBatch(queueId, jobs) {
        return withTransaction(async (client) => {
            const results = [];
            for (const item of jobs) {
                let status = 'QUEUED';
                let targetRunAt = new Date();
                if (item.delayMs && item.delayMs > 0) {
                    status = 'SCHEDULED';
                    targetRunAt = new Date(Date.now() + item.delayMs);
                }
                else if (item.runAt && item.runAt.getTime() > Date.now()) {
                    status = 'SCHEDULED';
                    targetRunAt = item.runAt;
                }
                const res = await client.query(`INSERT INTO jobs (
            queue_id, retry_policy_id, idempotency_key, job_type, payload,
            priority, status, max_attempts, attempt_count, run_at, timeout_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)
          RETURNING *`, [
                    queueId,
                    item.retryPolicyId || null,
                    item.idempotencyKey || null,
                    item.jobType,
                    JSON.stringify(item.payload || {}),
                    item.priority || 10,
                    status,
                    item.maxAttempts || 3,
                    targetRunAt.toISOString(),
                    item.timeoutMs || 30000,
                ]);
                results.push(res.rows[0]);
            }
            return results;
        });
    }
    static async getJobById(id) {
        const res = await query('SELECT * FROM jobs WHERE id = $1', [id]);
        return res.rows[0] || null;
    }
    static async listJobs(params) {
        const { queueId, status, jobType, search, limit = 20, offset = 0 } = params;
        const conditions = [];
        const values = [];
        let idx = 1;
        if (queueId) {
            conditions.push(`queue_id = $${idx++}`);
            values.push(queueId);
        }
        if (status) {
            conditions.push(`status = $${idx++}`);
            values.push(status);
        }
        if (jobType) {
            conditions.push(`job_type = $${idx++}`);
            values.push(jobType);
        }
        if (search) {
            conditions.push(`(job_type ILIKE $${idx} OR payload::text ILIKE $${idx})`);
            values.push(`%${search}%`);
            idx++;
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const countRes = await query(`SELECT COUNT(*) as count FROM jobs ${whereClause}`, values);
        const total = parseInt(countRes.rows[0]?.count || '0', 10);
        const dataRes = await query(`SELECT * FROM jobs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);
        return { jobs: dataRes.rows, total };
    }
    static async cancelJob(id) {
        const res = await query(`UPDATE jobs
       SET status = 'CANCELLED', completed_at = NOW()
       WHERE id = $1 AND status IN ('QUEUED', 'SCHEDULED', 'WAITING')
       RETURNING *`, [id]);
        if (res.rows[0]) {
            eventBus.publish('JOB_UPDATED', { jobId: id, status: 'CANCELLED' });
        }
        return res.rows[0] || null;
    }
    static async getJobExecutions(jobId) {
        const res = await query('SELECT * FROM job_executions WHERE job_id = $1 ORDER BY attempt_number ASC', [jobId]);
        return res.rows;
    }
    static async getExecutionLogs(executionId) {
        const res = await query('SELECT * FROM job_logs WHERE job_execution_id = $1 ORDER BY logged_at ASC', [executionId]);
        return res.rows;
    }
}
//# sourceMappingURL=job.service.js.map