import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { git, slugify, today, worktreeRoot } from "./util.js";

export type BacklogStatus =
  | "open" | "in-progress" | "blocked" | "carry-over"
  | "done" | "declined" | "needs-triage";

export type Severity = "low" | "medium" | "high" | "critical";

export interface BacklogItem {
  id: string;
  title: string;
  status: BacklogStatus;
  reason?: string | undefined;
  severity: Severity;
  source: string;
  claimedBy?: string | undefined;
  created: string;
  updated: string;
  filedBy?: string | undefined;
  filedSha?: string | undefined;
  movedBy?: string | undefined;
  movedSha?: string | undefined;
  blockedBy: string[];
  blocks: string[];
  parent?: string | undefined;
  ref?: string | undefined;
  tags: string[];
  body: string;
}

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseItem(text: string): BacklogItem {
  const m = FM.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("backlog item has no frontmatter");
  const fm = new Map<string, string>();
  for (const line of (m[1] ?? "").split("\n")) {
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
    body: (m[2] ?? "").replace(/^\n+/, ""),
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
    if (m) max = Math.max(max, Number.parseInt(m[1] ?? "0", 10));
  }
  const num = max + 1;
  return { num, id: `BL-${String(num).padStart(4, "0")}` };
}

export function backlogDir(cwd?: string): string {
  return join(worktreeRoot(cwd), ".moe", "backlog");
}

function safeSha(cwd?: string): string | undefined {
  try { return git("-C", worktreeRoot(cwd), "rev-parse", "--short", "HEAD"); }
  catch { return undefined; }
}

export function loadItem(cwd: string | undefined, id: string): { dir: string; name: string; item: BacklogItem } {
  const dir = backlogDir(cwd);
  if (!existsSync(dir)) throw new Error(`no backlog at ${dir}`);
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const item = parseItem(readFileSync(join(dir, name), "utf-8"));
    if (item.id === id) return { dir, name, item };
  }
  throw new Error(`${id} not found in ${dir}`);
}

export interface AddOpts {
  cwd?: string; source?: string; severity?: Severity; tags?: string[]; by?: string;
}

export function backlogAdd(title: string, opts: AddOpts = {}): string {
  if (!title.trim()) throw new Error("title is required");
  const dir = backlogDir(opts.cwd);
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const slug = slugify(title);
  if (!slug) throw new Error("title must contain at least one alphanumeric character");
  for (const name of existing) {
    if (name.endsWith(`-${slug}.md`)) {
      const item = parseItem(readFileSync(join(dir, name), "utf-8"));
      if (item.status === "open") throw new Error(`an open item with slug "${slug}" already exists: ${item.id}`);
    }
  }
  const { num, id } = allocateId(existing);
  const now = today();
  const item: BacklogItem = {
    id, title: title.trim(), status: "open",
    severity: opts.severity ?? "medium", source: opts.source ?? "manual",
    created: now, updated: now, filedBy: opts.by ?? "manual", filedSha: safeSha(opts.cwd),
    blockedBy: [], blocks: [], tags: opts.tags ?? [],
    body: '## Context\n\n<why this exists and what "done" looks like>\n',
  };
  const filepath = join(dir, `${String(num).padStart(4, "0")}-${slug}.md`);
  writeFileSync(filepath, serializeItem(item), "utf-8");
  return resolve(filepath);
}

export const BLOCK_REASONS = ["no-runtime", "upstream-decision", "depends-on", "needs-human", "external-service"] as const;
export const CARRY_REASONS = ["budget", "scope-split"] as const;
export const DECLINE_REASONS = ["wont-fix", "out-of-scope", "duplicate", "not-reproducible"] as const;

export function routeReason(reason: string): BacklogStatus {
  if ((BLOCK_REASONS as readonly string[]).includes(reason)) return "blocked";
  if ((CARRY_REASONS as readonly string[]).includes(reason)) return "carry-over";
  return "needs-triage";
}

