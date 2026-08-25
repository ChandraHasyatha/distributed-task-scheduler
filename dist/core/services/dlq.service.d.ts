import { DeadLetterEntry, Job } from '../types/index.js';
export declare class DlqService {
    static listDlq(params: {
        queueId?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        entries: (DeadLetterEntry & {
            job_type: string;
            payload: any;
        })[];
        total: number;
    }>;
    static getDlqEntry(dlqId: string): Promise<(DeadLetterEntry & {
        job_type: string;
        payload: any;
    }) | null>;
    static replayJob(dlqId: string, replayedByUserId?: string): Promise<Job | null>;
    static purgeDlqEntry(dlqId: string): Promise<boolean>;
}
