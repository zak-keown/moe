import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FRACTION_PATTERN = /^\d+\/\d+$/;

function validateFraction(value: string, flagName: string): { done: number; total: number } {
  if (!FRACTION_PATTERN.test(value)) {
    throw new Error(`${flagName} must be in done/total format (e.g. '3/18'), got: ${value}`);
  }
  const parts = value.split("/");
  const done = Number.parseInt(parts[0] ?? "0", 10);
  const total = Number.parseInt(parts[1] ?? "0", 10);
  return { done, total };
}

export interface ProgressUpdateOpts {
  phase: string;
  task: string;
  iterations?: string;
  sentinel?: string;
  event?: string;
  cwd?: string;
}

export function progressUpdate(opts: ProgressUpdateOpts): string {
  const root = opts.cwd ?? process.cwd();
  const iterDir = join(root, "docs", "moe", "iterations");
  const filepath = join(iterDir, "progress.md");

  mkdirSync(iterDir, { recursive: true });

  const lines: string[] = ["# Progress", "", `**Phase:** ${opts.phase}`, `**Task:** ${opts.task}`];

  if (opts.iterations !== undefined) {
    const { done, total } = validateFraction(opts.iterations, "--iterations");
    const remaining = total - done;
    lines.push(`**Iterations:** ${opts.iterations} done, ${remaining} pending`);
  }

  if (opts.sentinel !== undefined) {
    validateFraction(opts.sentinel, "--sentinel");
    lines.push(`**Sentinel corpus:** ${opts.sentinel} passing`);
  }

  if (opts.event !== undefined) {
    const timestamp = new Date().toISOString();
    lines.push(`**Last event:** ${timestamp} — ${opts.event}`);
  }

  lines.push("");

  writeFileSync(filepath, lines.join("\n"), "utf-8");

  return resolve(filepath);
}
