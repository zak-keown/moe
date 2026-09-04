import {
  type ConversationExchange,
  EMBEDDING_DIMENSIONS,
  findJsonlFiles,
  formatMultiConceptResults,
  formatResults,
  getArchiveDir,
  getClaudeDir,
  getCodexDir,
  getConversationSourceDirs,
  getDbPath,
  getExcludeConfigPath,
  getExcludedProjects,
  getIndexDir,
  getMemoryDataDir,
  getModelCacheDir,
  JOURNAL_DIR_NAME,
  JOURNAL_SECTION_HEADINGS,
  type JournalEntry,
  type JournalScope,
  type JournalSearchResult,
  journalRoots,
  l2DistanceToCosineSimilarity,
  type MemoryEdge,
  type MemoryNode,
  type MultiConceptResult,
  parseConversation,
  parseConversationFile,
  resolveJournalPath,
  resolveProjectJournalPath,
  resolveUserJournalPath,
  type SearchResult,
  SUMMARIZER_CONTEXT_MARKER,
  searchConversations,
  searchMultipleConcepts,
} from "@bubstack/moe-memory";

const _constants: [string, number] = [SUMMARIZER_CONTEXT_MARKER, EMBEDDING_DIMENSIONS];
const _journalDir: string = JOURNAL_DIR_NAME;
const _headings: ReadonlyArray<[string, string]> = JOURNAL_SECTION_HEADINGS;

const _paths: string[] = [
  getClaudeDir(),
  getCodexDir(),
  getMemoryDataDir(),
  getArchiveDir(),
  getIndexDir(),
  getModelCacheDir(),
  getDbPath(),
  getExcludeConfigPath(),
];
const _dirs: string[] = getConversationSourceDirs();
const _files: string[] = findJsonlFiles(".");
const _excluded: string[] = getExcludedProjects();
const _journal: string = resolveJournalPath("project", true);
const _projJournal: string = resolveProjectJournalPath();
const _userJournal: string = resolveUserJournalPath();
const _roots: string[] = journalRoots();

const _sim: number = l2DistanceToCosineSimilarity(0.5);

void parseConversation;
void parseConversationFile;
void searchConversations;
void formatResults;
void searchMultipleConcepts;
void formatMultiConceptResults;

type _AssertTypes =
  | ConversationExchange
  | SearchResult
  | MultiConceptResult
  | JournalEntry
  | JournalScope
  | JournalSearchResult
  | MemoryEdge
  | MemoryNode;
void (undefined as unknown as _AssertTypes);
