export declare const config: {
    port: number;
    host: string;
    nodeEnv: string;
    databaseUrl: string;
    jwtSecret: string;
    worker: {
        concurrency: number;
        pollIntervalMs: number;
        heartbeatIntervalMs: number;
        staleHeartbeatThresholdMs: number;
    };
    reaper: {
        intervalMs: number;
    };
    scheduler: {
        pollIntervalMs: number;
    };
    rateLimit: {
        globalMax: number;
        globalWindowMs: number;
        authMax: number;
        authWindowMs: number;
    };
    sharding: {
        shardId: number;
    };
    locking: {
        holderId: string;
    };
};
