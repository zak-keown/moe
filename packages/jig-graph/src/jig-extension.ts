import { readFileSync } from "node:fs";
import type { JigExtensionCommand } from "@bubstack/moe-jig/extension";
import { MoedexClient } from "./moedex.js";
import { formatFindings } from "./report.js";
import { seedPlanSkeleton } from "./seed.js";
import { validatePlanAgainstGraph } from "./validate.js";

const validate: JigExtensionCommand = {
  namespace: "plan",
  name: "validate",
  description: "Validate a plan against the moedex code graph",
  options: [
    { flags: "--json", description: "Output findings as JSON" },
    {
      flags: "--manifest <path>",
      description: "Validate all plans listed in a MANIFEST.md",
    },
  ],
  async run(args, ctx) {
    if (args.includes("--manifest")) {
      console.error("--manifest is not yet implemented");
      return 1;
    }

    const jsonFlag = args.includes("--json");
    const planArgs = args.filter((a) => !a.startsWith("--") && a !== "validate");
    const planPath = planArgs[0];

    if (!planPath) {
      console.error("Usage: moe jig plan validate <plan.md>");
      return 1;
    }

    const client = new MoedexClient();
    const available = await client.isAvailable();

    const planText = readFileSync(planPath, "utf8");

    if (!available) {
      // moedex unreachable — fall back to the phantom-files check, which
      // needs only the filesystem, not the graph. graphChecks: false skips
      // Checks 1-3 entirely so we never call into a client that will throw.
      const findings = await validatePlanAgainstGraph(planText, ctx, client, {
        checkPhantoms: true,
        graphChecks: false,
      });
      const phantoms = findings.filter((f) => f.check === "phantom");
      if (phantoms.length > 0) {
        console.log(formatFindings(phantoms, jsonFlag));
      }
      console.error("moedex unavailable — skipping graph validation (phantom-files only)");
      return 0;
    }

    const findings = await validatePlanAgainstGraph(planText, ctx, client, {
      checkPhantoms: true,
    });
    console.log(formatFindings(findings, jsonFlag));

    await client.disconnect();
    return 0;
  },
};

const seed: JigExtensionCommand = {
  namespace: "plan",
  name: "seed",
  description: "Generate a plan skeleton from the moedex code graph",
  options: [{ flags: "--entry <file>", description: "Entry-point file or symbol" }],
  async run(args, _ctx) {
    const entryIdx = args.indexOf("--entry");
    const entry = entryIdx >= 0 ? args[entryIdx + 1] : undefined;
    const skipIndices = new Set<number>();
    if (entryIdx >= 0) {
      skipIndices.add(entryIdx);
      if (entry !== undefined) skipIndices.add(entryIdx + 1);
    }
    const topic = args.filter((_a, i) => !skipIndices.has(i)).join(" ");

    if (!topic) {
      console.error("Usage: moe jig plan seed <topic> [--entry <file>]");
      return 1;
    }

    const client = new MoedexClient();
    const available = await client.isAvailable();
    if (!available) {
      console.error(
        "moedex required for seed — cannot generate a graph-grounded skeleton without it.",
      );
      return 1;
    }

    const skeleton = await seedPlanSkeleton(topic, client, entry ? { entry } : {});
    console.log(skeleton);

    await client.disconnect();
    return 0;
  },
};

export const commands: JigExtensionCommand[] = [validate, seed];
