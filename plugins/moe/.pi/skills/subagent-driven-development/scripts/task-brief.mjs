import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSddWorkspace } from "./sdd-workspace.mjs";

export function extractTaskBrief(planContent, taskNumber) {
  const lines = planContent.split("\n");
  const result = [];
  let inFence = false;
  let inTask = false;

  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
    }
    if (!inFence && /^#+\s+Task\s+\d+/.test(line)) {
      const re = new RegExp(`^#+\\s+Task\\s+${taskNumber}(?:[^0-9]|$)`);
      inTask = re.test(line);
    }
    if (inTask) {
      result.push(line);
    }
  }

  return result.join("\n");
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.length > 3) {
    process.stderr.write(
      "usage: node task-brief.mjs PLAN_FILE TASK_NUMBER [OUTFILE]\n",
    );
    process.exit(2);
  }

  const planPath = args[0];
  const taskNumber = args[1];

  if (!existsSync(planPath)) {
    process.stderr.write(`no such plan file: ${planPath}\n`);
    process.exit(2);
  }

  let out;
  if (args.length === 3) {
    out = args[2];
  } else {
    const dir = resolveSddWorkspace(planPath);
    out = join(dir, `task-${taskNumber}-brief.md`);
  }

  const content = readFileSync(planPath, "utf8");
  const brief = extractTaskBrief(content, taskNumber);

  if (!brief.trim()) {
    process.stderr.write(
      `task ${taskNumber} not found in ${planPath} (no heading matching 'Task ${taskNumber}')\n`,
    );
    process.exit(3);
  }

  writeFileSync(out, brief);
  const lineCount = brief.split("\n").length;
  process.stdout.write(`wrote ${out}: ${lineCount} lines\n`);
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