function writeResume(body: string, opts: { note?: string; next?: string; branch?: string }): string {
  const lines = ["## Resume", ""];
  if (opts.note) lines.push(`- done: ${opts.note}`);
  lines.push(`- next: ${opts.next ?? "—"}`);
  if (opts.branch) lines.push(`- branch: ${opts.branch}`);
  const block = `${lines.join("\n")}\n`;
  if (/^## Resume$/m.test(body)) return body.replace(/## Resume[\s\S]*$/m, block);
  return `${body.replace(/\n*$/, "")}\n\n${block}`;
}

export interface DeferOpts {
  reason: string; note?: string; next?: string; branch?: string; cwd?: string; by?: string;
}

export function backlogDefer(id: string, opts: DeferOpts): { path: string; status: BacklogStatus; triaged: boolean } {
  const { dir, name, item } = loadItem(opts.cwd, id);
  let target = routeReason(opts.reason);
  if (target === "carry-over" && !opts.next?.trim()) target = "needs-triage";
  item.status = target;
  item.reason = opts.reason;
  item.updated = today();
  item.movedBy = opts.by ?? "manual";
  item.movedSha = safeSha(opts.cwd) ?? item.movedSha;
  if (target === "carry-over" || target === "blocked") item.body = writeResume(item.body, opts);
  const path = join(dir, name);
  writeFileSync(path, serializeItem(item), "utf-8");
  return { path: resolve(path), status: target, triaged: target === "needs-triage" };
}

function persist(dir: string, name: string, item: BacklogItem, cwd?: string, sha?: string): string {
  item.updated = today();
  item.movedSha = sha ?? safeSha(cwd) ?? item.movedSha;
  const path = join(dir, name);
  writeFileSync(path, serializeItem(item), "utf-8");
  return resolve(path);
}

export function backlogClaim(id: string, opts: { cwd?: string; by?: string } = {}): string {
  const { dir, name, item } = loadItem(opts.cwd, id);
  if (item.status !== "open" && item.status !== "in-progress")
    throw new Error(`cannot claim ${id}: status is ${item.status}`);
  item.status = "in-progress";
  item.claimedBy = opts.by ?? "manual";
  item.movedBy = opts.by ?? "manual";
  return persist(dir, name, item, opts.cwd);
}

export function backlogResume(id: string, opts: { cwd?: string; by?: string } = {}): { path: string; resume: string } {
  const { dir, name, item } = loadItem(opts.cwd, id);
  if (item.status === "blocked") item.status = "open";
  else if (item.status === "carry-over") item.status = "in-progress";
  else throw new Error(`cannot resume ${id}: status is ${item.status} (only blocked or carry-over)`);
  item.movedBy = opts.by ?? "manual";
  const path = persist(dir, name, item, opts.cwd);
  const rm = /## Resume[\s\S]*$/m.exec(item.body);
  return { path, resume: rm ? (rm[0] ?? "") : "" };
}

export function backlogDone(id: string, opts: { cwd?: string; commit?: string; by?: string } = {}): string {
  const { dir, name, item } = loadItem(opts.cwd, id);
  item.status = "done";
  item.movedBy = opts.by ?? "manual";
  return persist(dir, name, item, opts.cwd, opts.commit);
}

export function backlogDecline(id: string, opts: { reason: string; note?: string; cwd?: string; by?: string }): string {
  if (!(DECLINE_REASONS as readonly string[]).includes(opts.reason))
    throw new Error(`decline reason must be one of ${DECLINE_REASONS.join(", ")}`);
  const { dir, name, item } = loadItem(opts.cwd, id);
  item.status = "declined";
  item.reason = opts.reason;
  item.movedBy = opts.by ?? "manual";
  if (opts.note) item.body = writeResume(item.body, { note: opts.note, next: "—" });
  return persist(dir, name, item, opts.cwd);
}

const TERMINAL: BacklogStatus[] = ["done", "declined"];

export interface ListOpts {
  cwd?: string; status?: BacklogStatus; source?: string; severity?: Severity; tag?: string;
}

function loadAll(cwd?: string): BacklogItem[] {
  const dir = backlogDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseItem(readFileSync(join(dir, f), "utf-8")));
}

export function backlogList(opts: ListOpts = {}): BacklogItem[] {
  return loadAll(opts.cwd).filter((i) => {
    if (opts.status) return i.status === opts.status;
    if (TERMINAL.includes(i.status)) return false;
    if (opts.source && i.source !== opts.source) return false;
    if (opts.severity && i.severity !== opts.severity) return false;
    if (opts.tag && !i.tags.includes(opts.tag)) return false;
    return true;
  });
}

export function backlogTriage(opts: { cwd?: string } = {}): BacklogItem[] {
  return loadAll(opts.cwd).filter((i) => i.status === "needs-triage");
}

export function backlogShow(id: string, opts: { cwd?: string } = {}): string {
  const { dir, name } = loadItem(opts.cwd, id);
  return readFileSync(join(dir, name), "utf-8");
}

export function formatLine(item: BacklogItem): string {
  return `${item.id}  ${item.status.padEnd(12)}  ${item.severity.padEnd(8)}  ${item.title}`;
}
