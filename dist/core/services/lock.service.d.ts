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
export declare class LockService {
    private static heldClients;
    private static memoryLocks;
    static tryAcquire(lockKey: string, holder: string): Promise<boolean>;
    static release(lockKey: string): Promise<void>;
    /**
     * Runs `fn` only if the lock is acquired; always releases afterward.
     * Returns null if the lock could not be acquired (another holder has it).
     */
    static withLock<T>(lockKey: string, holder: string, fn: () => Promise<T>): Promise<T | null>;
    private static logAcquire;
    private static logRelease;
    static getActiveLocks(): Promise<any[]>;
}
