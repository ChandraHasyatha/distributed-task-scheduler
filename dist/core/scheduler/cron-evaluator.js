import { Cron } from 'croner';
export function calculateNextCronRun(cronExpression, timezone = 'UTC', fromDate = new Date()) {
    try {
        const job = new Cron(cronExpression, { timezone });
        const next = job.nextRun(fromDate);
        if (!next) {
            throw new Error(`Cron expression '${cronExpression}' has no future run dates`);
        }
        return next;
    }
    catch (err) {
        throw new Error(`Invalid cron expression '${cronExpression}': ${err.message}`);
    }
}
export function isValidCronExpression(cronExpression) {
    try {
        new Cron(cronExpression);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=cron-evaluator.js.map