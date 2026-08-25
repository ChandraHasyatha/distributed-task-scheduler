import { query, withTransaction } from '../db/client.js';
import { eventBus } from '../events/event-bus.js';
export class DlqService {
    static async listDlq(params) {
        const { queueId, limit = 20, offset = 0 } = params;
        const conditions = [];
        const values = [];
        let idx = 1;
        if (queueId) {
            conditions.push(`d.queue_id = $${idx++}`);
            values.push(queueId);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const countRes = await query(`SELECT COUNT(*) as count FROM dead_letter_queue d ${whereClause}`, values);
        const total = parseInt(countRes.rows[0]?.count || '0', 10);
        const dataRes = await query(`SELECT d.*, j.job_type, j.payload
       FROM dead_letter_queue d
       JOIN jobs j ON d.job_id = j.id
       ${whereClause}
       ORDER BY d.entered_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);
        return { entries: dataRes.rows, total };
    }
    static async getDlqEntry(dlqId) {
        const res = await query(`SELECT d.*, j.job_type, j.payload
       FROM dead_letter_queue d
       JOIN jobs j ON d.job_id = j.id
       WHERE d.id = $1`, [dlqId]);
        return res.rows[0] || null;
    }
    static async replayJob(dlqId, replayedByUserId) {
        const result = await withTransaction(async (client) => {
            // 1. Get DLQ entry
            const dlqRes = await client.query('SELECT * FROM dead_letter_queue WHERE id = $1', [dlqId]);
            if (dlqRes.rows.length === 0)
                return null;
            const dlq = dlqRes.rows[0];
            // 2. Reset Job state to QUEUED
            const jobRes = await client.query(`UPDATE jobs
         SET status = 'QUEUED',
             run_at = NOW(),
             attempt_count = 0,
             locked_by = NULL,
             locked_at = NULL,
             completed_at = NULL
         WHERE id = $1
         RETURNING *`, [dlq.job_id]);
            // 3. Mark DLQ entry as replayed or remove it
            await client.query(`UPDATE dead_letter_queue
         SET replayed_at = NOW(),
             replayed_by = $1
         WHERE id = $2`, [replayedByUserId || null, dlqId]);
            return jobRes.rows[0] || null;
        });
        if (result) {
            eventBus.publish('DLQ_UPDATED', { dlqId, replayed: true, jobId: result.id });
            eventBus.publish('JOB_UPDATED', { jobId: result.id, status: 'QUEUED' });
        }
        return result;
    }
    static async purgeDlqEntry(dlqId) {
        const res = await query('DELETE FROM dead_letter_queue WHERE id = $1', [dlqId]);
        const purged = (res.rowCount ?? 0) > 0;
        if (purged) {
            eventBus.publish('DLQ_UPDATED', { dlqId, purged: true });
        }
        return purged;
    }
}
//# sourceMappingURL=dlq.service.js.map