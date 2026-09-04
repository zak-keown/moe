export type BacklogStatus =
  | "open" | "in-progress" | "blocked" | "carry-over"
  | "done" | "declined" | "needs-triage";

export type Severity = "low" | "medium" | "high" | "critical";

export interface BacklogItem {
  id: string;
  title: string;
  status: BacklogStatus;
  reason?: string;
  severity: Severity;
  source: string;
  claimedBy?: string;
  created: string;
  updated: string;
  filedBy?: string;
  filedSha?: string;
  movedBy?: string;
  movedSha?: string;
  blockedBy: string[];
  blocks: string[];
  parent?: string;
  ref?: string;
  tags: string[];
  body: string;
}

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseItem(text: string): BacklogItem {
  const m = FM.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("backlog item has no frontmatter");
  const fm = new Map<string, string>();
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i !== -1) fm.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  const list = (k: string) => {
    const v = fm.get(k) ?? "";
    return v.length ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
  };
  const req = (k: string) => {
    const v = fm.get(k);
    if (!v) throw new Error(`backlog item missing ${k}`);
    return v;
  };
  return {
    id: req("id"), title: req("title"), status: req("status") as BacklogStatus,
    reason: fm.get("reason") || undefined,
    severity: (fm.get("severity") || "medium") as Severity,
    source: fm.get("source") || "manual",
    claimedBy: fm.get("claimed_by") || undefined,
    created: req("created"), updated: req("updated"),
    filedBy: fm.get("filed_by") || undefined, filedSha: fm.get("filed_sha") || undefined,
    movedBy: fm.get("moved_by") || undefined, movedSha: fm.get("moved_sha") || undefined,
    blockedBy: list("blocked_by"), blocks: list("blocks"),
    parent: fm.get("parent") || undefined, ref: fm.get("ref") || undefined,
    tags: list("tags"),
    body: m[2].replace(/^\n+/, ""),
  };
}

export function serializeItem(item: BacklogItem): string {
  return [
    "---",
    `id: ${item.id}`,
    `title: ${item.title}`,
    `status: ${item.status}`,
    `reason: ${item.reason ?? ""}`,
    `severity: ${item.severity}`,
    `source: ${item.source}`,
    `claimed_by: ${item.claimedBy ?? ""}`,
    `created: ${item.created}`,
    `updated: ${item.updated}`,
    `filed_by: ${item.filedBy ?? ""}`,
    `filed_sha: ${item.filedSha ?? ""}`,
    `moved_by: ${item.movedBy ?? ""}`,
    `moved_sha: ${item.movedSha ?? ""}`,
    `blocked_by: ${item.blockedBy.join(", ")}`,
    `blocks: ${item.blocks.join(", ")}`,
    `parent: ${item.parent ?? ""}`,
    `ref: ${item.ref ?? ""}`,
    `tags: ${item.tags.join(", ")}`,
    "---",
    "",
    item.body.replace(/\n*$/, ""),
    "",
  ].join("\n");
}

export function allocateId(existing: string[]): { num: number; id: string } {
  let max = 0;
  for (const name of existing) {
    const m = /^(\d{4})-.*\.md$/.exec(name);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  const num = max + 1;
  return { num, id: `BL-${String(num).padStart(4, "0")}` };
}
