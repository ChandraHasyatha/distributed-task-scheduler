/**
 * AI-GENERATED FAILURE SUMMARIES
 * ===============================
 * When a job exhausts its retries and lands in the DLQ, we generate a
 * short, human-readable summary explaining what likely went wrong and
 * what to check next — the kind of triage note an on-call engineer would
 * otherwise have to write by hand from raw error/stack text.
 *
 * If `ANTHROPIC_API_KEY` is configured, the summary is produced by
 * calling Claude. Otherwise we fall back to a deterministic, rule-based
 * summarizer so the feature works out of the box in any environment
 * (including CI / take-home grading) without requiring API credentials.
 */
export declare class AiSummaryService {
    static summarizeFailure(params: {
        dlqId: string;
        jobType: string;
        payload: Record<string, any>;
        failedReason: string;
        totalAttempts: number;
        errorHistory?: {
            attempt: number;
            error: string | null;
        }[];
    }): Promise<string>;
    private static summarizeWithClaude;
    /** Deterministic fallback: pattern-matches common failure classes from the error text. */
    private static summarizeHeuristically;
}
