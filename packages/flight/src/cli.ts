#!/usr/bin/env node
/**
 * `moe-flight` — the single bin.
 *
 * Namespaces keep commands with overlapping names unambiguous and leave room
 * for the lab and appliance surfaces without colliding with QA commands.
 *
 * `lab` and `appliance` are declared and refused, not silently absent.
 */
import { formatCliError, isVerboseRequest } from "./qa/cli/error-output.js";

const USAGE = `moe-flight — drive web, CLI or TUI targets through acceptance criteria and grade them.

usage: moe-flight <namespace> [command] [options]

namespaces:
  qa         Run a story card against a target and grade it.
             Commands: run, batch, validate, fanout, serve, config, ask, render
  dashboard  Serve the scenario x agent x credential x OS results grid.
  lab        Reserved; not available in this build.
  appliance  Reserved; not available in this build.

Run \`moe-flight qa\` for the QA command list.
`;

const NOT_AVAILABLE = (ns: string) => new Error(`moe-flight ${ns} is not available.`);

async function main(): Promise<void> {
  const [, , namespace, ...rest] = process.argv;

  switch (namespace) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      process.stdout.write(USAGE);
      return;

    case "qa": {
      const { qaMain } = await import("./qa/index.js");
      // Re-form process.argv's shape: parseArgs slices the first two.
      await qaMain([process.argv[0] ?? "node", "moe-flight qa", ...rest]);
      return;
    }

    case "dashboard": {
      // The dashboard is its own workspace package (packages/flight/dashboard)
      // because it has a genuinely different dependency set — zod only, no LLM
      // SDKs — and it imports nothing from the harness.
      //
      // By module specifier, not by relative path into its dist/. The path form
      // typechecked only while dashboard/dist/ happened to exist and failed on
      // a clean tree; the specifier resolves through the workspace link, which
      // is what tsconfig.json's `references` entry and turbo's
      // `typecheck dependsOn ^build` are both already expressing.
      const { runDashboardCli } = await import("@bubstack/moe-flight-dashboard");
      await runDashboardCli(rest);
      return;
    }

    case "lab":
      throw NOT_AVAILABLE("lab");

    case "appliance":
      throw NOT_AVAILABLE("appliance");

    default:
      throw new Error(`Unknown namespace "${namespace}".\n\n${USAGE}`);
  }
}

main().catch((err) => {
  const verbose = isVerboseRequest(process.env as Record<string, string | undefined>, process.argv);
  const isTty = Boolean(process.stderr.isTTY);
  process.stderr.write(formatCliError(err, { verbose, isTty }));
  process.exit(1);
});
