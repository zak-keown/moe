/**
 * The journal write path and its index.
 *
 * Reconciled from private-journal-mcp's `JournalManager`. The markdown-writing
 * half is carried over essentially unchanged — it is a data contract with files
 * already on disk. The persistence half changed completely: entries are indexed
 * into the shared SQLite store instead of a `.embedding` JSON sidecar per file.
 *
 * That swap fixes a real defect. Upstream, `generateEmbeddingForEntry` caught and
 * logged every embedding error so "embedding failure shouldn't prevent journal
 * writing" — but the sidecar index was the ONLY enumeration path in the package,
 * so a failed encode wrote an entry that no read path could ever see again, with
 * no doctor or verify command to notice. Here the markdown files are the source
 * of truth: `indexJournal()` walks them, and anything missing from the index or
 * behind the current EMBEDDING_VERSION is picked up on the next run.
 */
import type Database from "better-sqlite3";
import { type EmbedFn } from "../embeddings.js";
import type { JournalScope, JournalThoughts } from "../types.js";
export interface JournalStoreOptions {
    projectPath?: string | undefined;
    userPath?: string | undefined;
    /**
     * Injected encoder. Defaults to the real bge pipeline; the offline test
     * project passes a deterministic stub so the write path and the index can be
     * exercised without a 35 MB model download.
     */
    embed?: EmbedFn | undefined;
}
export interface JournalIndexResult {
    indexed: number;
    pruned: number;
    failed: number;
    total: number;
}
interface JournalRoot {
    scope: JournalScope;
    path: string;
}
export declare class JournalStore {
    private readonly projectPath;
    private readonly userPath;
    private readonly embed;
    constructor(options?: JournalStoreOptions);
    /**
     * The roots to walk, de-duplicated.
     *
     * When `MOE_MEMORY_JOURNAL_PATH` is set both resolve to the same directory.
     * Upstream loaded such a directory twice — once labelled `project`, once
     * `user` — so every entry appeared twice with contradictory labels and
     * `limit: 10` yielded 5 unique entries. That is the documented containerised
     * configuration, i.e. the one most likely to be used in infra.
     */
    roots(): JournalRoot[];
    private get collapsed();
    /**
     * Which journal an entry belongs to.
     *
     * Normally the directory decides. When the roots are collapsed there is no
     * directory to decide, so the entry's own sections do: `writeThoughts` routes
     * `project_notes` to the project journal and nothing else, so the presence of
     * a `## Project Notes` heading is a faithful discriminator either way.
     */
    private scopeFor;
    /**
     * Write one set of thoughts. `project_notes` lands in the project journal, the
     * other five in the user journal, and each side is skipped when empty — so a
     * `process_thoughts` call carrying only reflections creates no project
     * directory at all.
     *
     * `db` is optional: pass it to index the new entries immediately (what the MCP
     * server does), omit it to write markdown only.
     */
    writeThoughts(thoughts: JournalThoughts, db?: Database.Database): Promise<string[]>;
    private writeToLocation;
    private ensureDirectoryExists;
    /**
     * Index one markdown file by absolute path. Used straight after a write.
     */
    private indexOne;
    private indexContent;
    /**
     * Walk both journal roots and bring the index up to date.
     *
     * Replaces private-journal-mcp's `generateMissingEmbeddings()`, which keyed
     * purely on the absence of a `.embedding` sidecar. This one re-indexes when
     * the file's mtime moved or its row is behind EMBEDDING_VERSION, and prunes
     * rows whose file is gone — so an edited entry, a bumped encoder and a deleted
     * file are all handled.
     */
    indexJournal(db: Database.Database): Promise<JournalIndexResult>;
    /** Count indexed entries, optionally for one scope. */
    count(db: Database.Database, scope?: JournalScope): number;
}
export {};
