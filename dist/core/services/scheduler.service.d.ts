import { ScheduledJob } from '../types/index.js';
export declare class SchedulerService {
    static createScheduledJob(params: {
        projectId: string;
        queueId: string;
        name: string;
        cronExpression: string;
        jobType: string;
        payload?: Record<string, any>;
        timezone?: string;
    }): Promise<ScheduledJob>;
    static listScheduledJobs(projectId: string): Promise<ScheduledJob[]>;
    static toggleScheduledJob(id: string, isActive: boolean): Promise<ScheduledJob | null>;
    static deleteScheduledJob(id: string): Promise<boolean>;
    /**
     * Promotes delayed/scheduled jobs whose run_at <= NOW() to QUEUED
     */
    static promoteDueScheduledJobs(): Promise<number>;
    /**
     * Evaluates active recurring cron jobs, spawns jobs atomically, and calculates next_run_at.
     * Atomically claims due schedules in a single UPDATE statement to prevent race conditions.
     */
    static triggerDueCronSchedules(): Promise<number>;
}
