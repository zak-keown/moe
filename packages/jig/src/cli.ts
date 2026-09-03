#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { Command, CommanderError } from "commander";
import { planInit, specInit } from "./plan.js";
import { commitReviewFix, reviewStamp } from "./review.js";
import { worktreeCreate, worktreeRemove, worktreeValidate } from "./worktree.js";

const program = new Command()
  .name("moe-jig")
  .description("Deterministic enforcement tooling for moe skill conventions.")
  .version("0.1.4")
  .exitOverride();

const wt = program
  .command("worktree")
  .description("Create, remove, and validate worktrees in .moe/worktrees/");

wt.command("create")
  .description("Create a linked worktree in .moe/worktrees/<branch>")
  .argument("<branch>", "branch name for the worktree")
  .option("--base <ref>", "base ref to branch from (default: repo default branch)")
  .action((branch: string, opts: { base?: string }) => {
    const path = worktreeCreate(branch, opts.base !== undefined ? { base: opts.base } : {});
    console.log(path);
  });

wt.command("remove")
  .description("Remove a jig-created worktree")
  .argument("<path-or-branch>", "worktree path or branch name")
  .action((pathOrBranch: string) => {
    worktreeRemove(pathOrBranch);
    console.log(`removed: ${pathOrBranch}`);
  });

wt.command("validate")
  .description("Run the parallel-dispatch gate on worktree paths")
  .argument("<paths...>", "worktree paths to validate")
  .action((paths: string[]) => {
    const result = worktreeValidate(paths);
    if (result.valid) {
      console.log("all conditions pass");
    } else {
      for (const d of result.diagnostics) {
        console.error(`FAIL: ${d}`);
      }
      process.exitCode = 1;
    }
  });

const plan = program
  .command("plan")
  .description("Initialize plan files with correct naming and placement");

plan
  .command("init")
  .description("Create a new plan file in docs/moe/plans/")
  .argument("<name>", "feature name (used in the filename slug)")
  .action((name: string) => {
    const path = planInit(name);
    console.log(path);
  });

const spec = program
  .command("spec")
  .description("Initialize spec/design files with correct naming and placement");

spec
  .command("init")
  .description("Create a new spec file in docs/moe/specs/")
  .argument("<name>", "topic name (used in the filename slug)")
  .action((name: string) => {
    const path = specInit(name);
    console.log(path);
  });

const review = program.command("review").description("Review-fix stamps and commit formatting");

review
  .command("stamp")
  .description("Create a stamp commit recording that a CR finding was addressed")
  .argument("<CR-ID>", "code-review finding ID (e.g. CR-012)")
  .argument("<fixing-sha>", "SHA of the commit that addressed the finding")
  .action((crId: string, fixingSha: string) => {
    const sha = reviewStamp(crId, fixingSha);
    console.log(sha);
  });

const commit = program.command("commit").description("Structured commits with validated formats");

commit
  .command("review-fix")
  .description("Commit staged changes as a review fix: fix(review): CR-### — <title>")
  .argument("<cr-id>", "code-review identifier (CR-###)")
  .argument("<title...>", "one-line description of the fix")
  .action((crId: string, titleParts: string[]) => {
    const title = titleParts.join(" ");
    const sha = commitReviewFix(crId, title);
    console.log(sha);
  });

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      return err.exitCode;
    }
    console.error(err instanceof Error ? err.message : err);
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
