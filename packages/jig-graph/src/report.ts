// Finding type and human/JSON formatting for `moe jig plan validate`.
//
// Findings are always "warning" severity — validate never fails the process
// (see jig-extension.ts: exit code is 0 whether or not findings are
// reported). It surfaces gaps between a plan's declared Files: blocks and
// the moedex code graph for a human (or CI log) to look at, not a hard gate.

export interface Finding {
  check: "uncovered" | "missing-edge" | "wave-conflict" | "phantom";
  severity: "warning";
  tasks: number[];
  files: string[];
  message: string;
}

export function formatFindings(findings: Finding[], json: boolean): string {
  if (json) return JSON.stringify(findings, null, 2);

  if (findings.length === 0) return "No findings.";

  const lines: string[] = [];
  for (const f of findings) {
    const taskStr =
      f.tasks.length > 0 ? ` (task${f.tasks.length > 1 ? "s" : ""} ${f.tasks.join(", ")})` : "";
    lines.push(`[${f.check}]${taskStr}: ${f.message}`);
    if (f.files.length > 0) {
      for (const file of f.files) {
        lines.push(`  - ${file}`);
      }
    }
  }
  return lines.join("\n");
}
