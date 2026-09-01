import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  compareRemoteHeads,
  MANIFEST_END,
  MANIFEST_START,
  PENDING_SHA,
  parseDriftManifest,
} from "../check-tc-drift-manifest.mjs";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = join(REPO, "scripts/check-tc-drift-manifest.mjs");
const MANIFEST = join(REPO, "packages/core/skills/_shared/tc-conventions.md");
const roots = [];
const SHA = "0123456789abcdef0123456789abcdef01234567";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function manifest(lines) {
  return ["before", MANIFEST_START, ...lines, MANIFEST_END, "after", ""].join("\n");
}

function validLines(sha = SHA) {
  return [
    `- \`content|ai/skills@${sha}:skills/creating-merge-requests/SKILL.md\``,
    `- \`watch-only|ai/aigovernance@${sha}\``,
    `- \`watch-only|ai/tc-guide@${sha}\``,
  ];
}

describe("TC drift manifest parser", () => {
  it("parses the repository's one content and two watch-only rows", () => {
    const rows = parseDriftManifest(readFileSync(MANIFEST, "utf8"));

    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map(({ kind, project }) => ({ kind, project })),
      [
        { kind: "content", project: "ai/skills" },
        { kind: "watch-only", project: "ai/aigovernance" },
        { kind: "watch-only", project: "ai/tc-guide" },
      ],
    );
    assert.equal(
      rows.some((row) => row.pending),
      false,
    );
  });

  it("rejects missing, duplicate, unexpected, and malformed rows", () => {
    const lines = validLines();
    assert.throws(() => parseDriftManifest(manifest(lines.slice(0, 2))), /missing manifest row/);
    assert.throws(
      () => parseDriftManifest(manifest([...lines, lines[2]])),
      /duplicate manifest row/,
    );
    assert.throws(
      () => parseDriftManifest(manifest([...lines, `- \`watch-only|ai/extra@${SHA}\``])),
      /unexpected manifest row/,
    );
    assert.throws(
      () => parseDriftManifest(manifest(lines.with(1, "- not-a-machine-row"))),
      /malformed manifest row/,
    );
  });

  it("enforces row kinds, content paths, and lowercase 40-character SHAs", () => {
    const lines = validLines();
    assert.throws(
      () =>
        parseDriftManifest(
          manifest(lines.with(1, `- \`content|ai/aigovernance@${SHA}:Governance.md\``)),
        ),
      /wrong manifest kind/,
    );
    assert.throws(
      () => parseDriftManifest(manifest(lines.with(0, `- \`content|ai/skills@${SHA}\``))),
      /content row must name a source path/,
    );
    assert.throws(
      () =>
        parseDriftManifest(
          manifest(lines.with(1, `- \`watch-only|ai/aigovernance@${SHA}:Governance.md\``)),
        ),
      /watch-only row must not name a source path/,
    );
    assert.throws(
      () => parseDriftManifest(manifest(lines.with(2, "- `watch-only|ai/tc-guide@ABC`"))),
      /malformed manifest row/,
    );
  });

  it("accepts the bootstrap sentinel structurally but never passes remote equality", () => {
    const rows = parseDriftManifest(manifest(validLines(PENDING_SHA)));
    const comparison = compareRemoteHeads(
      rows,
      Object.fromEntries(rows.map((row) => [row.project, SHA])),
    );

    assert.equal(comparison.ok, false);
    assert.deepEqual(
      comparison.results.map((result) => result.status),
      ["pending", "pending", "pending"],
    );
  });
});

describe("TC drift comparison", () => {
  it("compares every content and watch-only project without network access", () => {
    const rows = parseDriftManifest(manifest(validLines()));
    const heads = Object.fromEntries(rows.map((row) => [row.project, SHA]));
    assert.equal(compareRemoteHeads(rows, heads).ok, true);

    heads["ai/aigovernance"] = "f".repeat(40);
    const drift = compareRemoteHeads(rows, heads);
    assert.equal(drift.ok, false);
    assert.equal(
      drift.results.find((result) => result.project === "ai/aigovernance")?.status,
      "drift",
    );

    delete heads["ai/tc-guide"];
    assert.equal(
      compareRemoteHeads(rows, heads).results.find((result) => result.project === "ai/tc-guide")
        ?.status,
      "missing",
    );
  });

  it("runs structural CLI validation entirely offline", () => {
    const root = mkdtempSync(join(tmpdir(), "moe-tc-drift-"));
    roots.push(root);
    const path = join(root, "manifest.md");
    writeFileSync(path, manifest(validLines()));

    const run = spawnSync(process.execPath, [SCRIPT, "--manifest", path, "--json"], {
      encoding: "utf8",
      env: { ...process.env, TC_GITLAB_TOKEN: "" },
    });

    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.pending, []);
  });
});
