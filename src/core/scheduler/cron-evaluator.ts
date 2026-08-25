import { Cron } from 'croner';

export function calculateNextCronRun(
  cronExpression: string,
  timezone: string = 'UTC',
  fromDate: Date = new Date()
): Date {
  try {
    const job = new Cron(cronExpression, { timezone });
    const next = job.nextRun(fromDate);
    if (!next) {
      throw new Error(`Cron expression '${cronExpression}' has no future run dates`);
    }
    return next;
  } catch (err: any) {
    throw new Error(`Invalid cron expression '${cronExpression}': ${err.message}`);
  }
}

export function isValidCronExpression(cronExpression: string): boolean {
  try {
    new Cron(cronExpression);
    return true;
  } catch {
    return false;
  }
}
