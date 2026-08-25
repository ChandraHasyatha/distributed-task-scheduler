import { query } from '../db/client.js';
import { Queue, QueueStats, RetryPolicy } from '../types/index.js';
import { eventBus } from '../events/event-bus.js';

export class QueueService {
  static async createQueue(params: {
    projectId: string;
    name: string;
    priority?: number;
    concurrencyLimit?: number;
    retryPolicyId?: string;
    shardCount?: number;
  }): Promise<Queue> {
    const {
      projectId,
      name,
      priority = 10,
      concurrencyLimit = 5,
      retryPolicyId = null,
      shardCount = 1,
    } = params;

    const res = await query<Queue>(
      `INSERT INTO queues (project_id, name, priority, concurrency_limit, retry_policy_id, shard_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [projectId, name, priority, concurrencyLimit, retryPolicyId, shardCount]
    );
    return res.rows[0];
  }

  static async getQueueById(id: string): Promise<(Queue & { stats: QueueStats }) | null> {
    const res = await query<Queue>('SELECT * FROM queues WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;

    const queue = res.rows[0];
    const stats = await this.getQueueStats(id);
    return { ...queue, stats };
  }

  static async listQueuesByProject(projectId: string): Promise<(Queue & { stats: QueueStats })[]> {
    const res = await query<Queue>(
      'SELECT * FROM queues WHERE project_id = $1 ORDER BY priority DESC, created_at ASC',
      [projectId]
    );

    const queuesWithStats = await Promise.all(
      res.rows.map(async (queue) => {
        const stats = await this.getQueueStats(queue.id);
        return { ...queue, stats };
      })
    );

    return queuesWithStats;
  }

  static async updateQueue(
    id: string,
    updates: {
      name?: string;
      priority?: number;
      concurrencyLimit?: number;
      retryPolicyId?: string | null;
      shardCount?: number;
    }
  ): Promise<Queue | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.priority !== undefined) {
      fields.push(`priority = $${idx++}`);
      values.push(updates.priority);
    }
    if (updates.concurrencyLimit !== undefined) {
      fields.push(`concurrency_limit = $${idx++}`);
      values.push(updates.concurrencyLimit);
    }
    if (updates.retryPolicyId !== undefined) {
      fields.push(`retry_policy_id = $${idx++}`);
      values.push(updates.retryPolicyId);
    }
    if (updates.shardCount !== undefined) {
      fields.push(`shard_count = $${idx++}`);
      values.push(updates.shardCount);
    }

    if (fields.length === 0) {
      const existing = await query<Queue>('SELECT * FROM queues WHERE id = $1', [id]);
      return existing.rows[0] || null;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const res = await query<Queue>(
      `UPDATE queues SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (res.rows[0]) {
      eventBus.publish('QUEUE_UPDATED', { queueId: id, ...updates });
    }
    return res.rows[0] || null;
  }

  static async setPaused(id: string, isPaused: boolean): Promise<Queue | null> {
    const res = await query<Queue>(
      `UPDATE queues SET is_paused = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [isPaused, id]
    );
    if (res.rows[0]) {
      eventBus.publish('QUEUE_UPDATED', { queueId: id, isPaused });
    }
    return res.rows[0] || null;
  }

  static async deleteQueue(id: string): Promise<boolean> {
    const res = await query('DELETE FROM queues WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  static async getQueueStats(queueId: string): Promise<QueueStats> {
    const res = await query(
      `SELECT
         COUNT(*) as total_jobs,
         COUNT(*) FILTER (WHERE status = 'QUEUED') as queued_jobs,
         COUNT(*) FILTER (WHERE status IN ('CLAIMED', 'RUNNING')) as running_jobs,
         COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_jobs,
         COUNT(*) FILTER (WHERE status = 'FAILED') as failed_jobs,
         COUNT(*) FILTER (WHERE status = 'DEAD_LETTER') as dead_letter_jobs
       FROM jobs
       WHERE queue_id = $1`,
      [queueId]
    );

    const row = res.rows[0] || {};
    return {
      total_jobs: parseInt(row.total_jobs || '0', 10),
      queued_jobs: parseInt(row.queued_jobs || '0', 10),
      running_jobs: parseInt(row.running_jobs || '0', 10),
      completed_jobs: parseInt(row.completed_jobs || '0', 10),
      failed_jobs: parseInt(row.failed_jobs || '0', 10),
      dead_letter_jobs: parseInt(row.dead_letter_jobs || '0', 10),
    };
  }

  // Retry Policies Management
  static async createRetryPolicy(params: {
    projectId: string;
    name: string;
    strategy: 'FIXED' | 'LINEAR' | 'EXPONENTIAL';
    maxAttempts?: number;
    initialIntervalMs?: number;
    maxIntervalMs?: number;
    backoffFactor?: number;
  }): Promise<RetryPolicy> {
    const res = await query<RetryPolicy>(
      `INSERT INTO retry_policies (project_id, name, strategy, max_attempts, initial_interval_ms, max_interval_ms, backoff_factor)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.projectId,
        params.name,
        params.strategy,
        params.maxAttempts ?? 3,
        params.initialIntervalMs ?? 1000,
        params.maxIntervalMs ?? 60000,
        params.backoffFactor ?? 2.0,
      ]
    );
    return res.rows[0];
  }

  static async listRetryPolicies(projectId: string): Promise<RetryPolicy[]> {
    const res = await query<RetryPolicy>(
      'SELECT * FROM retry_policies WHERE project_id = $1 ORDER BY created_at ASC',
      [projectId]
    );
    return res.rows;
  }
}
