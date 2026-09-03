import { readFileSync } from "node:fs";
import type { JigExtensionCommand } from "@bubstack/moe-jig/extension";
import { MoedexClient } from "./moedex.js";
import { formatFindings } from "./report.js";
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
      // needs only the filesystem, not the graph.
      const findings = await validatePlanAgainstGraph(planText, ctx, client, {
        checkPhantoms: true,
      });
      const phantoms = findings.filter((f) => f.check === "phantom");
      if (phantoms.length > 0) {
        console.log(formatFindings(phantoms, jsonFlag));
      }
      console.error("moedex unavailable — skipping graph validation (phantom-files only)");
      return 0;
    }

    const findings = await validatePlanAgainstGraph(planText, ctx, client);
    console.log(formatFindings(findings, jsonFlag));

    await client.disconnect();
    return 0;
  },
};

export const commands: JigExtensionCommand[] = [validate];
