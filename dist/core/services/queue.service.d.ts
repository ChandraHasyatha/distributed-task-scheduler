import { Queue, QueueStats, RetryPolicy } from '../types/index.js';
export declare class QueueService {
    static createQueue(params: {
        projectId: string;
        name: string;
        priority?: number;
        concurrencyLimit?: number;
        retryPolicyId?: string;
        shardCount?: number;
    }): Promise<Queue>;
    static getQueueById(id: string): Promise<(Queue & {
        stats: QueueStats;
    }) | null>;
    static listQueuesByProject(projectId: string): Promise<(Queue & {
        stats: QueueStats;
    })[]>;
    static updateQueue(id: string, updates: {
        name?: string;
        priority?: number;
        concurrencyLimit?: number;
        retryPolicyId?: string | null;
        shardCount?: number;
    }): Promise<Queue | null>;
    static setPaused(id: string, isPaused: boolean): Promise<Queue | null>;
    static deleteQueue(id: string): Promise<boolean>;
    static getQueueStats(queueId: string): Promise<QueueStats>;
    static createRetryPolicy(params: {
        projectId: string;
        name: string;
        strategy: 'FIXED' | 'LINEAR' | 'EXPONENTIAL';
        maxAttempts?: number;
        initialIntervalMs?: number;
        maxIntervalMs?: number;
        backoffFactor?: number;
    }): Promise<RetryPolicy>;
    static listRetryPolicies(projectId: string): Promise<RetryPolicy[]>;
}
