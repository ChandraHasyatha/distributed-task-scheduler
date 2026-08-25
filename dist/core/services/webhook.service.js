import crypto from 'crypto';
import { query } from '../db/client.js';
import { JobService } from './job.service.js';
import { eventBus } from '../events/event-bus.js';
/**
 * EVENT-DRIVEN EXECUTION (bonus feature)
 * =======================================
 * Rather than only relying on the worker poll loop, external systems
 * (CI pipelines, upstream services, cron-less triggers) can register a
 * webhook and POST to it to enqueue a job the instant the event occurs.
 * Each webhook has a signing secret; callers must send an
 * `X-Webhook-Signature` header equal to `hmac_sha256(secret, rawBody)`
 * so triggers can't be spoofed by anyone who merely knows the URL.
 */
export class WebhookService {
    static async createTrigger(params) {
        const signingSecret = crypto.randomBytes(24).toString('hex');
        const res = await query(`INSERT INTO webhook_triggers (project_id, queue_id, name, signing_secret, job_type, default_priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`, [params.projectId, params.queueId, params.name, signingSecret, params.jobType, params.defaultPriority ?? 10]);
        return res.rows[0];
    }
    static async listTriggers(projectId) {
        const res = await query('SELECT * FROM webhook_triggers WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
        return res.rows;
    }
    static async getTrigger(id) {
        const res = await query('SELECT * FROM webhook_triggers WHERE id = $1', [id]);
        return res.rows[0] || null;
    }
    static verifySignature(secret, rawBody, signature) {
        if (!signature)
            return false;
        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        // Constant-time comparison to avoid timing attacks.
        const a = Buffer.from(expected);
        const b = Buffer.from(signature);
        if (a.length !== b.length)
            return false;
        return crypto.timingSafeEqual(a, b);
    }
    /**
     * Fires the trigger: enqueues a job immediately (bypassing the poll
     * interval entirely — a worker's next poll tick, or a live SKIP LOCKED
     * claim, will pick it up right away since it's inserted as QUEUED) and
     * publishes a realtime event so the dashboard reflects it instantly too.
     */
    static async fire(trigger, eventPayload) {
        await query(`UPDATE webhook_triggers
       SET total_triggers = total_triggers + 1, last_triggered_at = NOW()
       WHERE id = $1`, [trigger.id]);
        const job = await JobService.enqueueJob({
            queueId: trigger.queue_id,
            jobType: trigger.job_type,
            payload: { source: 'webhook', triggerId: trigger.id, event: eventPayload },
            priority: trigger.default_priority,
        });
        eventBus.publish('JOB_CREATED', {
            jobId: job.id,
            queueId: job.queue_id,
            status: job.status,
            jobType: job.job_type,
            via: 'webhook',
            triggerName: trigger.name,
        });
        return job.id;
    }
}
//# sourceMappingURL=webhook.service.js.map