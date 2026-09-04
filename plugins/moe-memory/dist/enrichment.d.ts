import type { MemoryDatabase } from "./db.js";
export interface PendingEnrichment {
    family: "exchange" | "journal";
    id: string;
    sourceText: string;
    epoch: number;
}
export interface JournalTextResult {
    id: string;
    path: string;
    root: string;
    scope: string;
    timestamp: number;
    text: string;
    sections: string[];
    embeddingVersion: number;
    excerpt: string;
}
export declare function pickPendingEnrichment(db: MemoryDatabase, limit?: number): PendingEnrichment[];
export declare function commitEnrichment(db: MemoryDatabase, item: PendingEnrichment, vector: Float32Array): void;
export declare function searchJournalText(db: MemoryDatabase, query: string, options?: {
    roots?: readonly string[];
    scope?: "project" | "user" | "both";
    dateRange?: {
        start?: Date;
        end?: Date;
    };
    limit?: number;
}): JournalTextResult[];
