import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function isDirectEntry() {
  try {
    const thisFile = new URL(import.meta.url).pathname;
    const realArgv = realpathSync(process.argv[1] ?? "");
    const realThis = realpathSync(thisFile);
    return realArgv === realThis;
  } catch {
    return false;
  }
}

if (isDirectEntry()) {
  const pluginRoot =
    process.env.CLAUDE_PLUGIN_ROOT ||
    resolve(dirname(new URL(import.meta.url).pathname), "../../..");

  const cjs = join(pluginRoot, "dist", "moe-crew.cjs");

  const result = spawnSync(process.execPath, [cjs, ...process.argv.slice(2)], {
    stdio: "inherit",
  });

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }
  process.exit(result.status ?? 1);
}
