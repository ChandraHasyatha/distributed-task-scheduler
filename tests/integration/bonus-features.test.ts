import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { AuthService } from '../../src/core/services/auth.service.js';
import { ProjectService } from '../../src/core/services/project.service.js';
import { QueueService } from '../../src/core/services/queue.service.js';
import { JobService } from '../../src/core/services/job.service.js';
import { WorkerService } from '../../src/core/services/worker.service.js';
import { JobExecutor } from '../../src/worker/executor.js';
import { DlqService } from '../../src/core/services/dlq.service.js';
import { WorkflowService } from '../../src/core/services/workflow.service.js';
import { LockService } from '../../src/core/services/lock.service.js';
import { AiSummaryService } from '../../src/core/services/ai-summary.service.js';
import { WebhookService } from '../../src/core/services/webhook.service.js';
import { requireRole } from '../../src/api/middleware/rbac.middleware.js';
import { initMemoryDatabase } from '../../src/core/db/client.js';

describe('Bonus Features: Workflow, Locking, RBAC, AI Summaries, Sharding', () => {
  let projectId: string;
  let workerId: string;

  beforeAll(async () => {
    initMemoryDatabase();

    const { organization } = await AuthService.registerUserWithOrg({
      email: 'bonus@example.com',
      password: 'Password123!',
      fullName: 'Bonus Tester',
      orgName: 'Bonus Testing Org',
    });

    const project = await ProjectService.createProject({
      organizationId: organization.id,
      name: 'Bonus Features Project',
    });
    projectId = project.id;

    const worker = await WorkerService.registerWorker({
      hostname: 'bonus-test-worker',
      pid: 5678,
      concurrencyLimit: 10,
    });
    workerId = worker.id;
  });

  describe('Workflow / DAG dependencies', () => {
    it('creates a dependent job as WAITING and blocks it from being claimed', async () => {
      const queue = await QueueService.createQueue({ projectId, name: 'dag-queue', concurrencyLimit: 10 });

      const parent = await JobService.enqueueJob({ queueId: queue.id, jobType: 'STEP_ONE' });
      const child = await JobService.enqueueJob({
        queueId: queue.id,
        jobType: 'STEP_TWO',
        dependsOn: [parent.id],
      });

      expect(child.status).toBe('WAITING');

      // Claiming should only ever pick up the parent — the child is not
      // eligible while WAITING (claim query filters status = 'QUEUED').
      const claimed = await WorkerService.claimJobsFromQueue({ workerId, queueId: queue.id, capacity: 10 });
      expect(claimed.map((j) => j.id)).toContain(parent.id);
      expect(claimed.map((j) => j.id)).not.toContain(child.id);
    });

    it('promotes a WAITING job to QUEUED once its dependency completes', async () => {
      const queue = await QueueService.createQueue({ projectId, name: 'dag-promote-queue', concurrencyLimit: 10 });

      const parent = await JobService.enqueueJob({ queueId: queue.id, jobType: 'SIMULATE_SUCCESS' });
      const child = await JobService.enqueueJob({
        queueId: queue.id,
        jobType: 'STEP_TWO',
        dependsOn: [parent.id],
      });
      expect(child.status).toBe('WAITING');

      const [claimedParent] = await WorkerService.claimJobsFromQueue({ workerId, queueId: queue.id, capacity: 1 });
      await JobExecutor.execute(claimedParent, workerId);

      const refreshedChild = await JobService.getJobById(child.id);
      expect(refreshedChild?.status).toBe('QUEUED');

      const isUnblocked = await WorkflowService.isUnblocked(child.id);
      expect(isUnblocked).toBe(true);
    });

    it('reports the dependency graph for a job', async () => {
      const queue = await QueueService.createQueue({ projectId, name: 'dag-graph-queue', concurrencyLimit: 10 });
      const parent = await JobService.enqueueJob({ queueId: queue.id, jobType: 'A' });
      const child = await JobService.enqueueJob({ queueId: queue.id, jobType: 'B', dependsOn: [parent.id] });

      const parentGraph = await WorkflowService.getDependencyGraph(parent.id);
      expect(parentGraph.dependents.map((j) => j.id)).toContain(child.id);

      const childGraph = await WorkflowService.getDependencyGraph(child.id);
      expect(childGraph.dependsOn.map((j) => j.id)).toContain(parent.id);
    });
  });

  describe('Distributed locking', () => {
    it('allows only one holder to acquire a lock key at a time', async () => {
      const first = await LockService.tryAcquire('test:critical-section', 'holder-a');
      const second = await LockService.tryAcquire('test:critical-section', 'holder-b');

      expect(first).toBe(true);
      expect(second).toBe(false);

      await LockService.release('test:critical-section');

      const third = await LockService.tryAcquire('test:critical-section', 'holder-c');
      expect(third).toBe(true);
      await LockService.release('test:critical-section');
    });

    it('withLock runs the callback only when the lock is acquired, and always releases', async () => {
      let ran = false;
      const result = await LockService.withLock('test:with-lock', 'holder-a', async () => {
        ran = true;
        return 42;
      });

      expect(ran).toBe(true);
      expect(result).toBe(42);

      // Lock should be released afterward — a second acquire must succeed.
      const reacquired = await LockService.tryAcquire('test:with-lock', 'holder-b');
      expect(reacquired).toBe(true);
      await LockService.release('test:with-lock');
    });
  });

  describe('RBAC (role-based access control)', () => {
    it('ranks VIEWER < MEMBER < ADMIN and blocks under-privileged roles', async () => {
      const adminGuard = requireRole('ADMIN');

      const makeMockRequestReply = (role: string) => {
        let statusCode: number | null = null;
        let payload: any = null;
        const reply: any = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(body: any) {
            payload = body;
            return payload;
          },
        };
        const request: any = { user: { role } };
        return { request, reply, getResult: () => ({ statusCode, payload }) };
      };

      const viewerAttempt = makeMockRequestReply('VIEWER');
      await adminGuard(viewerAttempt.request, viewerAttempt.reply);
      expect(viewerAttempt.getResult().statusCode).toBe(403);

      const adminAttempt = makeMockRequestReply('ADMIN');
      const result = await adminGuard(adminAttempt.request, adminAttempt.reply);
      expect(result).toBeUndefined(); // no reply sent = allowed through
    });
  });

  describe('AI-generated failure summaries', () => {
    it('generates a heuristic summary explaining a timeout failure', async () => {
      const queue = await QueueService.createQueue({ projectId, name: 'ai-summary-queue', concurrencyLimit: 10 });
      const job = await JobService.enqueueJob({
        queueId: queue.id,
        jobType: 'SIMULATE_FAILURE',
        payload: { errorMessage: 'Execution timed out after 30000ms' },
        maxAttempts: 1,
      });

      const [claimed] = await WorkerService.claimJobsFromQueue({ workerId, queueId: queue.id, capacity: 1 });
      await JobExecutor.execute(claimed, workerId);

      // Give the fire-and-forget AI summary a tick to complete.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dlqList = await DlqService.listDlq({ queueId: queue.id });
      expect(dlqList.entries.length).toBe(1);
      expect(dlqList.entries[0].ai_summary).toBeTruthy();
      expect(dlqList.entries[0].ai_summary?.toLowerCase()).toContain('timeout');
    });

    it('summarizeFailure writes the summary directly onto the DLQ entry', async () => {
      const queue = await QueueService.createQueue({ projectId, name: 'ai-direct-queue', concurrencyLimit: 10 });
      const job = await JobService.enqueueJob({
        queueId: queue.id,
        jobType: 'SIMULATE_FAILURE',
        payload: { errorMessage: 'ECONNREFUSED connecting to downstream' },
        maxAttempts: 1,
      });
      const [claimed] = await WorkerService.claimJobsFromQueue({ workerId, queueId: queue.id, capacity: 1 });
      await JobExecutor.execute(claimed, workerId);

      const dlqList = await DlqService.listDlq({ queueId: queue.id });
      const entry = dlqList.entries[0];

      const summary = await AiSummaryService.summarizeFailure({
        dlqId: entry.id,
        jobType: 'SIMULATE_FAILURE',
        payload: {},
        failedReason: entry.failed_reason,
        totalAttempts: entry.total_attempts,
      });

      expect(summary.toLowerCase()).toMatch(/connect|network|downstream/);

      const refreshed = await DlqService.getDlqEntry(entry.id);
      expect(refreshed?.ai_summary).toBe(summary);
      expect(refreshed?.ai_summary_generated_at).not.toBeNull();
    });
  });

  describe('Queue sharding', () => {
    it('only claims jobs whose hash matches the requesting shard', async () => {
      const queue = await QueueService.createQueue({
        projectId,
        name: 'sharded-queue',
        concurrencyLimit: 50,
        shardCount: 4,
      });

      for (let i = 0; i < 20; i++) {
        await JobService.enqueueJob({ queueId: queue.id, jobType: 'SHARD_TEST', payload: { i } });
      }

      const claimedByShard: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      for (let shard = 0; shard < 4; shard++) {
        const claimed = await WorkerService.claimJobsFromQueue({
          workerId,
          queueId: queue.id,
          capacity: 50,
          shardId: shard,
        });
        claimedByShard[shard] = claimed.length;
      }

      const total = Object.values(claimedByShard).reduce((a, b) => a + b, 0);
      expect(total).toBe(20);
      // With 4 shards over 20 jobs, expect the work to be spread across
      // more than one shard (extremely unlikely all 20 land in one shard).
      const shardsUsed = Object.values(claimedByShard).filter((n) => n > 0).length;
      expect(shardsUsed).toBeGreaterThan(1);
    });
  });

  describe('Event-driven execution (webhooks)', () => {
    it('verifies HMAC signatures and rejects tampered payloads', () => {
      const secret = 'test-secret-key';
      const body = JSON.stringify({ event: 'deploy.completed' });
      const validSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');

      expect(WebhookService.verifySignature(secret, body, validSignature)).toBe(true);
      expect(WebhookService.verifySignature(secret, body, 'wrong-signature-wrong-signature-wrong')).toBe(false);
      expect(WebhookService.verifySignature(secret, body, undefined)).toBe(false);
    });

    it('fires a trigger and immediately enqueues a QUEUED job', async () => {
      const queue = await QueueService.createQueue({ projectId, name: 'webhook-queue', concurrencyLimit: 10 });
      const trigger = await WebhookService.createTrigger({
        projectId,
        queueId: queue.id,
        name: 'deploy-hook',
        jobType: 'POST_DEPLOY_TASK',
      });

      const jobId = await WebhookService.fire(trigger, { deployId: 'abc123' });
      const job = await JobService.getJobById(jobId);

      expect(job?.status).toBe('QUEUED');
      expect(job?.job_type).toBe('POST_DEPLOY_TASK');

      const refreshedTrigger = await WebhookService.getTrigger(trigger.id);
      expect(refreshedTrigger?.total_triggers).toBe(1);
      expect(refreshedTrigger?.last_triggered_at).not.toBeNull();
    });
  });
});
