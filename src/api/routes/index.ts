import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../../core/services/auth.service.js';
import { ProjectService } from '../../core/services/project.service.js';
import { QueueService } from '../../core/services/queue.service.js';
import { JobService } from '../../core/services/job.service.js';
import { SchedulerService } from '../../core/services/scheduler.service.js';
import { WorkerService } from '../../core/services/worker.service.js';
import { DlqService } from '../../core/services/dlq.service.js';
import { MetricsService } from '../../core/services/metrics.service.js';
import { WorkflowService } from '../../core/services/workflow.service.js';
import { WebhookService } from '../../core/services/webhook.service.js';
import { LockService } from '../../core/services/lock.service.js';
import { AiSummaryService } from '../../core/services/ai-summary.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole, recordAudit } from '../middleware/rbac.middleware.js';

export async function registerRoutes(fastify: FastifyInstance) {
  // Health probes
  fastify.get('/health/live', async () => ({ status: 'UP', timestamp: new Date() }));
  fastify.get('/health/ready', async () => ({ status: 'READY', database: 'CONNECTED' }));

  // ==========================================
  // AUTHENTICATION ROUTES
  // (throttled tighter than the global rate limit to slow down
  // credential-stuffing / brute-force attempts — bonus: rate limiting)
  // ==========================================
  fastify.post('/api/v1/auth/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      fullName: z.string().min(2),
      orgName: z.string().min(2),
      orgSlug: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const { user, organization, membership } = await AuthService.registerUserWithOrg(body);

    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
      organizationId: organization.id,
      role: membership.role,
    });

    return reply.status(201).send({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, fullName: user.full_name },
        organization,
      },
    });
  });

  fastify.post('/api/v1/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });

    const body = schema.parse(request.body);
    const user = await AuthService.validateCredentials(body.email, body.password);

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    const memberships = await AuthService.getUserMemberships(user.id);
    const primaryOrg = memberships[0];

    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
      organizationId: primaryOrg?.organization_id,
      role: primaryOrg?.role || 'MEMBER',
    });

    return {
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, fullName: user.full_name },
        memberships,
      },
    };
  });

  fastify.get('/api/v1/auth/me', { preHandler: [authenticate] }, async (request) => {
    const userId = (request.user as any)?.userId;
    const user = await AuthService.getUserById(userId);
    const memberships = await AuthService.getUserMemberships(userId);
    return {
      success: true,
      data: {
        user: user ? { id: user.id, email: user.email, fullName: user.full_name } : null,
        memberships,
      },
    };
  });

  // ==========================================
  // ORGANIZATIONS & PROJECTS
  // ==========================================
  fastify.get('/api/v1/projects', { preHandler: [authenticate] }, async (request) => {
    const orgId = (request.query as any).organizationId || (request.user as any)?.organizationId;
    const projects = await ProjectService.listProjectsByOrg(orgId);
    return { success: true, data: projects };
  });

  fastify.post('/api/v1/projects', { preHandler: [authenticate] }, async (request, reply) => {
    const schema = z.object({
      organizationId: z.string().uuid().optional(),
      name: z.string().min(2),
      slug: z.string().optional(),
    });
    const body = schema.parse(request.body);
    const orgId = body.organizationId || (request.user as any)?.organizationId;
    const project = await ProjectService.createProject({
      organizationId: orgId!,
      name: body.name,
      slug: body.slug,
    });
    return reply.status(201).send({ success: true, data: project });
  });

  // ==========================================
  // QUEUES
  // ==========================================
  fastify.get('/api/v1/projects/:projectId/queues', { preHandler: [authenticate] }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    const queues = await QueueService.listQueuesByProject(projectId);
    return { success: true, data: queues };
  });

  fastify.post('/api/v1/projects/:projectId/queues', { preHandler: [authenticate, requireRole('MEMBER')] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const schema = z.object({
      name: z.string().min(2),
      priority: z.number().int().min(1).default(10),
      concurrencyLimit: z.number().int().min(1).default(5),
      retryPolicyId: z.string().uuid().optional(),
      // QUEUE SHARDING (bonus feature): partition this queue's claimable
      // jobs across N worker shards (see WorkerService.claimJobsFromQueue).
      shardCount: z.number().int().min(1).max(64).default(1),
    });
    const body = schema.parse(request.body);
    const queue = await QueueService.createQueue({
      projectId,
      name: body.name,
      priority: body.priority,
      concurrencyLimit: body.concurrencyLimit,
      retryPolicyId: body.retryPolicyId,
      shardCount: body.shardCount,
    });
    return reply.status(201).send({ success: true, data: queue });
  });

  fastify.get('/api/v1/queues/:queueId', { preHandler: [authenticate] }, async (request, reply) => {
    const { queueId } = request.params as { queueId: string };
    const queue = await QueueService.getQueueById(queueId);
    if (!queue) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Queue not found' } });
    }
    return { success: true, data: queue };
  });

  fastify.patch('/api/v1/queues/:queueId', { preHandler: [authenticate, requireRole('MEMBER')] }, async (request, reply) => {
    const { queueId } = request.params as { queueId: string };
    const schema = z.object({
      name: z.string().min(2).optional(),
      priority: z.number().int().min(1).optional(),
      concurrencyLimit: z.number().int().min(1).optional(),
      retryPolicyId: z.string().uuid().nullable().optional(),
      shardCount: z.number().int().min(1).max(64).optional(),
    });
    const body = schema.parse(request.body);
    const updated = await QueueService.updateQueue(queueId, body);
    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Queue not found' } });
    }
    return { success: true, data: updated };
  });

  // RBAC (bonus feature): pause/resume/delete are ADMIN-only since they
  // affect all jobs in the queue cluster-wide.
  fastify.post('/api/v1/queues/:queueId/pause', { preHandler: [authenticate, requireRole('ADMIN')] }, async (request, reply) => {
    const { queueId } = request.params as { queueId: string };
    const updated = await QueueService.setPaused(queueId, true);
    await recordAudit({
      userId: (request.user as any)?.userId,
      role: (request.user as any)?.role,
      action: 'QUEUE_PAUSE',
      resourceType: 'queue',
      resourceId: queueId,
    });
    return { success: true, data: updated };
  });

  fastify.post('/api/v1/queues/:queueId/resume', { preHandler: [authenticate, requireRole('ADMIN')] }, async (request, reply) => {
    const { queueId } = request.params as { queueId: string };
    const updated = await QueueService.setPaused(queueId, false);
    await recordAudit({
      userId: (request.user as any)?.userId,
      role: (request.user as any)?.role,
      action: 'QUEUE_RESUME',
      resourceType: 'queue',
      resourceId: queueId,
    });
    return { success: true, data: updated };
  });

  fastify.delete('/api/v1/queues/:queueId', { preHandler: [authenticate, requireRole('ADMIN')] }, async (request, reply) => {
    const { queueId } = request.params as { queueId: string };
    await QueueService.deleteQueue(queueId);
    await recordAudit({
      userId: (request.user as any)?.userId,
      role: (request.user as any)?.role,
      action: 'QUEUE_DELETE',
      resourceType: 'queue',
      resourceId: queueId,
    });
    return { success: true, message: 'Queue deleted successfully' };
  });

  // ==========================================
  // RETRY POLICIES
  // ==========================================
  fastify.get('/api/v1/projects/:projectId/retry-policies', { preHandler: [authenticate] }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    const policies = await QueueService.listRetryPolicies(projectId);
    return { success: true, data: policies };
  });

  fastify.post('/api/v1/projects/:projectId/retry-policies', { preHandler: [authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const schema = z.object({
      name: z.string().min(2),
      strategy: z.enum(['FIXED', 'LINEAR', 'EXPONENTIAL']),
      maxAttempts: z.number().int().min(1).default(3),
      initialIntervalMs: z.number().int().min(0).default(1000),
      maxIntervalMs: z.number().int().min(1000).default(60000),
      backoffFactor: z.number().min(1.0).default(2.0),
    });
    const body = schema.parse(request.body);
    const policy = await QueueService.createRetryPolicy({ projectId, ...body });
    return reply.status(201).send({ success: true, data: policy });
  });

  // ==========================================
  // JOBS (Immediate, Delayed, Scheduled, Batch)
  // ==========================================
  fastify.post('/api/v1/queues/:queueId/jobs', { preHandler: [authenticate] }, async (request, reply) => {
    const { queueId } = request.params as { queueId: string };
    const schema = z.object({
      jobType: z.string().min(1),
      payload: z.record(z.any()).optional(),
      priority: z.number().int().min(1).optional(),
      idempotencyKey: z.string().optional(),
      delayMs: z.number().int().min(0).optional(),
      runAt: z.string().datetime().optional(),
      maxAttempts: z.number().int().min(1).optional(),
      timeoutMs: z.number().int().min(1000).optional(),
      retryPolicyId: z.string().uuid().optional(),
      // WORKFLOW/DAG (bonus feature): job IDs this job must wait on.
      dependsOn: z.array(z.string().uuid()).optional(),
    });

    const body = schema.parse(request.body);
    const job = await JobService.enqueueJob({
      queueId,
      jobType: body.jobType,
      payload: body.payload,
      priority: body.priority,
      idempotencyKey: body.idempotencyKey,
      delayMs: body.delayMs,
      runAt: body.runAt ? new Date(body.runAt) : undefined,
      maxAttempts: body.maxAttempts,
      timeoutMs: body.timeoutMs,
      retryPolicyId: body.retryPolicyId,
      dependsOn: body.dependsOn,
    });

    return reply.status(201).send({ success: true, data: job });
  });

  // WORKFLOW/DAG (bonus feature): inspect a job's dependency graph.
  fastify.get('/api/v1/jobs/:jobId/dependencies', { preHandler: [authenticate] }, async (request) => {
    const { jobId } = request.params as { jobId: string };
    const graph = await WorkflowService.getDependencyGraph(jobId);
    return { success: true, data: graph };
  });

  fastify.post('/api/v1/queues/:queueId/jobs/batch', { preHandler: [authenticate] }, async (request, reply) => {
    const { queueId } = request.params as { queueId: string };
    const schema = z.object({
      jobs: z.array(
        z.object({
          jobType: z.string().min(1),
          payload: z.record(z.any()).optional(),
          priority: z.number().int().min(1).optional(),
          idempotencyKey: z.string().optional(),
          delayMs: z.number().int().min(0).optional(),
          runAt: z.string().datetime().optional(),
          maxAttempts: z.number().int().min(1).optional(),
          timeoutMs: z.number().int().min(1000).optional(),
        })
      ).min(1),
    });

    const body = schema.parse(request.body);
    const jobs = await JobService.enqueueBatch(
      queueId,
      body.jobs.map((j) => ({
        ...j,
        runAt: j.runAt ? new Date(j.runAt) : undefined,
      }))
    );

    return reply.status(201).send({ success: true, data: jobs });
  });

  fastify.get('/api/v1/queues/:queueId/jobs', { preHandler: [authenticate] }, async (request) => {
    const { queueId } = request.params as { queueId: string };
    const queryParams = request.query as any;
    const limit = parseInt(queryParams.limit || '20', 10);
    const offset = parseInt(queryParams.offset || '0', 10);
    const { jobs, total } = await JobService.listJobs({
      queueId,
      status: queryParams.status,
      jobType: queryParams.jobType,
      search: queryParams.search,
      limit,
      offset,
    });

    return {
      success: true,
      data: jobs,
      meta: { total, limit, offset },
    };
  });

  fastify.get('/api/v1/jobs/:jobId', { preHandler: [authenticate] }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await JobService.getJobById(jobId);
    if (!job) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }
    const executions = await JobService.getJobExecutions(jobId);
    return { success: true, data: { ...job, executions } };
  });

  fastify.post('/api/v1/jobs/:jobId/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const cancelled = await JobService.cancelJob(jobId);
    if (!cancelled) {
      return reply.status(400).send({
        success: false,
        error: { code: 'CANNOT_CANCEL', message: 'Job cannot be cancelled (not QUEUED or SCHEDULED)' },
      });
    }
    return { success: true, data: cancelled };
  });

  fastify.get('/api/v1/jobs/:jobId/executions', { preHandler: [authenticate] }, async (request) => {
    const { jobId } = request.params as { jobId: string };
    const executions = await JobService.getJobExecutions(jobId);
    return { success: true, data: executions };
  });

  fastify.get('/api/v1/executions/:executionId/logs', { preHandler: [authenticate] }, async (request) => {
    const { executionId } = request.params as { executionId: string };
    const logs = await JobService.getExecutionLogs(executionId);
    return { success: true, data: logs };
  });

  // ==========================================
  // SCHEDULED JOBS (RECURRING CRON)
  // ==========================================
  fastify.get('/api/v1/projects/:projectId/scheduled-jobs', { preHandler: [authenticate] }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    const schedules = await SchedulerService.listScheduledJobs(projectId);
    return { success: true, data: schedules };
  });

  fastify.post('/api/v1/projects/:projectId/scheduled-jobs', { preHandler: [authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const schema = z.object({
      queueId: z.string().uuid(),
      name: z.string().min(2),
      cronExpression: z.string().min(5),
      jobType: z.string().min(1),
      payload: z.record(z.any()).optional(),
      timezone: z.string().default('UTC'),
    });
    const body = schema.parse(request.body);
    const schedule = await SchedulerService.createScheduledJob({
      projectId,
      ...body,
    });
    return reply.status(201).send({ success: true, data: schedule });
  });

  fastify.patch('/api/v1/scheduled-jobs/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ isActive: z.boolean() });
    const body = schema.parse(request.body);
    const updated = await SchedulerService.toggleScheduledJob(id, body.isActive);
    return { success: true, data: updated };
  });

  fastify.delete('/api/v1/scheduled-jobs/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await SchedulerService.deleteScheduledJob(id);
    return { success: true, message: 'Scheduled job deleted' };
  });

  // ==========================================
  // DEAD LETTER QUEUE (DLQ)
  // ==========================================
  fastify.get('/api/v1/dlq', { preHandler: [authenticate] }, async (request) => {
    const queryParams = request.query as any;
    const limit = parseInt(queryParams.limit || '20', 10);
    const offset = parseInt(queryParams.offset || '0', 10);
    const { entries, total } = await DlqService.listDlq({
      queueId: queryParams.queueId,
      limit,
      offset,
    });
    return { success: true, data: entries, meta: { total, limit, offset } };
  });

  fastify.post('/api/v1/dlq/:id/retry', { preHandler: [authenticate, requireRole('MEMBER')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const replayed = await DlqService.replayJob(id, (request.user as any)?.userId);
    if (!replayed) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'DLQ entry not found' } });
    }
    await recordAudit({
      userId: (request.user as any)?.userId,
      role: (request.user as any)?.role,
      action: 'DLQ_REPLAY',
      resourceType: 'dlq_entry',
      resourceId: id,
    });
    return { success: true, data: replayed, message: 'Job successfully re-queued' };
  });

  fastify.delete('/api/v1/dlq/:id', { preHandler: [authenticate, requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as { id: string };
    await DlqService.purgeDlqEntry(id);
    await recordAudit({
      userId: (request.user as any)?.userId,
      role: (request.user as any)?.role,
      action: 'DLQ_PURGE',
      resourceType: 'dlq_entry',
      resourceId: id,
    });
    return { success: true, message: 'DLQ entry purged' };
  });

  // AI-GENERATED FAILURE SUMMARIES (bonus feature): regenerate on demand
  // (e.g. if the automatic one at DLQ-entry time used the heuristic
  // fallback and an API key has since been configured).
  fastify.post('/api/v1/dlq/:id/summarize', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await DlqService.getDlqEntry(id);
    if (!entry) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'DLQ entry not found' } });
    }
    const summary = await AiSummaryService.summarizeFailure({
      dlqId: entry.id,
      jobType: (entry as any).job_type,
      payload: (entry as any).payload,
      failedReason: entry.failed_reason,
      totalAttempts: entry.total_attempts,
    });
    return { success: true, data: { summary } };
  });

  // ==========================================
  // WEBHOOKS (EVENT-DRIVEN EXECUTION — bonus feature)
  // ==========================================
  fastify.post('/api/v1/projects/:projectId/webhooks', { preHandler: [authenticate, requireRole('MEMBER')] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const schema = z.object({
      queueId: z.string().uuid(),
      name: z.string().min(2),
      jobType: z.string().min(1),
      defaultPriority: z.number().int().min(1).optional(),
    });
    const body = schema.parse(request.body);
    const trigger = await WebhookService.createTrigger({ projectId, ...body });
    return reply.status(201).send({
      success: true,
      data: trigger,
      message: 'Save the signing_secret now — it will not be shown again in this form.',
    });
  });

  fastify.get('/api/v1/projects/:projectId/webhooks', { preHandler: [authenticate] }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    const triggers = await WebhookService.listTriggers(projectId);
    return { success: true, data: triggers };
  });

  // Public endpoint — no JWT (the caller is an external system), authenticated
  // instead via HMAC signature over the raw body using the trigger's secret.
  fastify.post('/api/v1/webhooks/:triggerId/fire', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { triggerId } = request.params as { triggerId: string };
    const trigger = await WebhookService.getTrigger(triggerId);
    if (!trigger || !trigger.is_active) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook trigger not found or inactive' } });
    }

    const signature = request.headers['x-webhook-signature'] as string | undefined;
    const rawBody = JSON.stringify(request.body ?? {});
    if (!WebhookService.verifySignature(trigger.signing_secret, rawBody, signature)) {
      return reply.status(401).send({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Missing or invalid X-Webhook-Signature' } });
    }

    const jobId = await WebhookService.fire(trigger, (request.body as any) || {});
    return reply.status(202).send({ success: true, data: { jobId }, message: 'Event received, job enqueued immediately' });
  });

  // ==========================================
  // DISTRIBUTED LOCKING (bonus feature) — observability
  // ==========================================
  fastify.get('/api/v1/locks', { preHandler: [authenticate, requireRole('ADMIN')] }, async () => {
    const locks = await LockService.getActiveLocks();
    return { success: true, data: locks };
  });

  // ==========================================
  // WORKERS & METRICS
  // ==========================================
  fastify.get('/api/v1/workers', { preHandler: [authenticate] }, async () => {
    const workers = await WorkerService.listWorkers();
    return { success: true, data: workers };
  });

  fastify.get('/api/v1/metrics/system', { preHandler: [authenticate] }, async () => {
    const metrics = await MetricsService.getSystemMetrics();
    return { success: true, data: metrics };
  });

  fastify.get('/api/v1/metrics/throughput', { preHandler: [authenticate] }, async (request) => {
    const hours = parseInt((request.query as any).hours || '24', 10);
    const throughput = await MetricsService.getRecentThroughput(hours);
    return { success: true, data: throughput };
  });
}
