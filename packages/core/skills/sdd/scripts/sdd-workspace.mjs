import {
  existsSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveSddWorkspace(planPath) {
  if (!existsSync(planPath)) {
    throw new Error(`no such plan file: ${planPath}`);
  }

  const slug = basename(planPath, ".md");
  if (!slug || slug === "." || slug === "..") {
    throw new Error(`cannot derive a workspace name from: ${planPath}`);
  }

  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();

  const base = join(root, ".moe", "sdd");
  const dir = join(base, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(base, ".gitignore"), "*\n");
  return dir;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    process.stderr.write("usage: node sdd-workspace.mjs PLAN_FILE\n");
    process.exit(2);
  }

  try {
    const dir = resolveSddWorkspace(args[0]);
    process.stdout.write(`${dir}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
}

function isDirectEntry() {
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isDirectEntry()) {
  main();
}
