import { query, withTransaction } from '../db/client.js';
import { ScheduledJob } from '../types/index.js';
import { calculateNextCronRun } from '../scheduler/cron-evaluator.js';

export class SchedulerService {
  static async createScheduledJob(params: {
    projectId: string;
    queueId: string;
    name: string;
    cronExpression: string;
    jobType: string;
    payload?: Record<string, any>;
    timezone?: string;
  }): Promise<ScheduledJob> {
    const {
      projectId,
      queueId,
      name,
      cronExpression,
      jobType,
      payload = {},
      timezone = 'UTC',
    } = params;

    const nextRunAt = calculateNextCronRun(cronExpression, timezone);

    const res = await query<ScheduledJob>(
      `INSERT INTO scheduled_jobs (
        project_id, queue_id, name, cron_expression, job_type, payload, timezone, is_active, next_run_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
      RETURNING *`,
      [
        projectId,
        queueId,
        name,
        cronExpression,
        jobType,
        JSON.stringify(payload),
        timezone,
        nextRunAt,
      ]
    );

    return res.rows[0];
  }

  static async listScheduledJobs(projectId: string): Promise<ScheduledJob[]> {
    const res = await query<ScheduledJob>(
      'SELECT * FROM scheduled_jobs WHERE project_id = $1 ORDER BY created_at ASC',
      [projectId]
    );
    return res.rows;
  }

  static async toggleScheduledJob(id: string, isActive: boolean): Promise<ScheduledJob | null> {
    const res = await query<ScheduledJob>(
      'UPDATE scheduled_jobs SET is_active = $1 WHERE id = $2 RETURNING *',
      [isActive, id]
    );
    return res.rows[0] || null;
  }

  static async deleteScheduledJob(id: string): Promise<boolean> {
    const res = await query('DELETE FROM scheduled_jobs WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Promotes delayed/scheduled jobs whose run_at <= NOW() to QUEUED
   */
  static async promoteDueScheduledJobs(): Promise<number> {
    const res = await query(
      `UPDATE jobs
       SET status = 'QUEUED'
       WHERE status = 'SCHEDULED'
         AND run_at <= NOW()`
    );
    return res.rowCount ?? 0;
  }

  /**
   * Evaluates active recurring cron jobs, spawns jobs atomically, and calculates next_run_at.
   * Atomically claims due schedules in a single UPDATE statement to prevent race conditions.
   */
  static async triggerDueCronSchedules(): Promise<number> {
    return withTransaction(async (client) => {
      // Find due schedules
      const dueSchedulesRes = await client.query<ScheduledJob>(
        `SELECT *
         FROM scheduled_jobs
         WHERE is_active = TRUE
           AND next_run_at <= NOW()
         FOR UPDATE SKIP LOCKED`
      );

      if (dueSchedulesRes.rows.length === 0) return 0;

      let triggeredCount = 0;

      for (const schedule of dueSchedulesRes.rows) {
        const nextRun = calculateNextCronRun(
          schedule.cron_expression,
          schedule.timezone,
          new Date()
        );

        // Atomic conditional update to advance next_run_at
        const updateRes = await client.query(
          `UPDATE scheduled_jobs
           SET last_run_at = NOW(),
               next_run_at = $1
           WHERE id = $2 AND next_run_at <= NOW()`,
          [nextRun, schedule.id]
        );

        if ((updateRes.rowCount ?? 0) > 0) {
          // Spawn concrete job instance in QUEUED state
          await client.query(
            `INSERT INTO jobs (
              queue_id, job_type, payload, status, run_at
            ) VALUES ($1, $2, $3, 'QUEUED', NOW())`,
            [schedule.queue_id, schedule.job_type, JSON.stringify(schedule.payload)]
          );
          triggeredCount++;
        }
      }

      return triggeredCount;
    });
  }
}
