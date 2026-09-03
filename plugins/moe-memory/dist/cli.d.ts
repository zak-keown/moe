#!/usr/bin/env node
/**
 * `moe-memory` — the package's single bin, compiled to dist/cli.js.
 *
 * Replaces FIVE upstream entry points:
 *
 *   episodic-memory              -> moe-memory
 *   episodic-memory-index        -> moe-memory index
 *   episodic-memory-search       -> moe-memory search
 *   episodic-memory-mcp-server   -> moe-memory mcp-server
 *   private-journal-mcp          -> moe-memory mcp-server  (one server now)
 *
 * and, with them, an entire layer of shims. episodic-memory shipped four
 * extensionless files that spawned four `.js` dispatchers that spawned the
 * compiled `dist/*-cli.js` scripts — `join(__dirname, '../dist')`, three times,
 * two of them resolving `__dirname` through `realpathSync` and two not, so half
 * of them broke under a symlinked bin. All of that is gone: this file imports
 * the command modules and calls them in-process. There is no `../dist/` prefix
 * left in the package.
 *
 * Subcommands are dispatched through dynamic import so that `moe-memory show`
 * does not load better-sqlite3 or transformers.js just to render a JSONL file.
 */
export declare function main(argv?: string[]): Promise<number>;
