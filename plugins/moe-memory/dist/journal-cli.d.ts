/**
 * `moe-memory journal <subcommand>` — the journal half from the terminal.
 *
 * private-journal-mcp had no CLI beyond `--journal-path`: its single bin was the
 * MCP server and nothing else. These subcommands are new surface, and they exist
 * because the journal is no longer self-indexing through sidecars — if the index
 * can be rebuilt, something has to be able to rebuild it.
 */
import type { JournalScopeFilter } from "./journal/search.js";
export interface JournalArgs {
    /** Positional arguments joined — the search query. */
    query: string;
    limit: number;
    scope: JournalScopeFilter;
    journalPath: string | undefined;
}
export declare function parseJournalArgs(args: string[]): JournalArgs;
export declare function runJournal(args: string[]): Promise<number>;
