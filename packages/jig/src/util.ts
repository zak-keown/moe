import { execFile, execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf-8" }).trim();
}

export async function gitAsync(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { encoding: "utf-8" });
  return stdout.trim();
}

export function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolvePrimaryRoot(): string {
  const commonDir = git("rev-parse", "--git-common-dir");
  const resolved = resolve(commonDir, "..");
  return git("-C", resolved, "rev-parse", "--show-toplevel");
}

export function gitIn(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

export function primaryRoot(cwd: string): string {
  const commonDir = gitIn(cwd, "rev-parse", "--git-common-dir");
  const resolved = resolve(cwd, commonDir, "..");
  return gitIn(resolved, "rev-parse", "--show-toplevel");
}
