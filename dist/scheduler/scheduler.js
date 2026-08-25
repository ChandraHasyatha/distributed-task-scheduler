import { SchedulerService } from '../core/services/scheduler.service.js';
import { ReaperService } from '../core/services/reaper.service.js';
import { WorkflowService } from '../core/services/workflow.service.js';
import { config } from '../core/config.js';
import { logger } from '../core/logger/index.js';
export class SchedulerDaemon {
    isRunning = false;
    timer = null;
    async start() {
        logger.info('Starting Scheduler & Reaper Daemon...');
        this.isRunning = true;
        const runLoop = async () => {
            if (!this.isRunning)
                return;
            try {
                const promotedCount = await SchedulerService.promoteDueScheduledJobs();
                if (promotedCount > 0) {
                    logger.info(`Scheduler promoted ${promotedCount} scheduled jobs to QUEUED`);
                }
                const triggeredCount = await SchedulerService.triggerDueCronSchedules();
                if (triggeredCount > 0) {
                    logger.info(`Scheduler triggered ${triggeredCount} recurring cron schedules`);
                }
                // WORKFLOW/DAG safety net: catches any WAITING job whose parents
                // completed but that missed eager promotion (e.g. after a restart).
                const unblockedCount = await WorkflowService.promoteUnblockedJobs();
                if (unblockedCount > 0) {
                    logger.info(`Scheduler promoted ${unblockedCount} workflow-unblocked jobs to QUEUED`);
                }
                // DISTRIBUTED LOCKING: only the instance that wins the advisory
                // lock actually runs the reaper sweep this tick, so running
                // multiple scheduler/reaper daemons for HA is safe.
                const recoveryResult = await ReaperService.recoverStaleWorkersIfLeader(config.worker.staleHeartbeatThresholdMs);
                if (recoveryResult.offlineWorkersCount > 0 || recoveryResult.recoveredJobsCount > 0) {
                    logger.warn(recoveryResult, 'Reaper recovery run');
                }
            }
            catch (err) {
                logger.error({ err }, 'Error during scheduler cycle');
            }
            finally {
                if (this.isRunning) {
                    this.timer = setTimeout(runLoop, config.scheduler.pollIntervalMs);
                }
            }
        };
        runLoop();
        this.registerSignalHandlers();
    }
    registerSignalHandlers() {
        const shutdown = () => {
            logger.info('Stopping Scheduler daemon...');
            this.isRunning = false;
            if (this.timer)
                clearTimeout(this.timer);
            process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }
}
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const daemon = new SchedulerDaemon();
    daemon.start().catch((err) => {
        logger.error({ err }, 'Scheduler daemon failed to start');
        process.exit(1);
    });
}
//# sourceMappingURL=scheduler.js.map