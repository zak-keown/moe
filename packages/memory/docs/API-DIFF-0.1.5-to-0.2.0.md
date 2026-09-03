# API Diff: @bubstack/moe-memory 0.1.5 → 0.2.0

## Retained exports

| Symbol | Module |
|--------|--------|
| `SUMMARIZER_CONTEXT_MARKER` | constants |
| `EMBEDDING_DIMENSIONS` | constants |
| `parseConversation` | parser |
| `parseConversationFile` | parser |
| `JOURNAL_DIR_NAME` | paths |
| `getClaudeDir` | paths |
| `getCodexDir` | paths |
| `getConversationSourceDirs` | paths |
| `findJsonlFiles` | paths |
| `getMemoryDataDir` | paths |
| `getArchiveDir` | paths |
| `getIndexDir` | paths |
| `getModelCacheDir` | paths |
| `getDbPath` | paths |
| `getExcludeConfigPath` | paths |
| `getExcludedProjects` | paths |
| `resolveJournalPath` | paths |
| `resolveProjectJournalPath` | paths |
| `resolveUserJournalPath` | paths |
| `journalRoots` | paths |
| `l2DistanceToCosineSimilarity` | search |
| `searchConversations` | search |
| `formatResults` | search |
| `searchMultipleConcepts` | search |
| `formatMultiConceptResults` | search |
| `JOURNAL_SECTION_HEADINGS` | types |
| `ConversationExchange` (type) | types |
| `SearchResult` (type) | types |
| `MultiConceptResult` (type) | types |
| `JournalEntry` (type) | types |
| `JournalScope` (type) | types |
| `JournalSearchResult` (type) | types |
| `MemoryEdge` (type) | types |
| `MemoryNode` (type) | types |

## Removed exports

| Symbol | Reason | Replacement |
|--------|--------|-------------|
| `initDatabase` | Raw database handle | Use CLI / MCP |
| `migrateSchema` | Internal migration | Automatic on startup |
| `migrateJournalRoot` | Internal migration | Automatic on startup |
| `migrateToolCallsCascade` | Internal migration | Automatic on startup |
| `insertExchange` | Raw database write | `moe-memory sync` CLI |
| `deleteExchange` | Raw database write | `moe-memory verify --repair` |
| `getAllExchanges` | Raw database read | `moe-memory stats` CLI |
| `getFileLastIndexed` | Internal indexer state | N/A |
| `journalEntryFromRow` | Internal row mapper | N/A |
| `JOURNAL_SELECT_COLUMNS` | Internal SQL fragment | N/A |
| `upsertJournalEntry` | Raw database write | `moe-memory journal index` |
| `deleteJournalEntry` | Raw database write | `moe-memory journal index` |
| `getJournalIndexState` | Internal indexer state | N/A |
| `countJournalEntries` | Internal stat | `moe-memory stats` CLI |
| `insertNode` | Raw graph write | MCP `create_memory_node` |
| `insertEdge` | Raw graph write | MCP `create_memory_edge` |
| `getNode` | Raw graph read | MCP `get_memory_node` |
| `getEdgesFrom` | Raw graph read | MCP `get_memory_edges` |
| `getEdgesTo` | Raw graph read | MCP `get_memory_edges` |
| `traceProvenance` | Raw graph read | MCP `trace_provenance` |
| `EMBEDDING_VERSION` | Internal versioning | N/A |
| `acquireMigrationLock` | Internal locking | N/A |
| `releaseMigrationLock` | Internal locking | N/A |
| `pickStaleBatch` | Internal migration | N/A |
| `recordReembedded` | Internal migration | N/A |
| `countStale` | Internal migration | N/A |
| `getMigrationLockPath` | Internal path | N/A |
| `runMigrationBatch` | Internal migration | `moe-memory sync` CLI |
| `BGE_QUERY_PREFIX` | Embedding internals | N/A |
| `initEmbeddings` | Embedding lifecycle | Automatic |
| `resetEmbeddings` | Embedding lifecycle | N/A |
| `generateEmbedding` | Raw embedding | N/A |
| `withQueryPrefix` | Embedding internals | N/A |
| `generateQueryEmbedding` | Raw embedding | N/A |
| `generateExchangeEmbedding` | Raw embedding | N/A |
| `generateEntryEmbedding` | Raw embedding | N/A |
| `indexConversations` | Internal indexer | `moe-memory sync` CLI |
| `indexSession` | Internal indexer | `moe-memory sync` CLI |
| `indexUnprocessed` | Internal indexer | `moe-memory sync` CLI |
| `JournalSearchService` | Internal class | MCP `search_journal` |
| `JournalStore` | Internal class | MCP journal tools |
| `DAY_DIR_PATTERN` | Internal pattern | N/A |
| `extractSearchableText` | Internal parser | N/A |
| `formatDayDirectory` | Internal formatter | N/A |
| `formatEntry` | Internal formatter | `moe-memory journal write` |
| `formatEntryBasename` | Internal formatter | N/A |
| `generateExcerpt` | Internal formatter | N/A |
| `journalEntryId` | Internal ID generator | N/A |
| `sectionsMatch` | Internal filter | N/A |
| `timestampFromEntryPath` | Internal parser | N/A |
| `timestampFromFrontmatter` | Internal parser | N/A |
| `SummarizerSdkError` | Internal error class | N/A |
| `isResumeFailure` | Internal error check | N/A |
| `getApiEnv` | Internal config | N/A |
| `shouldSkipReentrantSync` | Internal guard | N/A |
| `formatConversationText` | Internal formatter | N/A |
| `buildSummarizerQueryOptions` | Internal config | N/A |
| `buildCodexSummaryPrompt` | Internal prompt | N/A |
| `buildCodexSummarizerCommand` | Internal command | N/A |
| `runCodexCommand` | Internal executor | N/A |
| `getCodexModel` | Internal config | N/A |
| `summarizeConversation` | Internal summarizer | `moe-memory sync` CLI |
