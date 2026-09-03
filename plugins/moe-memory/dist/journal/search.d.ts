/**
 * Journal retrieval.
 *
 * Reconciled from private-journal-mcp's `SearchService`. The storage half lost:
 * its `search()` loaded every `.embedding` sidecar under both roots into memory
 * on every query and cosine-scored them in JS — O(n) I/O and O(n) memory per
 * call, with no cache. That is replaced by the same sqlite-vec KNN the
 * conversation half uses, over `vec_journal_entries`.
 *
 * Two things were carried FORWARD unchanged in substance, because they are the
 * best-engineered code in that source and the conversation half has no
 * equivalent:
 *
 *   - `readEntry`'s two-stage containment guard: resolve, require `.md`, require
 *     containment in the journal roots, realpath, then require containment in
 *     the REALPATH'd roots. The second stage blocks a symlink escape, and the
 *     two stages exist precisely because macOS `/tmp` and `/var` are symlinks —
 *     do not "simplify" it to one check.
 *   - `generateExcerpt`, in ./markdown.ts.
 *
 * `SearchResult` and `SearchOptions` were exported by BOTH upstream `search.ts`
 * files with different shapes. The conversation names keep their meaning; these
 * are `JournalSearchResult` and `JournalSearchOptions`, so the barrel can export
 * all four.
 */
import type { MemoryDatabase } from "../db.js";
import { type EmbedFn } from "../embeddings.js";
import type { JournalScope, JournalSearchResult } from "../types.js";
/** `both` means "do not filter by scope", matching upstream's `type` parameter. */
export type JournalScopeFilter = JournalScope | "both";
export interface JournalSearchOptions {
    limit?: number | undefined;
    minScore?: number | undefined;
    sections?: string[] | undefined;
    dateRange?: {
        start?: Date | undefined;
        end?: Date | undefined;
    } | undefined;
    /** Which journal to search. Named `type` on the MCP wire; kept as `scope` here. */
    scope?: JournalScopeFilter | undefined;
}
export interface JournalRecentOptions {
    limit?: number | undefined;
    scope?: JournalScopeFilter | undefined;
    dateRange?: {
        start?: Date | undefined;
        end?: Date | undefined;
    } | undefined;
}
export interface JournalEntryContent {
    path: string;
    content: string;
    sections: string[];
    timestamp: number;
    scope: JournalScope;
}
export interface JournalSearchServiceOptions {
    /**
     * Injected query encoder. Defaults to `generateQueryEmbedding`, which prepends
     * the BGE retrieval prefix — bge is asymmetric, and private-journal-mcp
     * embedded its queries with the same call it used for documents, which costs
     * recall silently. The seam exists so the CI-safe test project can exercise
     * retrieval without a model download; production should never pass it.
     */
    embedQuery?: EmbedFn | undefined;
}
export declare class JournalSearchService {
    private readonly db;
    private readonly roots;
    private readonly embedQuery;
    /**
     * @param db    an open database from `initDatabase()`
     * @param roots the journal roots, already de-duplicated (see `JournalStore.roots`)
     */
    constructor(db: MemoryDatabase, roots: string[], options?: JournalSearchServiceOptions);
    search(query: string, options?: JournalSearchOptions): Promise<JournalSearchResult[]>;
    listRecent(options?: JournalRecentOptions): JournalSearchResult[];
    readRecentEntries(options?: {
        limit?: number | undefined;
        scope?: JournalScopeFilter | undefined;
    }): Promise<JournalEntryContent[]>;
    /**
     * Read one entry off disk.
     *
     * Carried over from private-journal-mcp with its guard intact. The error text
     * is treated as API by three assertions, so it is preserved verbatim.
     */
    readEntry(filePath: string): Promise<string | null>;
    private realRoots;
}
export interface JournalTextSearchOptions {
    limit?: number | undefined;
    scope?: JournalScopeFilter | undefined;
    dateRange?: {
        start?: Date | undefined;
        end?: Date | undefined;
    } | undefined;
}
export interface JournalTextSearchResult {
    entry: {
        id: string;
        path: string;
        root: string;
        scope: JournalScope;
        timestamp: number;
        text: string;
        sections: string[];
    };
    embeddingVersion: number;
    excerpt: string;
}
export declare function searchJournalText(db: MemoryDatabase, query: string, roots: readonly string[], options?: JournalTextSearchOptions): JournalTextSearchResult[];
