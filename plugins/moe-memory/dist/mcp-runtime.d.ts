import type { DatabaseSync } from "node:sqlite";
import { JournalSearchService } from "./journal/search.js";
import type { JournalStore } from "./journal/store.js";
import type { SearchOptions } from "./search.js";
import type { MultiConceptResult, SearchResult } from "./types.js";
export interface MemoryToolRuntime {
    searchConversations(query: string, options: SearchOptions): Promise<SearchResult[]>;
    searchMultipleConcepts(query: string[], options: Omit<SearchOptions, "mode">): Promise<MultiConceptResult[]>;
    openDatabase(): DatabaseSync;
    createJournalSearch(store: JournalStore): JournalSearchService;
}
export type MemoryToolRuntimeFactory = () => Promise<MemoryToolRuntime>;
export declare function createDefaultRuntime(): MemoryToolRuntime;
export declare function createLazyRuntime(): Promise<MemoryToolRuntime>;
