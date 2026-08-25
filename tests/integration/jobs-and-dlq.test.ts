import { describe, it, expect, beforeAll } from 'vitest';
import { AuthService } from '../../src/core/services/auth.service.js';
import { ProjectService } from '../../src/core/services/project.service.js';
import { QueueService } from '../../src/core/services/queue.service.js';
import { JobService } from '../../src/core/services/job.service.js';
import { WorkerService } from '../../src/core/services/worker.service.js';
import { JobExecutor } from '../../src/worker/executor.js';
import { DlqService } from '../../src/core/services/dlq.service.js';
import { initMemoryDatabase, query } from '../../src/core/db/client.js';

describe('Job Ingestion, Execution, Retries & DLQ Integration', () => {
  let projectId: string;
  let workerId: string;

  beforeAll(async () => {
    initMemoryDatabase();

    const { organization } = await AuthService.registerUserWithOrg({
      email: 'jobtest@example.com',
      password: 'Password123!',
      fullName: 'Job Tester',
      orgName: 'Job Testing Org',
    });

    const project = await ProjectService.createProject({
      organizationId: organization.id,
      name: 'Job Engine Project',
    });
    projectId = project.id;

    const worker = await WorkerService.registerWorker({
      hostname: 'test-worker-node',
      pid: 1234,
      concurrencyLimit: 5,
    });
    workerId = worker.id;
  });

  it('should enqueue immediate job and enforce idempotency', async () => {
    const queue = await QueueService.createQueue({
      projectId,
      name: 'idempotency-queue',
      concurrencyLimit: 10,
    });

    const job1 = await JobService.enqueueJob({
      queueId: queue.id,
      jobType: 'SIMULATE_SUCCESS',
      payload: { message: 'Hello Distributed World' },
      idempotencyKey: 'idemp-12345',
    });

    expect(job1.id).toBeDefined();
    expect(job1.status).toBe('QUEUED');

    // Duplicate submission with same idempotency key
    const job2 = await JobService.enqueueJob({
      queueId: queue.id,
      jobType: 'SIMULATE_SUCCESS',
      payload: { message: 'Duplicate Attempt' },
      idempotencyKey: 'idemp-12345',
    });

    expect(job2.id).toBe(job1.id);
  });

  it('should support atomic batch job enqueueing', async () => {
    const queue = await QueueService.createQueue({
      projectId,
      name: 'batch-queue',
      concurrencyLimit: 10,
    });

    const batch = await JobService.enqueueBatch(queue.id, [
      { jobType: 'TASK_A', payload: { step: 1 } },
      { jobType: 'TASK_B', payload: { step: 2 } },
      { jobType: 'TASK_C', payload: { step: 3 } },
    ]);

    expect(batch.length).toBe(3);
    expect(batch[0].status).toBe('QUEUED');
    expect(batch[1].status).toBe('QUEUED');
    expect(batch[2].status).toBe('QUEUED');
  });

  it('should claim and successfully execute job recording logs and duration', async () => {
    const queue = await QueueService.createQueue({
      projectId,
      name: 'exec-log-queue',
      concurrencyLimit: 10,
    });

    const job = await JobService.enqueueJob({
      queueId: queue.id,
      jobType: 'SIMULATE_SUCCESS',
      payload: { durationMs: 10 },
    });

    // Claim
    const claimed = await WorkerService.claimJobsFromQueue({
      workerId,
      queueId: queue.id,
      capacity: 1,
    });
    expect(claimed.length).toBe(1);
    expect(claimed[0].id).toBe(job.id);
    expect(claimed[0].status).toBe('CLAIMED');

    // Execute
    await JobExecutor.execute(claimed[0], workerId);

    // Verify completion
    const refreshed = await JobService.getJobById(job.id);
    expect(refreshed?.status).toBe('COMPLETED');
    expect(refreshed?.completed_at).not.toBeNull();

    // Verify executions & logs
    const executions = await JobService.getJobExecutions(job.id);
    expect(executions.length).toBe(1);
    expect(executions[0].status).toBe('COMPLETED');
    expect(executions[0].duration_ms).toBeGreaterThanOrEqual(0);

    const logs = await JobService.getExecutionLogs(executions[0].id);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('should retry failed job and route to DLQ upon attempt exhaustion', async () => {
    const queue = await QueueService.createQueue({
      projectId,
      name: 'dlq-test-queue',
      concurrencyLimit: 10,
    });

    const failingJob = await JobService.enqueueJob({
      queueId: queue.id,
      jobType: 'SIMULATE_FAILURE',
      payload: { errorMessage: 'Simulated Network Glitch' },
      maxAttempts: 2,
    });

    // Attempt 1: Fails -> Re-scheduled
    const [claimed1] = await WorkerService.claimJobsFromQueue({ workerId, queueId: queue.id, capacity: 1 });
    await JobExecutor.execute(claimed1, workerId);

    const afterAttempt1 = await JobService.getJobById(failingJob.id);
    expect(afterAttempt1?.status).toBe('SCHEDULED');
    expect(afterAttempt1?.attempt_count).toBe(1);

    // Manually force run_at to NOW() to simulate backoff elapsing
    await query(
      "UPDATE jobs SET status = 'QUEUED', run_at = NOW() WHERE id = $1",
      [failingJob.id]
    );

    // Attempt 2: Fails -> Reaches maxAttempts (2) -> DEAD_LETTER
    const [claimed2] = await WorkerService.claimJobsFromQueue({ workerId, queueId: queue.id, capacity: 1 });
    await JobExecutor.execute(claimed2, workerId);

    const afterAttempt2 = await JobService.getJobById(failingJob.id);
    expect(afterAttempt2?.status).toBe('DEAD_LETTER');

    // Verify DLQ Table Entry
    const dlqList = await DlqService.listDlq({ queueId: queue.id });
    expect(dlqList.total).toBe(1);
    expect(dlqList.entries[0].job_id).toBe(failingJob.id);
    expect(dlqList.entries[0].failed_reason).toContain('Simulated Network Glitch');

    // Manual Replay from DLQ
    const dlqId = dlqList.entries[0].id;
    const replayed = await DlqService.replayJob(dlqId);
    expect(replayed?.status).toBe('QUEUED');
    expect(replayed?.attempt_count).toBe(0);
  });
});
