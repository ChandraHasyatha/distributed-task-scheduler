import { query, withTransaction } from '../db/client.js';
/**
 * WORKFLOW / DAG DEPENDENCIES
 * ===========================
 * A job created with `dependsOn: [jobIdA, jobIdB, ...]` is inserted with
 * status WAITING instead of QUEUED/SCHEDULED. It becomes eligible for
 * claiming only once every parent job reaches COMPLETED. This models a
 * directed acyclic graph of job dependencies (a lightweight workflow
 * engine) without needing an external orchestrator.
 *
 * Promotion (WAITING -> QUEUED) happens two ways:
 *  1. Eagerly, right after a parent job completes (see `onJobCompleted`),
 *     so dependents run as soon as possible.
 *  2. As a safety net, `promoteUnblockedJobs()` is called from the
 *     scheduler tick to catch anything missed by (1) (e.g. after a
 *     restart).
 */
export class WorkflowService {
    static async addDependencies(jobId, dependsOnJobIds) {
        if (dependsOnJobIds.length === 0)
            return;
        await withTransaction(async (client) => {
            for (const parentId of dependsOnJobIds) {
                if (parentId === jobId) {
                    throw new Error('A job cannot depend on itself');
                }
                await client.query(`INSERT INTO job_dependencies (job_id, depends_on_job_id)
           VALUES ($1, $2)
           ON CONFLICT (job_id, depends_on_job_id) DO NOTHING`, [jobId, parentId]);
            }
        });
    }
    static async getDependencyGraph(jobId) {
        const dependsOnRes = await query(`SELECT j.* FROM jobs j
       JOIN job_dependencies jd ON jd.depends_on_job_id = j.id
       WHERE jd.job_id = $1`, [jobId]);
        const dependentsRes = await query(`SELECT j.* FROM jobs j
       JOIN job_dependencies jd ON jd.job_id = j.id
       WHERE jd.depends_on_job_id = $1`, [jobId]);
        return { dependsOn: dependsOnRes.rows, dependents: dependentsRes.rows };
    }
    static async isUnblocked(jobId) {
        const res = await query(`SELECT jd.id FROM job_dependencies jd
       JOIN jobs pj ON pj.id = jd.depends_on_job_id
       WHERE jd.job_id = $1 AND pj.status <> 'COMPLETED'
       LIMIT 1`, [jobId]);
        return res.rows.length === 0;
    }
    /** Promotes any WAITING job whose parents have all completed to QUEUED. */
    static async promoteUnblockedJobs() {
        // Two-step (select candidates, then update by id) instead of a single
        // correlated-subquery UPDATE, since pg-mem (used for tests / no local
        // Postgres) doesn't reliably resolve an aliased UPDATE target inside a
        // correlated WHERE NOT EXISTS. Real Postgres would happily run the
        // single-statement version; this form works identically on both.
        const waitingRes = await query(`SELECT id FROM jobs WHERE status = 'WAITING'`);
        if (waitingRes.rows.length === 0)
            return 0;
        let promoted = 0;
        for (const row of waitingRes.rows) {
            const unblocked = await this.isUnblocked(row.id);
            if (unblocked) {
                await query(`UPDATE jobs SET status = 'QUEUED' WHERE id = $1`, [row.id]);
                promoted++;
            }
        }
        return promoted;
    }
    /** Call right after a job transitions to COMPLETED to unblock children immediately. */
    static async onJobCompleted(completedJobId) {
        const candidatesRes = await query(`SELECT j.id FROM jobs j
       JOIN job_dependencies jd ON jd.job_id = j.id
       WHERE jd.depends_on_job_id = $1 AND j.status = 'WAITING'`, [completedJobId]);
        const unblockedIds = [];
        for (const row of candidatesRes.rows) {
            const unblocked = await this.isUnblocked(row.id);
            if (unblocked) {
                await query(`UPDATE jobs SET status = 'QUEUED' WHERE id = $1`, [row.id]);
                unblockedIds.push(row.id);
            }
        }
        return unblockedIds;
    }
}
//# sourceMappingURL=workflow.service.js.map