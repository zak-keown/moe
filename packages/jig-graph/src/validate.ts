import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { JigContext } from "@bubstack/moe-jig/extension";
import type { PlanTask } from "@bubstack/moe-jig/parser";
import type { MoedexClient } from "./moedex.js";
import type { Finding } from "./report.js";

export interface ValidateOpts {
  checkPhantoms?: boolean;
  /** Run Checks 1-3 (uncovered / missing-edge / wave-conflict), which need a
   * reachable moedex client. Defaults to true; callers on the offline path
   * (moedex unavailable) should pass `false` to skip straight to the
   * phantom-files check instead of calling into a client that will throw. */
  graphChecks?: boolean;
  cwd?: string;
}

export async function validatePlanAgainstGraph(
  planText: string,
  ctx: JigContext,
  client: MoedexClient,
  opts: ValidateOpts = {},
): Promise<Finding[]> {
  const { tasks } = ctx.parsePlan(planText);
  const findings: Finding[] = [];

  // All files claimed by all tasks.
  const allClaimedFiles = new Set<string>();
  for (const t of tasks) {
    for (const f of t.files) allClaimedFiles.add(f);
  }

  // Checks 1-3 all need a reachable moedex client. Callers on the offline
  // path (moedex unavailable) pass `graphChecks: false` to skip straight to
  // the phantom-files check below instead of calling into a client that
  // will throw.
  if (opts.graphChecks !== false) {
    // --- Check 1: Uncovered files ---
    // Query the blast radius from the plan's goal, compare against claimed files.
    const goalMatch = /^\*\*Goal:\*\*\s*(.+)/m.exec(planText);
    if (goalMatch) {
      const impact = await client.impactAnalysis(goalMatch[1]!.trim());
      const blastFiles = impact.results.filter((r) => r.score >= 0.5).map((r) => r.rel_path);

      const uncovered = blastFiles.filter((f) => !allClaimedFiles.has(f));
      if (uncovered.length > 0) {
        findings.push({
          check: "uncovered",
          severity: "warning",
          tasks: [],
          files: uncovered,
          message: `${uncovered.length} file(s) in the blast radius are not covered by any task`,
        });
      }
    }

    // --- Check 2: Missing edges ---
    // For each pair of tasks, check if their file sets are coupled in the
    // call graph but have no depends_on edge.
    const depSet = new Map<number, Set<number>>();
    for (const t of tasks) {
      depSet.set(t.num, new Set(t.dependsOn));
    }

    for (let i = 0; i < tasks.length; i++) {
      const a = tasks[i]!;
      // Hoisted out of the inner loop: depends only on `a`, so compute it
      // once per `a` instead of once per (a, b) pair.
      const consumers = await client.traceConsumers(a.files);

      for (let j = i + 1; j < tasks.length; j++) {
        const b = tasks[j]!;

        const aDepB = depSet.get(a.num)?.has(b.num) ?? false;
        const bDepA = depSet.get(b.num)?.has(a.num) ?? false;
        if (aDepB || bDepA) continue;

        const coupled = consumers.results.some(
          (r) => r.score >= 0.5 && b.files.includes(r.rel_path),
        );

        if (coupled) {
          findings.push({
            check: "missing-edge",
            severity: "warning",
            tasks: [a.num, b.num],
            files: [],
            message: `Tasks ${a.num} and ${b.num} are coupled in the call graph but have no depends_on edge`,
          });
        }
      }
    }

    // --- Check 3: Wave conflicts ---
    const schedulable = tasks.filter((t) => t.blockedBy === null);
    if (schedulable.length > 1) {
      const waves = ctx.computeWaves(schedulable);
      const taskByNum = new Map<number, PlanTask>();
      for (const t of schedulable) taskByNum.set(t.num, t);

      for (const wave of waves) {
        for (let i = 0; i < wave.length; i++) {
          const a = taskByNum.get(wave[i]!)!;
          // Hoisted out of the inner loop: depends only on `a`.
          const consumers = await client.traceConsumers(a.files);

          for (let j = i + 1; j < wave.length; j++) {
            const b = taskByNum.get(wave[j]!)!;

            const coupled = consumers.results.some(
              (r) => r.score >= 0.5 && b.files.includes(r.rel_path),
            );

            if (coupled) {
              findings.push({
                check: "wave-conflict",
                severity: "warning",
                tasks: [a.num, b.num],
                files: [],
                message: `Tasks ${a.num} and ${b.num} are in the same wave but coupled in the call graph`,
              });
            }
          }
        }
      }
    }
  }

  // --- Check 4: Phantom files (no moedex needed) ---
  // Opt-in (default off): a plan that only claims files graph-side checks
  // 1-3 above already exercised shouldn't also pay for a filesystem sweep,
  // and jig-extension.ts's offline fallback (moedex unreachable) is the one
  // caller that turns this on. Only "Modify:" references are checked —
  // "Create:" and "Test:" files are allowed not to exist yet, since the
  // task introduces them.
  if (opts.checkPhantoms === true) {
    const cwd = opts.cwd ?? process.cwd();
    for (const t of tasks) {
      for (const f of t.files) {
        const fullPath = resolve(cwd, f);
        if (!existsSync(fullPath)) {
          const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const lineMatch = new RegExp(`-\\s+Modify:\\s*\`${escaped}\``).exec(planText);
          if (lineMatch) {
            findings.push({
              check: "phantom",
              severity: "warning",
              tasks: [t.num],
              files: [f],
              message: `Task ${t.num} references "${f}" (Modify) but the file does not exist`,
            });
          }
        }
      }
    }
  }

  return findings;
}
