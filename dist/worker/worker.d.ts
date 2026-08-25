export declare class WorkerDaemon {
    private workerRecord;
    private poller;
    private isRunning;
    private isDraining;
    private pollTimer;
    private heartbeatTimer;
    start(): Promise<void>;
    private startHeartbeatLoop;
    private startPollingLoop;
    private registerSignalHandlers;
    shutdown(timeoutMs?: number): Promise<void>;
}
