import { query, withTransaction } from '../core/db/client.js';
import { Job, RetryPolicy, RetryStrategy } from '../core/types/index.js';
import { calculateBackoffDelay } from '../core/retry/calculator.js';
import { logger } from '../core/logger/index.js';
import { eventBus } from '../core/events/event-bus.js';
import { WorkflowService } from '../core/services/workflow.service.js';
import { AiSummaryService } from '../core/services/ai-summary.service.js';

export class JobExecutor {
  static async execute(job: Job, workerId: string): Promise<void> {
    const startedAt = new Date();
    let executionId: string = '';

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE jobs
         SET status = 'RUNNING',
             started_at = NOW()
         WHERE id = $1`,
        [job.id]
      );

      const execRes = await client.query<{ id: string }>(
        `INSERT INTO job_executions (job_id, worker_id, attempt_number, status, started_at)
         VALUES ($1, $2, $3, 'RUNNING', NOW())
         RETURNING id`,
        [job.id, workerId, job.attempt_count]
      );
      executionId = execRes.rows[0].id;
    });

    try {
      await this.runTaskWithTimeout(job, executionId);

      const durationMs = Date.now() - startedAt.getTime();
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE job_executions
           SET status = 'COMPLETED',
               finished_at = NOW(),
               duration_ms = $1
           WHERE id = $2`,
          [durationMs, executionId]
        );

