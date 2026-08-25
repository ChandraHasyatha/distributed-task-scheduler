import { describe, it, expect } from 'vitest';
import { calculateBackoffDelay, getNextRunAt } from '../../src/core/retry/calculator.js';

describe('Retry Backoff Calculator', () => {
  it('should return 0 for attempt <= 0', () => {
    expect(
      calculateBackoffDelay(0, {
        strategy: 'EXPONENTIAL',
        maxAttempts: 3,
        initialIntervalMs: 1000,
        maxIntervalMs: 10000,
        backoffFactor: 2,
      })
    ).toBe(0);
  });

  it('should calculate FIXED backoff correctly', () => {
    const policy = {
      strategy: 'FIXED' as const,
      maxAttempts: 5,
      initialIntervalMs: 2000,
      maxIntervalMs: 10000,
      backoffFactor: 2,
    };
    expect(calculateBackoffDelay(1, policy)).toBe(2000);
    expect(calculateBackoffDelay(2, policy)).toBe(2000);
    expect(calculateBackoffDelay(3, policy)).toBe(2000);
  });

  it('should calculate LINEAR backoff correctly', () => {
    const policy = {
      strategy: 'LINEAR' as const,
      maxAttempts: 5,
      initialIntervalMs: 1500,
      maxIntervalMs: 10000,
      backoffFactor: 2,
    };
    expect(calculateBackoffDelay(1, policy)).toBe(1500);
    expect(calculateBackoffDelay(2, policy)).toBe(3000);
    expect(calculateBackoffDelay(3, policy)).toBe(4500);
    expect(calculateBackoffDelay(4, policy)).toBe(6000);
  });

  it('should calculate EXPONENTIAL backoff correctly', () => {
    const policy = {
      strategy: 'EXPONENTIAL' as const,
      maxAttempts: 5,
      initialIntervalMs: 1000,
      maxIntervalMs: 10000,
      backoffFactor: 2,
    };
    // formula: initial * factor^(attempt - 1)
    expect(calculateBackoffDelay(1, policy)).toBe(1000); // 1000 * 2^0 = 1000
    expect(calculateBackoffDelay(2, policy)).toBe(2000); // 1000 * 2^1 = 2000
    expect(calculateBackoffDelay(3, policy)).toBe(4000); // 1000 * 2^2 = 4000
    expect(calculateBackoffDelay(4, policy)).toBe(8000); // 1000 * 2^3 = 8000
    expect(calculateBackoffDelay(5, policy)).toBe(10000); // capped at maxIntervalMs 10000
  });

  it('should cap delay at maxIntervalMs', () => {
    const policy = {
      strategy: 'EXPONENTIAL' as const,
      maxAttempts: 10,
      initialIntervalMs: 1000,
      maxIntervalMs: 5000,
      backoffFactor: 3,
    };
    expect(calculateBackoffDelay(4, policy)).toBe(5000);
  });

  it('should calculate correct next_run_at timestamp', () => {
    const policy = {
      strategy: 'FIXED' as const,
      maxAttempts: 3,
      initialIntervalMs: 3000,
      maxIntervalMs: 10000,
      backoffFactor: 2,
    };
    const now = new Date('2026-01-01T12:00:00.000Z');
    const nextRun = getNextRunAt(1, policy, now);
    expect(nextRun.toISOString()).toBe('2026-01-01T12:00:03.000Z');
  });
});
