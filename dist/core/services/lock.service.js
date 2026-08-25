import { query, getPool, isMemoryDbMode } from '../db/client.js';
/**
 * DISTRIBUTED LOCKING
 * ===================
 * Uses PostgreSQL session-level advisory locks (`pg_try_advisory_lock`) as
 * the mutual-exclusion primitive. Advisory locks are cluster-wide (any
 * process connected to the same database competes for the same lock key),
 * cheap (no table row, no vacuum overhead), and automatically released if
 * the holding connection dies — which is exactly what you want for
 * coordinating singleton work (e.g. "only one scheduler/reaper instance
 * across the whole fleet should run this tick") without needing a
 * separate lock-manager service like ZooKeeper/etcd.
 *
 * A lock key (string) is hashed to a 64-bit integer via `hashtext`, which
 * Postgres's advisory lock functions require.
 *
 * NOTE: because this needs a *held* connection (not just a query from the
 * pool, which could be a different backend each time), we check out a
 * dedicated client for the lifetime of the lock and release it back to
 * the pool on unlock.
 */
export class LockService {
    static heldClients = new Map();
    // In-memory fallback so the feature still demos correctly when running
    // against pg-mem (tests / no local Postgres available).
    static memoryLocks = new Set();
    static async tryAcquire(lockKey, holder) {
        if (isMemoryDbMode()) {
            if (this.memoryLocks.has(lockKey))
                return false;
            this.memoryLocks.add(lockKey);
            await this.logAcquire(lockKey, holder);
            return true;
        }
        const pool = getPool();
        const client = await pool.connect();
        try {
            const res = await client.query(`SELECT pg_try_advisory_lock(hashtext($1)) as pg_try_advisory_lock`, [lockKey]);
            const acquired = res.rows[0]?.pg_try_advisory_lock === true;
            if (acquired) {
                this.heldClients.set(lockKey, client);
                await this.logAcquire(lockKey, holder);
            }
            else {
                client.release();
            }
            return acquired;
        }
        catch (err) {
            client.release();
            throw err;
        }
    }
    static async release(lockKey) {
        if (isMemoryDbMode()) {
            this.memoryLocks.delete(lockKey);
            await this.logRelease(lockKey);
            return;
        }
        const client = this.heldClients.get(lockKey);
        if (!client)
            return;
        try {
            await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]);
        }
        finally {
            client.release();
            this.heldClients.delete(lockKey);
            await this.logRelease(lockKey);
        }
    }
    /**
     * Runs `fn` only if the lock is acquired; always releases afterward.
     * Returns null if the lock could not be acquired (another holder has it).
     */
    static async withLock(lockKey, holder, fn) {
        const acquired = await this.tryAcquire(lockKey, holder);
        if (!acquired)
            return null;
        try {
            return await fn();
        }
        finally {
            await this.release(lockKey);
        }
    }
    static async logAcquire(lockKey, holder) {
        try {
            await query(`INSERT INTO distributed_lock_log (lock_key, holder) VALUES ($1, $2)`, [lockKey, holder]);
        }
        catch {
            // Observability only — never let logging failures break the lock.
        }
    }
    static async logRelease(lockKey) {
        try {
            await query(`UPDATE distributed_lock_log
         SET released_at = NOW()
         WHERE id = (
           SELECT id FROM distributed_lock_log
           WHERE lock_key = $1 AND released_at IS NULL
           ORDER BY acquired_at DESC LIMIT 1
         )`, [lockKey]);
        }
        catch {
            // Observability only.
        }
    }
    static async getActiveLocks() {
        const res = await query(`SELECT * FROM distributed_lock_log WHERE released_at IS NULL ORDER BY acquired_at DESC LIMIT 50`);
        return res.rows;
    }
}
//# sourceMappingURL=lock.service.js.map