import type { DatabaseSync } from "node:sqlite";
import { initDatabase } from "./db.js";
import { JournalSearchService } from "./journal/search.js";
import { JournalStore } from "./journal/store.js";
import type { SearchOptions } from "./search.js";
import {
  searchConversations,
  searchMultipleConcepts,
} from "./search.js";
import type { MultiConceptResult, SearchResult } from "./types.js";

export interface MemoryToolRuntime {
  searchConversations(query: string, options: SearchOptions): Promise<SearchResult[]>;
  searchMultipleConcepts(query: string[], options: Omit<SearchOptions, "mode">): Promise<MultiConceptResult[]>;
  openDatabase(): DatabaseSync;
  createJournalSearch(store: JournalStore): JournalSearchService;
}

export type MemoryToolRuntimeFactory = () => Promise<MemoryToolRuntime>;

export function createDefaultRuntime(): MemoryToolRuntime {
  return {
    searchConversations,
    searchMultipleConcepts,
    openDatabase: initDatabase,
    createJournalSearch(store: JournalStore) {
      const db = initDatabase();
      return new JournalSearchService(
        db,
        store.roots().map((r) => r.path),
      );
    },
  };
}

let cachedRuntime: MemoryToolRuntime | undefined;

export async function createLazyRuntime(): Promise<MemoryToolRuntime> {
  if (!cachedRuntime) {
    cachedRuntime = createDefaultRuntime();
  }
  return cachedRuntime;
}
