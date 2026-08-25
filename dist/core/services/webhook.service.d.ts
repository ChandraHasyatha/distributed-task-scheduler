import { WebhookTrigger } from '../types/index.js';
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
export declare class WebhookService {
    static createTrigger(params: {
        projectId: string;
        queueId: string;
        name: string;
        jobType: string;
        defaultPriority?: number;
    }): Promise<WebhookTrigger>;
    static listTriggers(projectId: string): Promise<WebhookTrigger[]>;
    static getTrigger(id: string): Promise<WebhookTrigger | null>;
    static verifySignature(secret: string, rawBody: string, signature: string | undefined): boolean;
    /**
     * Fires the trigger: enqueues a job immediately (bypassing the poll
     * interval entirely — a worker's next poll tick, or a live SKIP LOCKED
     * claim, will pick it up right away since it's inserted as QUEUED) and
     * publishes a realtime event so the dashboard reflects it instantly too.
     */
    static fire(trigger: WebhookTrigger, eventPayload: Record<string, any>): Promise<string>;
}
