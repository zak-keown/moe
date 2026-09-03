/**
 * The in-transcript opt-out a user types to keep a conversation out of the index.
 *
 * ⚠️ HIGHEST-RISK RENAME IN THE PACKAGE, and the reason BOTH forms are here
 * permanently. This is a marker people have already typed into transcripts
 * sitting on disk. Renaming it and dropping the old form does not fail loudly —
 * it silently starts indexing every conversation a user had explicitly marked
 * DO-NOT-INDEX. So the upstream marker is honoured forever; it is data, not a
 * brand token, and Zone B reasoning applies to it even though it lives in Zone A
 * code.
 */
export declare const EXCLUSION_MARKER = "<INSTRUCTIONS-TO-MOE-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-MOE-MEMORY>";
/** The upstream form. Accepted permanently — see EXCLUSION_MARKER. */
export declare const LEGACY_EXCLUSION_MARKER = "<INSTRUCTIONS-TO-EPISODIC-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-EPISODIC-MEMORY>";
export declare const EXCLUSION_MARKERS: string[];
/** True when a transcript carries any marker that keeps it out of the index. */
export declare function shouldSkipConversation(filePath: string): boolean;
export interface SyncResult {
    copied: number;
    skipped: number;
    indexed: number;
    summarized: number;
    errors: Array<{
        file: string;
        error: string;
    }>;
}
export interface SyncOptions {
    skipIndex?: boolean;
    skipSummaries?: boolean;
    summaryLimit?: number;
}
export declare function extractSessionIdFromPath(filePath: string): string | null;
export declare function syncConversations(sourceDir: string, destDir: string, options?: SyncOptions): Promise<SyncResult>;
