import { query } from '../db/client.js';

export interface SystemMetrics {
  totalJobs: number;
  queuedJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  deadLetterJobs: number;
  activeWorkers: number;
  totalQueues: number;
  avgDurationMs: number;
}

export class MetricsService {
  static async getSystemMetrics(): Promise<SystemMetrics> {
    const jobStatsRes = await query(`
      SELECT
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE status = 'QUEUED') as queued_jobs,
        COUNT(*) FILTER (WHERE status IN ('CLAIMED', 'RUNNING')) as running_jobs,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_jobs,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed_jobs,
        COUNT(*) FILTER (WHERE status = 'DEAD_LETTER') as dead_letter_jobs
      FROM jobs
    `);

    const workerStatsRes = await query(`
      SELECT COUNT(*) as active_workers
      FROM workers
      WHERE status = 'ONLINE'
    `);

    const queueStatsRes = await query(`
      SELECT COUNT(*) as total_queues
      FROM queues
    `);

    const avgDurationRes = await query(`
      SELECT AVG(duration_ms) as avg_duration
      FROM job_executions
      WHERE status = 'COMPLETED' AND duration_ms IS NOT NULL
    `);

    const row = jobStatsRes.rows[0] || {};
    return {
      totalJobs: parseInt(row.total_jobs || '0', 10),
      queuedJobs: parseInt(row.queued_jobs || '0', 10),
      runningJobs: parseInt(row.running_jobs || '0', 10),
      completedJobs: parseInt(row.completed_jobs || '0', 10),
      failedJobs: parseInt(row.failed_jobs || '0', 10),
      deadLetterJobs: parseInt(row.dead_letter_jobs || '0', 10),
      activeWorkers: parseInt(workerStatsRes.rows[0]?.active_workers || '0', 10),
      totalQueues: parseInt(queueStatsRes.rows[0]?.total_queues || '0', 10),
      avgDurationMs: Math.round(parseFloat(avgDurationRes.rows[0]?.avg_duration || '0')),
    };
  }

  static async getRecentThroughput(hours: number = 24): Promise<{ time: string; completed: number; failed: number }[]> {
    const res = await query(
      `SELECT
         date_trunc('hour', started_at) as hour_bucket,
         COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
         COUNT(*) FILTER (WHERE status = 'FAILED') as failed
       FROM job_executions
       WHERE started_at >= NOW() - ($1 || ' hours')::INTERVAL
       GROUP BY hour_bucket
       ORDER BY hour_bucket ASC`,
      [hours]
    );

    return res.rows.map((r) => ({
      time: new Date(r.hour_bucket).toISOString(),
      completed: parseInt(r.completed || '0', 10),
      failed: parseInt(r.failed || '0', 10),
    }));
  }
}
