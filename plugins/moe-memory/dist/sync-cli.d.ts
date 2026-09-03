/**
 * `moe-memory sync` — copy new transcripts into the archive, index them, then
 * run one batch of the embedding migration.
 *
 * Was a standalone script executed by `cli/episodic-memory.js` through
 * `spawn(node, join(__dirname, '../dist/sync-cli.js'))`. It is a function now
 * and `src/cli.ts` calls it in-process: there is one bin, it compiles to
 * `dist/cli.js`, and every `../dist/` prefix in the old shim layer was a
 * resolution that only worked from the right directory.
 */
/**
 * Exit code, so the dispatcher can propagate it. `null` means "keep going".
 */
export declare function runSync(args: string[]): Promise<number>;
