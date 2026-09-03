import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE = resolve(HERE, "..", "..");

export function runHelper(relativePath: string, args: readonly string[], cwd?: string) {
  return spawnSync(process.execPath, [join(CORE, relativePath), ...args], {
    cwd,
    encoding: "utf8",
  });
}
