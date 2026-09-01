#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_START = "<!-- tc-drift-manifest:start -->";
export const MANIFEST_END = "<!-- tc-drift-manifest:end -->";
export const PENDING_SHA = "<TC-BOOTSTRAP-PENDING>";

export const EXPECTED_ROWS = Object.freeze([
  Object.freeze({
    kind: "content",
    project: "ai/skills",
    path: "skills/creating-merge-requests/SKILL.md",
  }),
  Object.freeze({ kind: "watch-only", project: "ai/aigovernance", path: null }),
  Object.freeze({ kind: "watch-only", project: "ai/tc-guide", path: null }),
]);

const ROW_PATTERN =
  /^- `(content|watch-only)\|(ai\/[a-z0-9][a-z0-9._/-]*)@([0-9a-f]{40}|<TC-BOOTSTRAP-PENDING>)(?::([A-Za-z0-9._/-]+))?`$/;

function countOccurrences(source, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + needle.length;
  }
}

export function parseDriftManifest(source) {
  if (countOccurrences(source, MANIFEST_START) !== 1) {
    throw new Error(`manifest must contain exactly one ${MANIFEST_START} marker`);
  }
  if (countOccurrences(source, MANIFEST_END) !== 1) {
    throw new Error(`manifest must contain exactly one ${MANIFEST_END} marker`);
  }

  const start = source.indexOf(MANIFEST_START) + MANIFEST_START.length;
  const end = source.indexOf(MANIFEST_END);
  if (end <= start) throw new Error("manifest end marker must follow its start marker");

  const lines = source
    .slice(start, end)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = lines.map((line) => {
    const match = ROW_PATTERN.exec(line);
    if (!match) throw new Error(`malformed manifest row: ${line}`);
    const [, kind, project, sha, path = null] = match;
    if (kind === "content" && path === null) {
      throw new Error(`content row must name a source path: ${project}`);
    }
    if (kind === "watch-only" && path !== null) {
      throw new Error(`watch-only row must not name a source path: ${project}`);
    }
    return Object.freeze({ kind, project, sha, path, pending: sha === PENDING_SHA });
  });

  const byProject = new Map();
  for (const row of rows) {
    if (byProject.has(row.project)) throw new Error(`duplicate manifest row: ${row.project}`);
    byProject.set(row.project, row);
  }

  for (const expected of EXPECTED_ROWS) {
    const row = byProject.get(expected.project);
    if (!row) throw new Error(`missing manifest row: ${expected.project}`);
    if (row.kind !== expected.kind) {
      throw new Error(
        `wrong manifest kind for ${expected.project}: expected ${expected.kind}, got ${row.kind}`,
      );
    }
    if (row.path !== expected.path) {
      throw new Error(
        `wrong source path for ${expected.project}: expected ${expected.path ?? "none"}, got ${row.path ?? "none"}`,
      );
    }
  }

  if (rows.length !== EXPECTED_ROWS.length) {
    const unexpected = rows.filter(
      (row) => !EXPECTED_ROWS.some((expected) => expected.project === row.project),
    );
    throw new Error(`unexpected manifest row: ${unexpected[0]?.project ?? "unknown"}`);
  }

  return rows;
}

export function compareRemoteHeads(rows, remoteHeads) {
  const lookup = remoteHeads instanceof Map ? remoteHeads : new Map(Object.entries(remoteHeads));
  const results = rows.map((row) => {
    if (row.pending) return { ...row, status: "pending", upstream: null };
    const upstream = lookup.get(row.project) ?? null;
    if (upstream === null) return { ...row, status: "missing", upstream };
    if (!/^[0-9a-f]{40}$/.test(upstream)) {
      return { ...row, status: "malformed-upstream", upstream };
    }
    return { ...row, status: upstream === row.sha ? "current" : "drift", upstream };
  });
  return { ok: results.every((result) => result.status === "current"), results };
}

export async function fetchRemoteHeads(rows, { token, fetchImpl = globalThis.fetch } = {}) {
  if (!token) throw new Error("TC_GITLAB_TOKEN is required for --check-remote");
  if (typeof fetchImpl !== "function")
    throw new Error("a Fetch-compatible implementation is required");

  const projects = [...new Set(rows.map((row) => row.project))];
  const entries = await Promise.all(
    projects.map(async (project) => {
      const encoded = encodeURIComponent(project);
      const response = await fetchImpl(
        `https://gitlab.tcdevops.com/api/v4/projects/${encoded}/repository/commits/main`,
        { headers: { "PRIVATE-TOKEN": token } },
      );
      if (!response.ok) {
        throw new Error(`GitLab returned HTTP ${response.status} for ${project}`);
      }
      const payload = await response.json();
      if (!payload || typeof payload.id !== "string") {
        throw new Error(`GitLab returned no commit id for ${project}`);
      }
      return [project, payload.id];
    }),
  );
  return new Map(entries);
}

function parseArgs(argv) {
  const options = {
    manifest: "packages/core/skills/_shared/tc-conventions.md",
    checkRemote: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest") {
      const value = argv[index + 1];
      if (!value) throw new Error("--manifest requires a path");
      options.manifest = value;
      index += 1;
    } else if (argument === "--check-remote") {
      options.checkRemote = true;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/check-tc-drift-manifest.mjs [options]

Options:
  --manifest <path>  Manifest file (default: packages/core/skills/_shared/tc-conventions.md)
  --check-remote     Compare every row with the TC GitLab project's main ref
  --json             Emit machine-readable JSON
  --help             Show this help

Remote mode requires TC_GITLAB_TOKEN. Structural validation is offline by default.`);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const manifestPath = resolve(options.manifest);
  const rows = parseDriftManifest(await readFile(manifestPath, "utf8"));
  if (!options.checkRemote) {
    const result = {
      ok: true,
      manifest: manifestPath,
      rows,
      pending: rows.filter((row) => row.pending).map((row) => row.project),
    };
    if (options.json) console.log(JSON.stringify(result));
    else {
      console.log(
        `VALID: ${rows.length} TC drift rows (${rows.filter((row) => row.kind === "content").length} content, ${rows.filter((row) => row.kind === "watch-only").length} watch-only, ${result.pending.length} pending)`,
      );
    }
    return 0;
  }

  const heads = await fetchRemoteHeads(rows, {
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone scheduled checker is not a cached Turbo task
    token: process.env.TC_GITLAB_TOKEN,
  });
  const comparison = compareRemoteHeads(rows, heads);
  if (options.json) console.log(JSON.stringify({ manifest: manifestPath, ...comparison }));
  else {
    for (const result of comparison.results) {
      if (result.status === "current") {
        console.log(`OK: ${result.kind} ${result.project} @ ${result.sha}`);
      } else if (result.status === "pending") {
        console.error(`PENDING: ${result.kind} ${result.project} has no pinned SHA`);
      } else {
        console.error(
          `${result.status.toUpperCase()}: ${result.kind} ${result.project} pinned=${result.sha} upstream=${result.upstream ?? "unavailable"}`,
        );
      }
    }
  }
  return comparison.ok ? 0 : 1;
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`TC drift manifest check failed: ${error.message}`);
      process.exitCode = 1;
    });
}
