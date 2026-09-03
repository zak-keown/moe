#!/usr/bin/env node
import { Command } from "commander";

const program = new Command()
  .name("moe-jig")
  .description("Deterministic enforcement tooling for moe skill conventions.")
  .version("0.1.4");

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
  } catch {
    return 1;
  }
}

// ESM equivalent of `require.main === module`: true only when this file was
// invoked directly (not imported), matching regardless of harness or symlink.
if (process.argv[1] === import.meta.filename) {
  main().then((code) => process.exit(code));
}
