/**
 * Conversation-exchange retrieval: sqlite-vec KNN, SQL LIKE, or both.
 *
 * This is the implementation that WON the reconciliation. private-journal-mcp's
 * `search.ts` scanned every `.embedding` JSON sidecar into memory and scored it
 * in JS; journal entries now get rows in the same store and are queried through
 * journal/search.ts, which reuses `l2DistanceToCosineSimilarity` from here.
 */
import type { MultiConceptResult, SearchResult } from "./types.js";
export interface SearchOptions {
    limit?: number | undefined;
    mode?: "vector" | "text" | "both" | undefined;
    after?: string | undefined;
    before?: string | undefined;
    project?: string | undefined;
    session_id?: string | undefined;
    git_branch?: string | undefined;
}
/**
 * Convert an L2 (Euclidean) distance between two unit-normalized vectors
 * into a cosine similarity in [-1, 1].
 *
 * For unit vectors u, v:  ||u - v||^2 = 2 - 2 * cos(u, v)
 * Therefore:               cos(u, v) = 1 - d^2 / 2
 *
 * ⚠️ Valid ONLY because src/embeddings.ts passes `normalize: true`. That coupling
 * is invisible to the compiler: flip normalisation and every score here is
 * silently wrong with no type error and no exception. Both record types share the
 * encoder, so both share this constraint — journal/search.ts calls this function.
 */
export declare function l2DistanceToCosineSimilarity(distance: number): number;
export declare function searchConversations(query: string, options?: SearchOptions): Promise<SearchResult[]>;
export declare function formatResults(results: SearchResult[]): Promise<string>;
export declare function searchMultipleConcepts(concepts: string[], options?: Omit<SearchOptions, "mode">): Promise<MultiConceptResult[]>;
export declare function formatMultiConceptResults(results: MultiConceptResult[], concepts: string[]): Promise<string>;
