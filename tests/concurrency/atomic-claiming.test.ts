import { describe, it, expect, beforeAll } from 'vitest';
import { AuthService } from '../../src/core/services/auth.service.js';
import { ProjectService } from '../../src/core/services/project.service.js';
import { QueueService } from '../../src/core/services/queue.service.js';
import { JobService } from '../../src/core/services/job.service.js';
import { WorkerService } from '../../src/core/services/worker.service.js';
import { SchedulerService } from '../../src/core/services/scheduler.service.js';
import { ReaperService } from '../../src/core/services/reaper.service.js';
import { JobExecutor } from '../../src/worker/executor.js';
import { initMemoryDatabase, query } from '../../src/core/db/client.js';

describe('High-Concurrency & Reliability Test Suite', () => {
  let projectId: string;

  beforeAll(async () => {
    initMemoryDatabase();

    const { organization } = await AuthService.registerUserWithOrg({
      email: 'concurrency@test.com',
      password: 'Password123!',
      fullName: 'Concurrency Tester',
      orgName: 'Concurrency Test Org',
    });

    const project = await ProjectService.createProject({
      organizationId: organization.id,
      name: 'Race Condition Test Project',
    });
    projectId = project.id;
  });

  // =========================================================================
  // TEST A: Two Workers Competing for One Single Job
  // =========================================================================
  it('TEST A: Two workers simultaneously competing for 1 single job -> exactly 1 claims it', async () => {
    const queue = await QueueService.createQueue({
      projectId,
      name: 'race-single-job-queue',
      concurrencyLimit: 5,
    });

    const w1 = await WorkerService.registerWorker({ hostname: 'node-1', pid: 101 });
    const w2 = await WorkerService.registerWorker({ hostname: 'node-2', pid: 102 });

    const job = await JobService.enqueueJob({
      queueId: queue.id,
      jobType: 'EXCLUSIVE_TASK',
      payload: { test: 'single-claim' },
    });

    // Fire 2 concurrent claim requests at the exact same instant
    const [claimedBy1, claimedBy2] = await Promise.all([
      WorkerService.claimJobsFromQueue({ workerId: w1.id, queueId: queue.id, capacity: 1 }),
      WorkerService.claimJobsFromQueue({ workerId: w2.id, queueId: queue.id, capacity: 1 }),
    ]);

    const totalClaimed = claimedBy1.length + claimedBy2.length;
    expect(totalClaimed).toBe(1);

    const claimingWorker = claimedBy1.length === 1 ? w1.id : w2.id;
    const claimedJob = claimedBy1.length === 1 ? claimedBy1[0] : claimedBy2[0];

    expect(claimedJob.id).toBe(job.id);
    expect(claimedJob.locked_by).toBe(claimingWorker);
    expect(claimedJob.status).toBe('CLAIMED');
  });

  // =========================================================================
  // TEST B: Many Workers Competing for Many Jobs -> Zero Duplicates
  // =========================================================================
  it('TEST B: 10 workers competing for 30 jobs -> all 30 claimed exactly once with zero duplicates', async () => {
    const queue = await QueueService.createQueue({
      projectId,
      name: 'race-multi-job-queue',
      concurrencyLimit: 30,
    });

    const workers = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        WorkerService.registerWorker({ hostname: `cluster-node-${i}`, pid: 200 + i })
      )
    );

    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        JobService.enqueueJob({
          queueId: queue.id,
          jobType: 'BULK_RACE_TASK',
          payload: { index: i },
        })
      )
    );

    const allClaimedJobs: string[] = [];

    const workerTasks = workers.map(async (worker) => {
      let consecutiveEmpty = 0;
      while (consecutiveEmpty < 3) {
        const batch = await WorkerService.claimJobsFromQueue({
          workerId: worker.id,
          queueId: queue.id,
          capacity: 5,
        });

        if (batch.length > 0) {
          consecutiveEmpty = 0;
          for (const j of batch) {
            allClaimedJobs.push(j.id);
            await JobExecutor.execute(j, worker.id);
          }
        } else {
          consecutiveEmpty++;
          await new Promise((r) => setTimeout(r, 2));
        }
      }
    });

    await Promise.all(workerTasks);

    expect(allClaimedJobs.length).toBe(30);

    const uniqueIds = new Set(allClaimedJobs);
    expect(uniqueIds.size).toBe(30);

    const completedCountRes = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM jobs WHERE queue_id = $1 AND status = 'COMPLETED'",
      [queue.id]
    );
    expect(parseInt(completedCountRes.rows[0].count, 10)).toBe(30);
  }, 15000);

  // =========================================================================
  // TEST C: Queue Concurrency Limit Invariant Under High Load
  // =========================================================================
  it('TEST C: Queue concurrency limit = 3 is strictly respected under concurrent workers', async () => {
    const queue = await QueueService.createQueue({
      projectId,
      name: 'strict-concurrency-cap-queue',
      concurrencyLimit: 3,
    });

    const workers = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        WorkerService.registerWorker({ hostname: `cap-node-${i}`, pid: 300 + i })
      )
    );

    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        JobService.enqueueJob({
          queueId: queue.id,
          jobType: 'SIMULATE_SUCCESS',
          payload: { durationMs: 10 },
        })
      )
    );

    let maxObservedActive = 0;

    const monitorInterval = setInterval(async () => {
      const res = await query<{ count: string }>(
        "SELECT COUNT(*) as count FROM jobs WHERE queue_id = $1 AND status IN ('CLAIMED', 'RUNNING')",
        [queue.id]
      );
      const active = parseInt(res.rows[0]?.count || '0', 10);
      if (active > maxObservedActive) {
        maxObservedActive = active;
      }
    }, 5);

    const tasks = workers.map(async (w) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const batch = await WorkerService.claimJobsFromQueue({
          workerId: w.id,
          queueId: queue.id,
          capacity: 2,
        });

        for (const j of batch) {
          await JobExecutor.execute(j, w.id);
        }
        await new Promise((r) => setTimeout(r, 5));
      }
    });

    await Promise.all(tasks);
    clearInterval(monitorInterval);

    expect(maxObservedActive).toBeLessThanOrEqual(3);
  }, 15000);

  // =========================================================================
  // TEST D: Worker Crash & Reaper Recovery
  // =========================================================================
  it('TEST D: Worker crash / simulated dead worker -> reaper recovers abandoned jobs', async () => {
    const queue = await QueueService.createQueue({
      projectId,
      name: 'crash-recovery-queue',
      concurrencyLimit: 5,
    });

    const doomedWorker = await WorkerService.registerWorker({ hostname: 'crashed-node', pid: 9999 });
    const recoveryWorker = await WorkerService.registerWorker({ hostname: 'standby-node', pid: 8888 });

    const job = await JobService.enqueueJob({
      queueId: queue.id,
      jobType: 'SIMULATE_SUCCESS',
      payload: { test: 'recovery' },
    });

    const [claimed] = await WorkerService.claimJobsFromQueue({
      workerId: doomedWorker.id,
      queueId: queue.id,
      capacity: 1,
    });
    expect(claimed.id).toBe(job.id);

    await query(
      "UPDATE workers SET last_heartbeat_at = NOW() - INTERVAL '60 seconds' WHERE id = $1",
      [doomedWorker.id]
    );

    const recovery = await ReaperService.recoverStaleWorkers(30000);
    expect(recovery.offlineWorkersCount).toBeGreaterThanOrEqual(1);
    expect(recovery.recoveredJobsCount).toBe(1);

    const recoveredJob = await JobService.getJobById(job.id);
    expect(recoveredJob?.status).toBe('QUEUED');
    expect(recoveredJob?.locked_by).toBeNull();

    const [reclaimed] = await WorkerService.claimJobsFromQueue({
      workerId: recoveryWorker.id,
      queueId: queue.id,
      capacity: 1,
    });
    expect(reclaimed.id).toBe(job.id);

    await JobExecutor.execute(reclaimed, recoveryWorker.id);
    const finalJob = await JobService.getJobById(job.id);
    expect(finalJob?.status).toBe('COMPLETED');
  });

  // =========================================================================
  // TEST E: Multi-Scheduler Concurrency (No Duplicate Cron Spawns)
  // =========================================================================
  it('TEST E: Multiple scheduler replicas trigger due cron schedules without duplicate job spawns', async () => {
    const queue = await QueueService.createQueue({
      projectId,
      name: 'cron-concurrency-queue',
      concurrencyLimit: 10,
    });

    const schedule = await SchedulerService.createScheduledJob({
      projectId,
      queueId: queue.id,
      name: 'Minutely Sync',
      cronExpression: '* * * * *',
      jobType: 'SYNC_RECORDS',
      payload: { type: 'cron-test' },
    });

    await query(
      "UPDATE scheduled_jobs SET next_run_at = NOW() - INTERVAL '5 seconds' WHERE id = $1",
      [schedule.id]
    );

    const [count1, count2, count3] = await Promise.all([
      SchedulerService.triggerDueCronSchedules(),
      SchedulerService.triggerDueCronSchedules(),
      SchedulerService.triggerDueCronSchedules(),
    ]);

    const totalTriggered = count1 + count2 + count3;
    expect(totalTriggered).toBe(1);

    const spawnedJobs = await JobService.listJobs({ queueId: queue.id, jobType: 'SYNC_RECORDS' });
    expect(spawnedJobs.total).toBe(1);
  });
});
