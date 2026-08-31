#!/usr/bin/env node
/**
 * `moe-flight` — the single bin.
 *
 * Three upstream binaries collapse into subcommand namespaces here
 * (PARITY.md, "Identifiers that change"):
 *
 * | upstream bin       | here                       |
 * |--------------------|----------------------------|
 * | `gauntlet`         | `moe-flight qa <command>`   |
 * | `quorum`           | `moe-flight lab <command>`  |
 * | `evals-appliance`  | `moe-flight appliance <…>`  |
 *
 * They are namespaced rather than flattened because `gauntlet run` and
 * `quorum run` are different commands with the same name — as are `show`,
 * `config` and `render`. Flattening would have made the collision silent.
 *
 * It also matters for a live contract: quorum spawns the gauntlet bin as a
 * real subprocess (`gauntlet run <story> --adapter tui …`) and probes it for
 * a version. Once both halves are one package that becomes
 * `moe-flight qa run …`, which is unambiguous — a flattened `moe-flight run`
 * would have had `moe-flight` shelling out to itself with no way to say which
 * half it meant.
 *
 * `lab` and `appliance` are declared and refused, not silently absent: see
 * README.md, "What is not imported yet".
 */
import { formatCliError, isVerboseRequest } from "./qa/cli/error-output.js";

const USAGE = `moe-flight — drive web, CLI or TUI targets through acceptance criteria and grade them.

usage: moe-flight <namespace> [command] [options]

namespaces:
  qa         Run a story card against a target and grade it (upstream: gauntlet).
             Commands: run, batch, validate, fanout, serve, config, ask, render
  dashboard  Serve the scenario x agent x credential x OS results grid.
  lab        NOT IMPORTED YET (upstream: quorum). See README.md.
  appliance  NOT IMPORTED YET (upstream: evals-appliance). See README.md.

Run \`moe-flight qa\` for the QA command list.
`;

const NOT_IMPORTED = (ns: string, upstream: string) =>
  new Error(
    `moe-flight ${ns} is not imported yet.\n` +
      `\n` +
      `It is upstream \`${upstream}\` from superpowers-evals, which is deferred —\n` +
      `see packages/flight/README.md, "What is not imported yet", for what is\n` +
      `blocking it and what already works.`,
  );

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
      // SDKs. Reached by path rather than by module edge for the same reason
      // glass reaches its skill lib by path: it is a sibling artifact, not a
      // library this half consumes.
      const { runDashboardCli } = await import("../dashboard/dist/index.js");
      await runDashboardCli(rest);
      return;
    }

    case "lab":
      throw NOT_IMPORTED("lab", "quorum");

    case "appliance":
      throw NOT_IMPORTED("appliance", "evals-appliance");

    default:
      throw new Error(`Unknown namespace "${namespace}".\n\n${USAGE}`);
  }
}

main().catch((err) => {
  const verbose = isVerboseRequest(
    process.env as Record<string, string | undefined>,
    process.argv,
  );
  const isTty = Boolean(process.stderr.isTTY);
  process.stderr.write(formatCliError(err, { verbose, isTty }));
  process.exit(1);
});
