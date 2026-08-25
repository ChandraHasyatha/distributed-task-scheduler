import { RetryPolicy, RetryStrategy } from '../types/index.js';

export interface BackoffOptions {
  strategy: RetryStrategy;
  maxAttempts: number;
  initialIntervalMs: number;
  maxIntervalMs: number;
  backoffFactor: number;
  withJitter?: boolean;
}

export function calculateBackoffDelay(
  attemptNumber: number,
  policy: BackoffOptions
): number {
  if (attemptNumber <= 0) return 0;

  const { strategy, initialIntervalMs, maxIntervalMs, backoffFactor, withJitter } = policy;

  let delay = initialIntervalMs;

  switch (strategy) {
    case 'FIXED':
      delay = initialIntervalMs;
      break;

    case 'LINEAR':
      delay = initialIntervalMs * attemptNumber;
      break;

    case 'EXPONENTIAL':
      delay = initialIntervalMs * Math.pow(backoffFactor, attemptNumber - 1);
      break;

    default:
      delay = initialIntervalMs;
  }

  // Cap at max interval
  delay = Math.min(delay, maxIntervalMs);

  // Optional Jitter (Full Jitter ±20%)
  if (withJitter) {
    const jitterFactor = 0.8 + Math.random() * 0.4; // between 0.8 and 1.2
    delay = Math.round(delay * jitterFactor);
  }

  return Math.max(0, Math.round(delay));
}

export function getNextRunAt(
  attemptNumber: number,
  policy: BackoffOptions,
  baseDate: Date = new Date()
): Date {
  const delayMs = calculateBackoffDelay(attemptNumber, policy);
  return new Date(baseDate.getTime() + delayMs);
}
