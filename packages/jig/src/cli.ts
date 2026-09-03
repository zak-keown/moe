#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { Command, CommanderError } from "commander";

const program = new Command()
  .name("moe-jig")
  .description("Deterministic enforcement tooling for moe skill conventions.")
  .version("0.1.4")
  .exitOverride();

program
  .command("worktree")
  .description("Create, remove, and validate worktrees in .moe/worktrees/");

program.command("plan").description("Initialize plan files with correct naming and placement");

program
  .command("spec")
  .description("Initialize spec/design files with correct naming and placement");

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      return err.exitCode;
    }
    return 1;
  }
}

// ESM equivalent of `require.main === module`. process.argv[1] is realpath'd
// before comparing because import.meta.filename is always the realpath, while
// pnpm's node_modules/.bin/ shims (and other symlinked bin invocations) pass
// the unresolved symlink path in argv[1] — a bare equality check is false in
// that case, main() never runs, and the packaged binary silently no-ops.
const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : undefined;
if (invokedPath === import.meta.filename) {
  main().then((code) => process.exit(code));
}
