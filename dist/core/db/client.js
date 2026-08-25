import pg from 'pg';
import { newDb } from 'pg-mem';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
const { Pool } = pg;
let poolInstance = null;
let memDbInstance = null;
let isMemoryMode = process.env.USE_MEMORY_DB === 'true';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function cleanSqlForMemory(sql) {
    return sql
        .replace(/FOR UPDATE OF \w+ SKIP LOCKED/gi, '')
        .replace(/FOR UPDATE SKIP LOCKED/gi, '')
        .replace(/FOR UPDATE/gi, '')
        .replace(/\bnext_run_at <= NOW\(\)/gi, 'extract(epoch from next_run_at) <= extract(epoch from NOW())')
        .replace(/\brun_at <= NOW\(\)/gi, 'extract(epoch from run_at) <= extract(epoch from NOW())')
        .replace(/last_heartbeat_at < \$(\d+)/gi, 'extract(epoch from last_heartbeat_at) < extract(epoch from $$1)');
}
export function getMemoryDb() {
    if (!memDbInstance) {
        const db = newDb({
            autoCreateForeignKeyIndices: true,
        });
        db.public.registerFunction({
            name: 'gen_random_uuid',
            returns: db.public.getType('text'),
            impure: true,
            implementation: () => crypto.randomUUID(),
        });
        db.public.registerFunction({
            name: 'uuid_generate_v4',
            returns: db.public.getType('text'),
            impure: true,
            implementation: () => crypto.randomUUID(),
        });
        db.public.registerFunction({
            name: 'calculate_next_cron',
            args: [db.public.getType('text'), db.public.getType('text')],
            returns: db.public.getType('timestamp with time zone'),
            impure: true,
            implementation: () => new Date(Date.now() + 60000),
        });
        // Used by QUEUE SHARDING (WorkerService.claimJobsFromQueue) to hash a
        // job id into a shard bucket. Real Postgres provides `hashtext`
        // natively; pg-mem doesn't, so we register an equivalent deterministic
        // string hash (djb2) for the in-memory/test fallback.
        db.public.registerFunction({
            name: 'hashtext',
            args: [db.public.getType('text')],
            returns: db.public.getType('int'),
            implementation: (value) => {
                let hash = 5381;
                for (let i = 0; i < value.length; i++) {
                    hash = (hash * 33) ^ value.charCodeAt(i);
                }
                return hash | 0;
            },
        });
        // ABS is used by the queue-sharding hash filter (MOD(ABS(hashtext(...)))).
        db.public.registerFunction({
            name: 'abs',
            args: [db.public.getType('int')],
            returns: db.public.getType('int'),
            implementation: (value) => Math.abs(value),
        });
        // MOD is used by the queue-sharding hash filter (MOD(ABS(hashtext(...)), N)).
        db.public.registerFunction({
            name: 'mod',
            args: [db.public.getType('int'), db.public.getType('int')],
            returns: db.public.getType('int'),
            implementation: (a, b) => a % b,
        });
        memDbInstance = db;
    }
    return memDbInstance;
}
export function initMemoryDatabase() {
    memDbInstance = null;
    const db = getMemoryDb();
    const pgAdapter = db.adapters.createPg();
    const pool = new pgAdapter.Pool();
    poolInstance = pool;
    isMemoryMode = true;
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
        for (const file of files) {
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
            const cleanedSql = sql.replace(/CREATE EXTENSION IF NOT EXISTS [^;]+;/gi, '');
            try {
                db.public.none(cleanedSql);
            }
            catch (err) {
                console.warn(`Memory DB migration warning for ${file}:`, err.message);
            }
        }
    }
    return poolInstance;
}
export function getPool() {
    if (poolInstance)
        return poolInstance;
    if (isMemoryMode) {
        return initMemoryDatabase();
    }
    poolInstance = new Pool({
        connectionString: config.databaseUrl,
        max: 30,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
    });
    poolInstance.on('error', (err) => {
        console.error('Database connection error:', err);
    });
    return poolInstance;
}
export async function query(text, params) {
    const p = getPool();
    const sql = isMemoryMode ? cleanSqlForMemory(text) : text;
    try {
        return (await p.query(sql, params));
    }
    catch (err) {
        if (!isMemoryMode && (err.code === 'ECONNREFUSED' || err.message?.includes('connect ECONNREFUSED'))) {
            console.warn('Real PostgreSQL not reachable. Falling back to in-memory database engine for local environment.');
            initMemoryDatabase();
            return (await getPool().query(cleanSqlForMemory(text), params));
        }
        throw err;
    }
}
export async function withTransaction(callback) {
    const p = getPool();
    let client;
    try {
        client = await p.connect();
    }
    catch (err) {
        if (!isMemoryMode && (err.code === 'ECONNREFUSED' || err.message?.includes('connect ECONNREFUSED'))) {
            console.warn('Real PostgreSQL not reachable. Falling back to in-memory database engine.');
            initMemoryDatabase();
            client = await getPool().connect();
        }
        else {
            throw err;
        }
    }
    const originalQuery = client.query.bind(client);
    if (isMemoryMode) {
        client.query = ((textOrConfig, valuesOrCb, callback) => {
            if (typeof textOrConfig === 'string') {
                const cleaned = cleanSqlForMemory(textOrConfig);
                return originalQuery(cleaned, valuesOrCb, callback);
            }
            return originalQuery(textOrConfig, valuesOrCb, callback);
        });
    }
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        try {
            await client.query('ROLLBACK');
        }
        catch { }
        throw error;
    }
    finally {
        client.release();
    }
}
export function isMemoryDbMode() {
    return isMemoryMode;
}
export async function closeDb() {
    if (poolInstance) {
        await poolInstance.end();
        poolInstance = null;
    }
}
//# sourceMappingURL=client.js.map