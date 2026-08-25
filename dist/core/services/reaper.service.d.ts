export declare class ReaperService {
    /**
     * DISTRIBUTED LOCKING (bonus feature): if you run more than one reaper
     * process (e.g. one per API/scheduler instance for HA), only a single
     * instance should actually run the recovery sweep on a given tick —
     * otherwise two reapers could both see the same dead worker and race
     * to requeue/DLQ its orphaned jobs. We guard the whole sweep with a
     * cluster-wide advisory lock keyed by "reaper:sweep".
     */
    static recoverStaleWorkersIfLeader(staleThresholdMs?: number): Promise<{
        offlineWorkersCount: number;
        recoveredJobsCount: number;
    } | {
        offlineWorkersCount: number;
        recoveredJobsCount: number;
        skippedNotLeader: boolean;
    }>;
    static recoverStaleWorkers(staleThresholdMs?: number): Promise<{
        offlineWorkersCount: number;
        recoveredJobsCount: number;
    }>;
}
