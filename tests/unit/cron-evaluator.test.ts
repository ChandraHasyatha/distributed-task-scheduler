import { describe, it, expect } from 'vitest';
import {
  calculateNextCronRun,
  isValidCronExpression,
} from '../../src/core/scheduler/cron-evaluator.js';

describe('Cron Evaluator', () => {
  it('validates cron expressions correctly', () => {
    expect(isValidCronExpression('0 * * * *')).toBe(true);
    expect(isValidCronExpression('*/5 * * * *')).toBe(true);
    expect(isValidCronExpression('0 0 1 1 *')).toBe(true);
    expect(isValidCronExpression('invalid-cron')).toBe(false);
    expect(isValidCronExpression('99 99 * * *')).toBe(false);
  });

  it('calculates the next run date for standard every-minute cron', () => {
    const base = new Date('2026-03-15T10:30:15.000Z');
    const next = calculateNextCronRun('* * * * *', 'UTC', base);
    expect(next.toISOString()).toBe('2026-03-15T10:31:00.000Z');
  });

  it('calculates next hourly run date', () => {
    const base = new Date('2026-03-15T10:30:15.000Z');
    const next = calculateNextCronRun('0 * * * *', 'UTC', base);
    expect(next.toISOString()).toBe('2026-03-15T11:00:00.000Z');
  });
});
