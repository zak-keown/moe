import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSddWorkspace } from "./sdd-workspace.mjs";

function verifyRef(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

export function generateReviewPackage(base, head) {
  const sections = [];
  sections.push(`# Review package: ${base}..${head}`);
  sections.push("");
  sections.push("## Commits");
  sections.push(
    execFileSync("git", ["log", "--oneline", `${base}..${head}`], {
      encoding: "utf8",
    }),
  );
  sections.push("## Files changed");
  sections.push(
    execFileSync("git", ["diff", "--stat", `${base}..${head}`], {
      encoding: "utf8",
    }),
  );
  sections.push("## Diff");
  sections.push(
    execFileSync("git", ["diff", "-U10", `${base}..${head}`], {
      encoding: "utf8",
    }),
  );
  return sections.join("\n");
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 3 || args.length > 4) {
    process.stderr.write(
      "usage: node review-package.mjs PLAN_FILE BASE HEAD [OUTFILE]\n",
    );
    process.exit(2);
  }

  const planPath = args[0];
  const base = args[1];
  const head = args[2];

  if (!existsSync(planPath)) {
    process.stderr.write(`no such plan file: ${planPath}\n`);
    process.exit(2);
  }

  if (!verifyRef(base)) {
    process.stderr.write(`bad BASE: ${base}\n`);
    process.exit(2);
  }
  if (!verifyRef(head)) {
    process.stderr.write(`bad HEAD: ${head}\n`);
    process.exit(2);
  }

  let out;
  if (args.length === 4) {
    out = args[3];
  } else {
    const dir = resolveSddWorkspace(planPath);
    const shortBase = execFileSync("git", ["rev-parse", "--short", base], {
      encoding: "utf8",
    }).trim();
    const shortHead = execFileSync("git", ["rev-parse", "--short", head], {
      encoding: "utf8",
    }).trim();
    out = join(dir, `review-${shortBase}..${shortHead}.diff`);
  }

  const content = generateReviewPackage(base, head);
  writeFileSync(out, content);

  const commits = execFileSync(
    "git",
    ["rev-list", "--count", `${base}..${head}`],
    { encoding: "utf8" },
  ).trim();
  const bytes = Buffer.byteLength(content);
  process.stdout.write(`wrote ${out}: ${commits} commit(s), ${bytes} bytes\n`);
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
