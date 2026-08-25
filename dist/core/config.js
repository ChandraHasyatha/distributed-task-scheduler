import dotenv from 'dotenv';
dotenv.config();
export const config = {
    port: parseInt(process.env.PORT || '4000', 10),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/distributed_scheduler',
    jwtSecret: process.env.JWT_SECRET || 'super-secret-distributed-job-scheduler-jwt-key-2026',
    worker: {
        concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
        pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '500', 10),
        heartbeatIntervalMs: parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '5000', 10),
        staleHeartbeatThresholdMs: 30000,
    },
    reaper: {
        intervalMs: parseInt(process.env.REAPER_INTERVAL_MS || '10000', 10),
    },
    scheduler: {
        pollIntervalMs: parseInt(process.env.SCHEDULER_POLL_INTERVAL_MS || '1000', 10),
    },
    rateLimit: {
        globalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '300', 10),
        globalWindowMs: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || '60000', 10),
        authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '10', 10),
        authWindowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '60000', 10),
    },
    sharding: {
        shardId: parseInt(process.env.WORKER_SHARD_ID || '0', 10),
    },
    locking: {
        holderId: process.env.HOSTNAME || `pid-${process.pid}`,
    },
};
//# sourceMappingURL=config.js.map