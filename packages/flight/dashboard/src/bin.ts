#!/usr/bin/env node
// Standalone entry, for running the dashboard without going through
// `moe-flight dashboard`. Upstream this was a `main()` guarded by
// `import.meta.main`, which is Bun-only.
import { runDashboardCli } from "./index.js";

runDashboardCli(process.argv.slice(2)).catch((err: unknown) => {
  process.stderr.write(`moe-flight-dashboard: ${String(err)}\n`);
  process.exit(1);
});
