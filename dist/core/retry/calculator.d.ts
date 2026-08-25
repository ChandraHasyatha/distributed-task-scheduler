import { RetryStrategy } from '../types/index.js';
export interface BackoffOptions {
    strategy: RetryStrategy;
    maxAttempts: number;
    initialIntervalMs: number;
    maxIntervalMs: number;
    backoffFactor: number;
    withJitter?: boolean;
}
export declare function calculateBackoffDelay(attemptNumber: number, policy: BackoffOptions): number;
export declare function getNextRunAt(attemptNumber: number, policy: BackoffOptions, baseDate?: Date): Date;
