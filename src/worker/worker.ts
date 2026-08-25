import os from 'os';
import { WorkerService } from '../core/services/worker.service.js';
import { JobExecutor } from './executor.js';
import { QueuePoller } from './poller.js';
import { config } from '../core/config.js';
import { logger } from '../core/logger/index.js';
import { Worker } from '../core/types/index.js';

export class WorkerDaemon {
  private workerRecord: Worker | null = null;
  private poller: QueuePoller | null = null;
  private isRunning: boolean = false;
  private isDraining: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    logger.info('Initializing Worker Daemon...');

    this.workerRecord = await WorkerService.registerWorker({
      hostname: os.hostname(),
      pid: process.pid,
      concurrencyLimit: config.worker.concurrency,
      // QUEUE SHARDING (bonus feature): set WORKER_SHARD_ID to run this
      // worker instance against only one partition of a sharded queue's
      // claimable jobs (see WorkerService.claimJobsFromQueue).
      shardId: config.sharding.shardId,
    });

    this.poller = new QueuePoller(this.workerRecord.id, config.worker.concurrency, config.sharding.shardId);
    this.isRunning = true;

    logger.info(`Worker registered: ID=${this.workerRecord.id}, Concurrency=${config.worker.concurrency}`);

    this.startHeartbeatLoop();
    this.startPollingLoop();
    this.registerSignalHandlers();
  }

  private startHeartbeatLoop(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (!this.workerRecord || !this.poller) return;
      try {
        const mem = process.memoryUsage();
        await WorkerService.recordHeartbeat({
          workerId: this.workerRecord.id,
          activeJobsCount: this.poller.getActiveCount(),
          cpuUsagePct: 0,
          memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
        });
      } catch (err: any) {
        logger.error({ err }, 'Heartbeat failed');
      }
    }, config.worker.heartbeatIntervalMs);
  }

  private startPollingLoop(): void {
    const runPollCycle = async () => {
      if (!this.isRunning || this.isDraining || !this.poller || !this.workerRecord) return;

      try {
        const jobs = await this.poller.pollAndClaim();

        if (jobs.length > 0) {
          logger.info(`Worker claimed ${jobs.length} jobs`);
          for (const job of jobs) {
            this.poller.trackJobStarted(job.id);

            JobExecutor.execute(job, this.workerRecord.id)
              .catch((err) => logger.error({ err }, `Unhandled execution error for job ${job.id}`))
              .finally(() => {
                this.poller?.trackJobFinished(job.id);
              });
          }
        }
      } catch (err: any) {
        logger.error({ err }, 'Error during poll cycle');
      } finally {
        if (this.isRunning && !this.isDraining) {
          this.pollTimer = setTimeout(runPollCycle, config.worker.pollIntervalMs);
        }
      }
    };

    runPollCycle();
  }

  private registerSignalHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.warn(`Received ${signal}. Initiating graceful shutdown...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  async shutdown(timeoutMs: number = 15000): Promise<void> {
    this.isDraining = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);

    if (this.workerRecord) {
      await WorkerService.setWorkerStatus(this.workerRecord.id, 'DRAINING');
    }

    logger.info(`Draining worker. Waiting for ${this.poller?.getActiveCount() || 0} active jobs to finish...`);

    const start = Date.now();
    while (this.poller && this.poller.getActiveCount() > 0 && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    if (this.workerRecord) {
      await WorkerService.setWorkerStatus(this.workerRecord.id, 'OFFLINE');
    }

    this.isRunning = false;
    logger.info('Worker daemon shut down cleanly.');
  }
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const daemon = new WorkerDaemon();
  daemon.start().catch((err) => {
    logger.error({ err }, 'Worker failed to start');
    process.exit(1);
  });
}
