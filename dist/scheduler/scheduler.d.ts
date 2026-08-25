export declare class SchedulerDaemon {
    private isRunning;
    private timer;
    start(): Promise<void>;
    private registerSignalHandlers;
}