        await client.query(
          `UPDATE jobs
           SET status = 'COMPLETED',
               completed_at = NOW(),
               locked_by = NULL,
               locked_at = NULL
           WHERE id = $1`,
          [job.id]
        );
      });

      logger.info(`Job ${job.id} (${job.job_type}) completed successfully in ${durationMs}ms`);
      eventBus.publish('JOB_UPDATED', { jobId: job.id, status: 'COMPLETED', queueId: job.queue_id });

      // WORKFLOW/DAG: unblock any jobs waiting on this one.
      try {
        const unblocked = await WorkflowService.onJobCompleted(job.id);
        if (unblocked.length > 0) {
          logger.info(`Job ${job.id} completion unblocked ${unblocked.length} dependent job(s)`);
          for (const unblockedId of unblocked) {
            eventBus.publish('JOB_UPDATED', { jobId: unblockedId, status: 'QUEUED' });
          }
        }
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to promote dependent jobs after completion');
      }
    } catch (err: any) {
      const durationMs = Date.now() - startedAt.getTime();
      const errorMessage = err.message || 'Unknown error';
      const errorStack = err.stack || null;

      logger.error(`Job ${job.id} (${job.job_type}) failed on attempt ${job.attempt_count}: ${errorMessage}`);

      await this.handleJobFailure({
        job,
        executionId,
        durationMs,
        errorMessage,
        errorStack,
      });
    }
  }

  private static async runTaskWithTimeout(job: Job, executionId: string): Promise<void> {
    await this.appendLog(executionId, 'INFO', `Started executing task '${job.job_type}' (Attempt ${job.attempt_count}/${job.max_attempts})`);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Execution timed out after ${job.timeout_ms}ms`)), job.timeout_ms)
    );

    const taskPromise = this.dispatchTaskHandler(job, executionId);

    await Promise.race([taskPromise, timeoutPromise]);
    await this.appendLog(executionId, 'INFO', `Task '${job.job_type}' finished successfully`);
  }

  private static async dispatchTaskHandler(job: Job, executionId: string): Promise<void> {
    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;

    switch (job.job_type) {
      case 'SIMULATE_SUCCESS':
      case 'SEND_EMAIL':
      case 'PROCESS_IMAGE':
      case 'GENERATE_REPORT':
        const delay = payload.durationMs || 50;
        await this.appendLog(executionId, 'INFO', `Processing job with payload: ${JSON.stringify(payload)}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        break;

      case 'SIMULATE_FAILURE':
        await this.appendLog(executionId, 'WARN', 'Simulating failure as requested in job payload');
        throw new Error(payload.errorMessage || 'Simulated task failure');

      case 'FAIL_THEN_SUCCEED':
        if (job.attempt_count < 2) {
          await this.appendLog(executionId, 'WARN', `Failing on attempt ${job.attempt_count} as configured`);
          throw new Error(`Transient failure on attempt ${job.attempt_count}`);
        }
        await this.appendLog(executionId, 'INFO', `Succeeded on attempt ${job.attempt_count}`);
        break;

      default:
        await this.appendLog(executionId, 'INFO', `Executed generic task type: ${job.job_type}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
        break;
    }
  }

  private static async handleJobFailure(params: {
    job: Job;
    executionId: string;
    durationMs: number;
    errorMessage: string;
    errorStack: string | null;
  }): Promise<void> {
    const { job, executionId, durationMs, errorMessage, errorStack } = params;
    let pendingAiSummary: { dlqId: string } | null = null;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE job_executions
         SET status = 'FAILED',
             finished_at = NOW(),
             duration_ms = $1,
             error_message = $2,
             error_stack = $3
         WHERE id = $4`,
        [durationMs, errorMessage, errorStack, executionId]
      );

      await this.appendLog(executionId, 'ERROR', `Execution failed: ${errorMessage}`, { errorStack });

      let strategy: RetryStrategy = 'EXPONENTIAL';
      let initialIntervalMs = 1000;
      let maxIntervalMs = 60000;
      let backoffFactor = 2.0;

      if (job.retry_policy_id) {
        const polRes = await client.query<RetryPolicy>(
          'SELECT * FROM retry_policies WHERE id = $1',
          [job.retry_policy_id]
        );
        if (polRes.rows.length > 0) {
          const p = polRes.rows[0];
          strategy = p.strategy;
          initialIntervalMs = p.initial_interval_ms;
          maxIntervalMs = p.max_interval_ms;
          backoffFactor = parseFloat(p.backoff_factor as any) || 2.0;
        }
      }

      if (job.attempt_count < job.max_attempts) {
        const delayMs = calculateBackoffDelay(job.attempt_count, {
          strategy,
          maxAttempts: job.max_attempts,
          initialIntervalMs,
          maxIntervalMs,
          backoffFactor,
        });

        await client.query(
          `UPDATE jobs
           SET status = 'SCHEDULED',
               run_at = NOW() + ($1 || ' milliseconds')::INTERVAL,
               locked_by = NULL,
               locked_at = NULL
           WHERE id = $2`,
          [delayMs, job.id]
        );

        logger.info(`Job ${job.id} scheduled for retry ${job.attempt_count + 1}/${job.max_attempts} in ${delayMs}ms`);
        eventBus.publish('JOB_UPDATED', { jobId: job.id, status: 'SCHEDULED', queueId: job.queue_id, nextRetryInMs: delayMs });
      } else {
        await client.query(
          `UPDATE jobs
           SET status = 'DEAD_LETTER',
               completed_at = NOW(),
               locked_by = NULL,
               locked_at = NULL
           WHERE id = $1`,
          [job.id]
        );

        const dlqRes = await client.query<{ id: string }>(
          `INSERT INTO dead_letter_queue (job_id, queue_id, failed_reason, total_attempts)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (job_id) DO UPDATE
           SET failed_reason = EXCLUDED.failed_reason, total_attempts = EXCLUDED.total_attempts
           RETURNING id`,
          [job.id, job.queue_id, errorMessage, job.attempt_count]
        );

        logger.warn(`Job ${job.id} exhausted all ${job.max_attempts} attempts. Moved to Dead Letter Queue.`);
        eventBus.publish('DLQ_UPDATED', { jobId: job.id, dlqId: dlqRes.rows[0]?.id, queueId: job.queue_id, reason: errorMessage });

        if (dlqRes.rows[0]?.id) {
          pendingAiSummary = { dlqId: dlqRes.rows[0].id };
        }
      }
    });

    // AI-GENERATED FAILURE SUMMARY: runs after the transaction commits
    // (so the DLQ row is guaranteed visible), and is fire-and-forget so
    // it never blocks or slows down job processing.
    if (pendingAiSummary) {
      const { dlqId } = pendingAiSummary;
      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      query<{ attempt_number: number; error_message: string | null }>(
        'SELECT attempt_number, error_message FROM job_executions WHERE job_id = $1 ORDER BY attempt_number ASC',
        [job.id]
      )
        .then((executionsRes) =>
          AiSummaryService.summarizeFailure({
            dlqId,
            jobType: job.job_type,
            payload,
            failedReason: errorMessage,
            totalAttempts: job.attempt_count,
            errorHistory: executionsRes.rows.map((r) => ({ attempt: r.attempt_number, error: r.error_message })),
          })
        )
        .then((summary) => {
          eventBus.publish('DLQ_UPDATED', { jobId: job.id, dlqId, aiSummary: summary });
        })
        .catch((err) => logger.error({ err: err?.message }, 'AI summary generation failed'));
    }
  }

  static async appendLog(executionId: string, level: string, message: string, data?: any): Promise<void> {
    try {
      await query(
        `INSERT INTO job_logs (job_execution_id, level, message, data, logged_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [executionId, level, message, data ? JSON.stringify(data) : null]
      );
    } catch (err: any) {
      logger.error({ err }, 'Failed to write job log');
    }
  }
}
