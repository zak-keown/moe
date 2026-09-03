export interface VerificationResult {
    missing: Array<{
        path: string;
        reason: string;
    }>;
    orphaned: Array<{
        uuid: string;
        path: string;
    }>;
    outdated: Array<{
        path: string;
        fileTime: number;
        dbTime: number;
    }>;
    corrupted: Array<{
        path: string;
        error: string;
    }>;
}
export declare function verifyIndex(): Promise<VerificationResult>;
export interface RepairOptions {
    /**
     * Skip AI summary generation. Mirrors `moe-memory index --no-summaries`, which
     * every other indexing entry point already had; `repair` did not, so its only
     * code path required live Claude auth.
     */
    noSummaries?: boolean | undefined;
}
export declare function repairIndex(issues: VerificationResult, options?: RepairOptions): Promise<void>;
