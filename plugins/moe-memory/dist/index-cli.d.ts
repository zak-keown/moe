/**
 * `moe-memory index` — index, verify, repair or rebuild the conversation index.
 *
 * Collapses two upstream layers: `cli/index-conversations.js` (flag parsing,
 * the `--rebuild` confirmation prompt, help text) and `dist/index-cli.js`
 * (subcommand dispatch). They were separate only because one was a shim that
 * spawned the other.
 */
export declare function runIndex(args: string[]): Promise<number>;
