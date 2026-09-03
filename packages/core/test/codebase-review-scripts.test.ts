import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CORE = fileURLToPath(new URL("..", import.meta.url));
const REVIEW_SCOPE = join(CORE, "skills/reviewing-a-codebase/scripts/review-scope.mjs");
const REVIEW_MERGE = join(CORE, "skills/reviewing-a-codebase/scripts/review-merge.mjs");
const REVIEW_CHECK = join(CORE, "skills/reviewing-a-codebase/scripts/review-check.mjs");
const REVIEW_VERIFY_SCOPE = join(
  CORE,
  "skills/reviewing-a-codebase/scripts/review-verify-scope.mjs",
);
const REVIEW_VERIFY_RECORD = join(
  CORE,
  "skills/reviewing-a-codebase/scripts/review-verify-record.mjs",
);
const STAMP_DISPOSITION = join(CORE, "skills/fixing-a-code-review/scripts/stamp-disposition.mjs");
const COMPACT_RESOLVED = join(CORE, "skills/fixing-a-code-review/scripts/compact-resolved.mjs");
const REVIEW_SCRIPTS = [
  REVIEW_SCOPE,
  REVIEW_MERGE,
  REVIEW_CHECK,
  REVIEW_VERIFY_SCOPE,
  REVIEW_VERIFY_RECORD,
  STAMP_DISPOSITION,
  COMPACT_RESOLVED,
];

const sandboxes: string[] = [];

afterEach(() => {
  for (const path of sandboxes.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function sandbox(name: string): string {
  const path = mkdtempSync(join(tmpdir(), `moe-${name}-`));
  sandboxes.push(path);
  return path;
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}

function initRepo(files: Record<string, string>): string {
  const repo = sandbox("review-repo");
  git(repo, "init", "--quiet");
  git(repo, "config", "user.name", "Moe Test");
  git(repo, "config", "user.email", "moe-test@example.invalid");
  writeFiles(repo, files);
  git(repo, "add", "-f", "--", ".");
  git(repo, "commit", "--quiet", "-m", "fixture");
  return repo;
}

function run(script: string, args: string[], cwd: string) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 5_000,
  });
}

describe("review helper module boundaries", () => {
  it.each(REVIEW_SCRIPTS)("imports %s without executing its CLI", (script) => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `await import(${JSON.stringify(new URL(`file://${script}`).href)})`,
      ],
      { cwd: sandbox("silent-import"), encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("executes a CLI through a symlink", () => {
    const { file, repo } = stampFixture();
    const linked = join(repo, "stamp-linked.mjs");
    symlinkSync(STAMP_DISPOSITION, linked);
    const result = run(
      linked,
      ["--file", file, "--id", "CR-001", "--disposition", "fixed", "--commit", "abc1234"],
      repo,
    );
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("**Disposition:** fixed");
  });
});

interface ScopeShard {
  files: string[];
  files_path: string;
}

interface ScopeManifest {
  depth: string;
  denominator: number;
  in_scope_total: number;
  not_selected: number;
  shards: ScopeShard[];
}

function scopeManifest(repo: string, out: string): ScopeManifest {
  return JSON.parse(readFileSync(join(repo, out, "manifest.json"), "utf8")) as ScopeManifest;
}

describe("review-scope behavior", () => {
  it("defaults restartable shard artifacts into the self-ignoring .moe workspace", () => {
    const repo = initRepo({ "src/code.ts": "export {};\n" });

    const result = run(REVIEW_SCOPE, ["--depth", "medium"], repo);

    expect(result.status, result.stderr).toBe(0);
    const workspace = ".moe/review-shards";
    const manifest = scopeManifest(repo, workspace);
    expect(manifest.shards).toHaveLength(1);
    expect(manifest.shards[0]?.files_path).toBe(`${workspace}/shard-001-src-files.txt`);
    expect(readFileSync(join(repo, workspace, ".gitignore"), "utf8")).toBe("*\n");
    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  it("keeps every credential-bearing path in a shallow review alongside entrypoints and hot files", () => {
    const sensitive = [
      ".env.production",
      ".git-credentials",
      ".npmrc",
      "certs/server.pem",
      "config/secrets.env",
      "keys/id_ed25519",
      "ops/credentials.txt",
    ];
    const repo = initRepo({
      ...Object.fromEntries(sensitive.map((path) => [path, "fixture\n"])),
      "src/cold.ts": "export const cold = 1;\n",
      "src/hot.ts": "export const hot = 1;\n",
      "src/main.ts": "export const main = 1;\n",
    });

    for (const value of [2, 3]) {
      writeFileSync(join(repo, "src/hot.ts"), `export const hot = ${value};\n`);
      git(repo, "add", "src/hot.ts");
      git(repo, "commit", "--quiet", "-m", `heat ${value}`);
    }

    const result = run(REVIEW_SCOPE, ["--depth", "shallow", "--out", ".review"], repo);
    expect(result.status, result.stderr).toBe(0);
    const selected = scopeManifest(repo, ".review").shards.flatMap((shard) => shard.files);

    expect(selected).toEqual(expect.arrayContaining([...sensitive, "src/hot.ts", "src/main.ts"]));
    expect(selected).not.toContain("src/cold.ts");
  });

  it("widens medium to code and deep to scripts and config while honoring exclusions", () => {
    const repo = initRepo({
      "config/app.json": "{}\n",
      "config/app.toml": "enabled = true\n",
      "config/app.yaml": "enabled: true\n",
      "dist/generated.ts": "export const generated = true;\n",
      "docs/readme.md": "# not review source\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "scripts/task.sh": "#!/bin/sh\n",
      "secrets.env": "SECRET=fixture\n",
      "src/code.ts": "export const code = true;\n",
      "vendor/library.js": "export const vendored = true;\n",
    });

    expect(run(REVIEW_SCOPE, ["--depth", "medium", "--out", ".medium"], repo).status).toBe(0);
    expect(run(REVIEW_SCOPE, ["--depth", "deep", "--out", ".deep"], repo).status).toBe(0);

    const medium = scopeManifest(repo, ".medium").shards.flatMap((shard) => shard.files);
    const deep = scopeManifest(repo, ".deep").shards.flatMap((shard) => shard.files);
    expect(medium).toEqual(["secrets.env", "src/code.ts"]);
    expect(deep).toEqual([
      "config/app.json",
      "config/app.toml",
      "config/app.yaml",
      "secrets.env",
      "scripts/task.sh",
      "src/code.ts",
    ]);
    for (const excluded of ["dist/generated.ts", "pnpm-lock.yaml", "vendor/library.js"]) {
      expect(deep).not.toContain(excluded);
    }
  });

  it("rejects an unknown review depth", () => {
    const repo = initRepo({ "src/code.ts": "export {};\n" });
    const result = run(REVIEW_SCOPE, ["--depth", "wide"], repo);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown depth");
  });

  it.each(["0", "-1", "1.5", "NaN"])("rejects invalid shard size %s", (shardSize) => {
    const repo = initRepo({ "src/code.ts": "export {};\n" });
    const result = run(REVIEW_SCOPE, ["--shard-size", shardSize], repo);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("must be a positive integer");
  });

  it("assigns every selected file exactly once in deterministic bounded shards", () => {
    const repo = initRepo({
      "a/1.ts": "export {};\n",
      "a/2.ts": "export {};\n",
      "a/3.ts": "export {};\n",
      "b/1.js": "export {};\n",
      "b/2.js": "export {};\n",
      "root.ts": "export {};\n",
    });
    const args = ["--depth", "medium", "--shard-size", "2", "--out", ".review"];

    expect(run(REVIEW_SCOPE, args, repo).status).toBe(0);
    const firstText = readFileSync(join(repo, ".review/manifest.json"), "utf8");
    const first = scopeManifest(repo, ".review");
    const assigned = first.shards.flatMap((shard) => shard.files);

    expect(assigned).toHaveLength(first.denominator);
    expect(new Set(assigned).size).toBe(first.denominator);
    expect([...assigned].sort()).toEqual([
      "a/1.ts",
      "a/2.ts",
      "a/3.ts",
      "b/1.js",
      "b/2.js",
      "root.ts",
    ]);
    expect(first.shards.every((shard) => shard.files.length > 0 && shard.files.length <= 2)).toBe(
      true,
    );
    for (const shard of first.shards) {
      expect(readFileSync(join(repo, shard.files_path), "utf8").trim().split("\n")).toEqual(
        shard.files,
      );
    }

    rmSync(join(repo, ".review"), { recursive: true });
    expect(run(REVIEW_SCOPE, args, repo).status).toBe(0);
    expect(readFileSync(join(repo, ".review/manifest.json"), "utf8")).toBe(firstText);
  });

  it("excludes generated plugin mirrors and tracked source symlinks from the review denominator", () => {
    const outside = sandbox("review-outside");
    writeFileSync(join(outside, "secret.ts"), "export const secret = true;\n");
    const repo = initRepo({
      "packages/core/src/index.ts": "export {};\n",
      "plugins/moe-core/index.ts": "export const generated = true;\n",
    });
    symlinkSync(join(outside, "secret.ts"), join(repo, "packages/core/src/main.ts"));
    git(repo, "add", "packages/core/src/main.ts");
    git(repo, "commit", "--quiet", "-m", "tracked symlink");

    const result = run(REVIEW_SCOPE, ["--depth", "medium", "--out", ".review"], repo);

    expect(result.status, result.stderr).toBe(0);
    const selected = scopeManifest(repo, ".review").shards.flatMap((shard) => shard.files);
    expect(selected).toEqual(["packages/core/src/index.ts"]);
  });

  it("refuses a dirty tracked tree because HEAD would not identify what reviewers read", () => {
    const repo = initRepo({ "src/code.ts": "export const value = 1;\n" });
    writeFileSync(join(repo, "src/code.ts"), "export const value = 2;\n");

    const result = run(REVIEW_SCOPE, ["--depth", "medium"], repo);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("tracked working tree is dirty");
  });

  it("refuses a symlinked review workspace without writing through it", () => {
    const repo = initRepo({ "src/code.ts": "export {};\n" });
    const outside = sandbox("review-output");
    mkdirSync(join(repo, ".moe"));
    symlinkSync(outside, join(repo, ".moe/review-shards"));

    const result = run(REVIEW_SCOPE, ["--depth", "medium"], repo);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("symlink");
    expect(git(repo, "status", "--porcelain", "--untracked-files=no")).toBe("");
    expect(() => readFileSync(join(outside, "manifest.json"))).toThrow();
  });
});

interface MergeFixture {
  baseSha: string;
  repo: string;
  reportsDir: string;
}

function mergeFixture(reports: Array<string | null>): MergeFixture {
  const repo = sandbox("merge-repo");
  git(repo, "init", "--quiet");
  git(repo, "config", "user.name", "Moe Test");
  git(repo, "config", "user.email", "moe-test@example.invalid");
  // Every path a fixture report cites must exist: the merge refuses a File it
  // cannot find in the tree, because the fix workflow could never address it.
  writeFiles(repo, {
    "src/base.ts": "export {};\n",
    ...Object.fromEntries(
      ["a", "c", "h", "l", "m", "sound", "z"].map((name) => [`src/${name}.ts`, "export {};\n"]),
    ),
  });
  git(repo, "add", "--", "src");
  git(repo, "commit", "--quiet", "-m", "fixture");
  const baseSha = git(repo, "rev-parse", "HEAD").trim();
  const reportsDir = join(repo, ".review-shards");
  mkdirSync(reportsDir);
  const shards = reports.map((body, index) => {
    const id = index + 1;
    const reportPath = `.review-shards/shard-${id}-REVIEW.md`;
    if (body !== null) {
      writeFileSync(
        join(repo, reportPath),
        `<!-- moe-review-shard\nbase_sha: ${baseSha}\nfiles_opened: 1\n-->\n${body}`,
      );
    }
    return {
      id,
      group: `group-${id}`,
      files: [`src/file-${id}.ts`],
      files_path: `.review-shards/shard-${id}-files.txt`,
      report_path: reportPath,
    };
  });
  writeFileSync(
    join(reportsDir, "manifest.json"),
    `${JSON.stringify(
      {
        base_sha: baseSha,
        depth: "medium",
        shard_size: 30,
        denominator: shards.length,
        denominator_rule: "tracked source fixture",
        in_scope_total: shards.length + 1,
        outside_denominator: 2,
        outside_denominator_areas: ["docs", "infra"],
        not_selected: 1,
        shards,
      },
      null,
      2,
    )}\n`,
  );
  return { baseSha, repo, reportsDir };
}

describe("review-merge behavior", () => {
  it("orders valid findings, assigns stable IDs and preserves coverage and checked-clean evidence", () => {
    const { repo } = mergeFixture([
      [
        "---",
        "shard: one",
        "---",
        "### Medium issue",
        "**File:** `src/z.ts`",
        "**Anchor:** `zSymbol`",
        "**Severity:** medium",
        "medium body",
        "",
        "### Checked and found sound",
        "`src/sound.ts` has bounded input handling.",
        "",
      ].join("\n"),
      [
        "### Low issue",
        "**File:** `src/l.ts`",
        "**Anchor:** `lSymbol`",
        "**Severity:** low",
        "low body",
        "",
        "### Critical issue",
        "**File:** `src/c.ts`",
        "**Anchor:** `cSymbol`",
        "**Severity:** CRITICAL",
        "critical body",
        "",
        "### High issue",
        "**File:** `src/h.ts`",
        "**Anchor:** `hSymbol`",
        "**Severity:** high",
        "high body",
        "",
      ].join("\n"),
    ]);
    const args = ["--shards", ".review-shards", "--out", "CODEBASE-REVIEW.md"];

    const firstRun = run(REVIEW_MERGE, args, repo);
    expect(firstRun.status, firstRun.stderr).toBe(0);
    const first = readFileSync(join(repo, "CODEBASE-REVIEW.md"), "utf8");
    const headings = [...first.matchAll(/^### (CR-\d{3}: .+)$/gm)].map((match) => match[1]);

    expect(headings).toEqual([
      "CR-001: Critical issue",
      "CR-002: High issue",
      "CR-003: Medium issue",
      "CR-004: Low issue",
    ]);
    expect(first).toContain("critical: 1");
    expect(first).toContain("high: 1");
    expect(first).toContain("medium: 1");
    expect(first).toContain("low: 1");
    expect(first).toContain("total: 4");
    expect(first).toContain("verified: false");
    expect(first).toContain("status: issues_found");
    expect(first).toContain("**Opened:** 2 of 2 counted files.");
    expect(first).toContain("**In scope but not selected at this depth:** 1.");
    expect(first).toContain("**Tracked but outside the denominator:** 2 (under `docs`, `infra`).");
    expect(first).toContain("## Checked and found sound");
    expect(first).toContain("`src/sound.ts` has bounded input handling.");

    expect(run(REVIEW_MERGE, args, repo).status).toBe(0);
    expect(readFileSync(join(repo, "CODEBASE-REVIEW.md"), "utf8")).toBe(first);
  });

  it("refuses to emit a report when any shard report is missing", () => {
    const { repo } = mergeFixture([
      "### Valid\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** low\nbody\n",
      null,
    ]);
    const result = run(REVIEW_MERGE, ["--shards", ".review-shards", "--out", "out.md"], repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("shard report(s) missing");
    expect(() => readFileSync(join(repo, "out.md"))).toThrow();
  });

  it("refuses to claim verification without a complete challenger-results ledger", () => {
    const { repo } = mergeFixture([
      "### Serious\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** high\nbody\n",
    ]);

    const result = run(
      REVIEW_MERGE,
      ["--shards", ".review-shards", "--out", "out.md", "--verified"],
      repo,
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--verification-results");
    expect(() => readFileSync(join(repo, "out.md"))).toThrow();
  });

  it("applies one base-matched challenger verdict per serious finding before marking verified", () => {
    const { baseSha, repo } = mergeFixture([
      [
        "### Critical survives",
        "**File:** `src/c.ts`",
        "**Anchor:** `cSymbol`",
        "**Severity:** critical",
        "critical body",
        "",
        "### High falls",
        "**File:** `src/h.ts`",
        "**Anchor:** `hSymbol`",
        "**Severity:** high",
        "high body",
        "",
        "### Medium untouched",
        "**File:** `src/m.ts`",
        "**Anchor:** `mSymbol`",
        "**Severity:** medium",
        "medium body",
        "",
      ].join("\n"),
    ]);
    writeFileSync(
      join(repo, "verifications.json"),
      `${JSON.stringify({
        base_sha: baseSha,
        results: [
          {
            id: "CR-001",
            verdict: "confirmed",
            evidence: "Reproduced from the public route.",
          },
          {
            id: "CR-002",
            verdict: "refuted",
            evidence: "An upstream guard rejects the payload.",
          },
        ],
      })}\n`,
    );

    const result = run(
      REVIEW_MERGE,
      [
        "--shards",
        ".review-shards",
        "--out",
        "CODEBASE-REVIEW.md",
        "--verification-results",
        "verifications.json",
      ],
      repo,
    );

    expect(result.status, result.stderr).toBe(0);
    const report = readFileSync(join(repo, "CODEBASE-REVIEW.md"), "utf8");
    expect(report).toContain("verified: true");
    expect(report).toContain("critical: 1");
    expect(report).toContain("high: 0");
    expect(report).toContain("medium: 1");
    expect(report).toContain("total: 2");
    expect(report).toContain("confirmed: 1");
    expect(report).toContain("refuted: 1");
    expect(report).toContain("**Verification:** confirmed");
    expect(report).toContain("## Refuted by verification");
    expect(report).toContain("### CR-002: High falls");
    expect(report).toContain("**Verification:** refuted");
  });

  it("keeps stable IDs while moving confirmed-lower findings to their corrected severity", () => {
    const { baseSha, repo } = mergeFixture([
      [
        "### Overstated",
        "**File:** `src/a.ts`",
        "**Anchor:** `aSymbol`",
        "**Severity:** critical",
        "body",
        "",
      ].join("\n"),
    ]);
    writeFileSync(
      join(repo, "verifications.json"),
      `${JSON.stringify({
        base_sha: baseSha,
        results: [
          {
            id: "CR-001",
            verdict: "confirmed-lower",
            severity: "medium",
            evidence: "The path is local-only and requires an unusual precondition.",
          },
        ],
      })}\n`,
    );

    const result = run(
      REVIEW_MERGE,
      ["--shards", ".review-shards", "--verification-results", "verifications.json"],
      repo,
    );

    expect(result.status, result.stderr).toBe(0);
    const report = readFileSync(join(repo, "CODEBASE-REVIEW.md"), "utf8");
    expect(report).not.toContain("## Critical");
    expect(report).toContain("## Medium");
    expect(report).toContain("### CR-001: Overstated");
    expect(report).toContain("**Severity:** medium");
    expect(report).toContain("**Verification:** confirmed-lower");
  });

  it("refuses a shard report without machine-readable base and coverage provenance", () => {
    const { repo } = mergeFixture([
      "### Valid\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** low\nbody\n",
    ]);
    writeFileSync(
      join(repo, ".review-shards/shard-1-REVIEW.md"),
      "### Valid\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** low\nbody\n",
    );

    const result = run(REVIEW_MERGE, ["--shards", ".review-shards", "--out", "out.md"], repo);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("shard provenance failure");
    expect(result.stderr).toContain("missing shard provenance header");
  });

  it("refuses to merge after HEAD advances beyond the manifest base", () => {
    const { repo } = mergeFixture([
      "### Valid\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** low\nbody\n",
    ]);
    writeFileSync(join(repo, "src/base.ts"), "export const changed = true;\n");
    git(repo, "add", "src/base.ts");
    git(repo, "commit", "--quiet", "-m", "advance");

    const result = run(REVIEW_MERGE, ["--shards", ".review-shards", "--out", "out.md"], repo);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match shard manifest base_sha");
  });

  it.each([
    ["a missing serious finding", { base_sha: "__BASE__", results: [] }, "missing verdict"],
    [
      "a mismatched base",
      {
        base_sha: "wrong",
        results: [{ id: "CR-001", verdict: "confirmed", evidence: "evidence" }],
      },
      "base_sha",
    ],
    [
      "a duplicate result",
      {
        base_sha: "__BASE__",
        results: [
          { id: "CR-001", verdict: "confirmed", evidence: "one" },
          { id: "CR-001", verdict: "refuted", evidence: "two" },
        ],
      },
      "duplicate",
    ],
  ])("rejects verification results with %s", (_label, ledger, expected) => {
    const { baseSha, repo } = mergeFixture([
      "### Serious\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** high\nbody\n",
    ]);
    const resolvedLedger = JSON.parse(JSON.stringify(ledger).replaceAll("__BASE__", baseSha));
    writeFileSync(join(repo, "verifications.json"), `${JSON.stringify(resolvedLedger)}\n`);

    const result = run(
      REVIEW_MERGE,
      [
        "--shards",
        ".review-shards",
        "--out",
        "out.md",
        "--verification-results",
        "verifications.json",
      ],
      repo,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expected);
    expect(() => readFileSync(join(repo, "out.md"))).toThrow();
  });

  it("refuses a finding whose File path does not exist in the tree", () => {
    const { repo } = mergeFixture([
      "### Phantom\n**File:** `src/missing.ts`\n**Anchor:** `aSymbol`\n**Severity:** high\nbody\n",
    ]);

    const result = run(REVIEW_MERGE, ["--shards", ".review-shards", "--out", "out.md"], repo);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("malformed finding record");
    expect(result.stderr).toContain("does not exist");
    expect(() => readFileSync(join(repo, "out.md"))).toThrow();
  });

  it.each([
    ["a fieldless heading", "### Broken\nbody\n"],
    ["a file without severity", "### Broken\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\nbody\n"],
    ["a severity without file", "### Broken\n**Anchor:** `aSymbol`\n**Severity:** high\nbody\n"],
    [
      "an invented severity",
      "### Broken\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** policy\nbody\n",
    ],
    ["a missing anchor", "### Broken\n**File:** `src/a.ts`\n**Severity:** high\nbody\n"],
    [
      "a line-number citation",
      "### Broken\n**File:** `src/a.ts:12`\n**Anchor:** `aSymbol`\n**Severity:** high\nbody\n",
    ],
  ])("refuses malformed finding records: %s", (_label, report) => {
    const { repo } = mergeFixture([report]);
    const result = run(REVIEW_MERGE, ["--shards", ".review-shards", "--out", "out.md"], repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("malformed finding record");
    expect(() => readFileSync(join(repo, "out.md"))).toThrow();
  });
});

function reviewReport(): string {
  return [
    "---",
    "report: codebase-review",
    "findings:",
    "  critical: 1",
    "  high: 1",
    "  medium: 1",
    "  low: 0",
    "  total: 3",
    "status: issues_found",
    "---",
    "# Review fixture",
    "",
    "## Critical",
    "",
    "### CR-001: First finding",
    "**File:** `src/first.ts`",
    "**Anchor:** `firstFinding`",
    "**Severity:** critical",
    "First finding body.",
    "",
    "## High",
    "",
    "### CR-002: Already stale",
    "**File:** `src/second.ts`",
    "**Anchor:** `already stale`",
    "**Severity:** high",
    "Second finding body must survive byte-for-byte.",
    "",
    "**Disposition:** stale",
    "**Commit:** —",
    "**Resolved:** 2026-08-31",
    "**Note:** Superseded before this run.",
    "",
    "## Medium",
    "",
    "### CR-003: Third finding",
    "**File:** `src/third.ts`",
    "**Anchor:** `thirdFinding`",
    "**Severity:** medium",
    "Third finding body.",
    "",
    "## Checked and found sound",
    "",
    "The parser preserved unrelated content.",
    "",
  ].join("\n");
}

function stampFixture(): { file: string; repo: string } {
  const repo = sandbox("stamp-repo");
  const file = join(repo, "CODEBASE-REVIEW.md");
  writeFileSync(file, reviewReport());
  return { file, repo };
}

describe("stamp-disposition behavior", () => {
  it("stamps required fields and recomputes counts without changing unrelated findings", () => {
    const { file, repo } = stampFixture();
    const original = readFileSync(file, "utf8");
    const unrelated = original.slice(original.indexOf("### CR-002"));

    const fixed = run(
      STAMP_DISPOSITION,
      ["--file", file, "--id", "CR-001", "--disposition", "fixed", "--commit", "abc1234"],
      repo,
    );
    expect(fixed.status, fixed.stderr).toBe(0);
    const afterFixed = readFileSync(file, "utf8");
    expect(afterFixed).toContain("**Disposition:** fixed");
    expect(afterFixed).toContain("**Commit:** `abc1234`");
    expect(afterFixed).toMatch(/\*\*Resolved:\*\* \d{4}-\d{2}-\d{2}/);
    expect(afterFixed).toContain("**Note:** —");
    expect(afterFixed).toContain("  fixed: 1");
    expect(afterFixed).toContain("  stale: 1");
    expect(afterFixed).toContain("  skipped: 0");
    expect(afterFixed).toContain("  deferred: 0");
    expect(afterFixed).toContain("  open: 1");
    expect(afterFixed.slice(afterFixed.indexOf("### CR-002"))).toBe(unrelated);

    const deferred = run(
      STAMP_DISPOSITION,
      [
        "--file",
        file,
        "--id",
        "CR-003",
        "--disposition",
        "deferred",
        "--note",
        "No runnable fixture in this environment.",
      ],
      repo,
    );
    expect(deferred.status, deferred.stderr).toBe(0);
    const afterDeferred = readFileSync(file, "utf8");
    expect(afterDeferred).toContain("**Disposition:** deferred");
    expect(afterDeferred).toContain("**Commit:** —");
    expect(afterDeferred).toContain("**Note:** No runnable fixture in this environment.");
    expect(afterDeferred).toContain("  deferred: 1");
    expect(afterDeferred).toContain("  open: 0");
    expect(afterDeferred).toContain("The parser preserved unrelated content.");
  });

  it("rejects a duplicate stamp without changing the report", () => {
    const { file, repo } = stampFixture();
    const before = readFileSync(file, "utf8");
    const result = run(
      STAMP_DISPOSITION,
      ["--file", file, "--id", "CR-002", "--disposition", "stale", "--note", "Again"],
      repo,
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("already has a disposition");
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it.each([
    ["missing id", ["--disposition", "fixed", "--commit", "abc1234"], "--id must"],
    [
      "malformed id",
      ["--id", "CR-1", "--disposition", "fixed", "--commit", "abc1234"],
      "--id must",
    ],
    [
      "unknown id",
      ["--id", "CR-999", "--disposition", "fixed", "--commit", "abc1234"],
      "not found",
    ],
    [
      "invalid disposition",
      ["--id", "CR-001", "--disposition", "ignored", "--note", "why"],
      "must be one of",
    ],
    ["fixed without commit", ["--id", "CR-001", "--disposition", "fixed"], "needs --commit"],
    ["nonfixed without note", ["--id", "CR-001", "--disposition", "stale"], "needs --note"],
  ])("rejects %s", (_label, args, message) => {
    const { file, repo } = stampFixture();
    const before = readFileSync(file, "utf8");
    const result = run(STAMP_DISPOSITION, ["--file", file, ...args], repo);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(message);
    expect(readFileSync(file, "utf8")).toBe(before);
  });
});

const VALID_REPORT =
  "### Valid\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** low\nbody\n";

describe("review-check behavior", () => {
  it("passes finished reports and counts unfinished shards without failing", () => {
    const { repo } = mergeFixture([VALID_REPORT, null]);

    const result = run(REVIEW_CHECK, ["--shards", ".review-shards"], repo);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("ok shard-001 0C/0H/0M/1L");
    expect(result.stdout).toContain("1/2 reports");
  });

  it("fails when --require-all finds an unfinished shard", () => {
    const { repo } = mergeFixture([VALID_REPORT, null]);

    const result = run(REVIEW_CHECK, ["--shards", ".review-shards", "--require-all"], repo);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("missing");
  });

  it.each([
    [
      "a heading inside a fenced block",
      "### Valid\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** low\n```\n### not a heading\n```\n",
      "inside a fenced",
    ],
    [
      "a double-backtick anchor",
      "### Valid\n**File:** `src/a.ts`\n**Anchor:** `` `x` in `y` ``\n**Severity:** low\nbody\n",
      "anchor",
    ],
    [
      "a File path missing from the tree",
      "### Valid\n**File:** `src/missing.ts`\n**Anchor:** `aSymbol`\n**Severity:** low\nbody\n",
      "does not exist",
    ],
    [
      "a line-number citation in the body",
      "### Valid\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** low\nsee `src/a.ts:12` for details\n",
      "line-number",
    ],
    [
      "an invented severity",
      "### Valid\n**File:** `src/a.ts`\n**Anchor:** `aSymbol`\n**Severity:** policy\nbody\n",
      "severity",
    ],
  ])("flags %s", (_label, report, expected) => {
    const { repo } = mergeFixture([report]);

    const result = run(REVIEW_CHECK, ["--shards", ".review-shards"], repo);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("PROBLEM shard-001");
    expect(result.stdout).toContain(expected);
  });

  it("flags a files_opened count that does not match the shard assignment", () => {
    const { baseSha, repo } = mergeFixture([VALID_REPORT]);
    writeFileSync(
      join(repo, ".review-shards/shard-1-REVIEW.md"),
      `<!-- moe-review-shard\nbase_sha: ${baseSha}\nfiles_opened: 7\n-->\n${VALID_REPORT}`,
    );

    const result = run(REVIEW_CHECK, ["--shards", ".review-shards"], repo);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("files_opened");
  });
});

function seriousFixture(): MergeFixture {
  const fixture = mergeFixture([
    [
      "### Critical one",
      "**File:** `src/c.ts`",
      "**Anchor:** `cSymbol`",
      "**Severity:** critical",
      "critical body",
      "",
      "### High one",
      "**File:** `src/h.ts`",
      "**Anchor:** `hSymbol`",
      "**Severity:** high",
      "high body",
      "",
      "### Medium one",
      "**File:** `src/m.ts`",
      "**Anchor:** `mSymbol`",
      "**Severity:** medium",
      "medium body",
      "",
    ].join("\n"),
  ]);
  const merged = run(
    REVIEW_MERGE,
    ["--shards", ".review-shards", "--out", "CODEBASE-REVIEW.md"],
    fixture.repo,
  );
  expect(merged.status, merged.stderr).toBe(0);
  return fixture;
}

const SCOPE_ARGS = ["--shards", ".review-shards", "--report", "CODEBASE-REVIEW.md"];

interface VerifyManifest {
  base_sha: string;
  findings: Array<{ id: string; severity: string; file: string; title: string; path: string }>;
}

describe("review-verify-scope behavior", () => {
  it("extracts only critical and high findings into per-finding files with a manifest", () => {
    const { baseSha, repo } = seriousFixture();

    const result = run(REVIEW_VERIFY_SCOPE, SCOPE_ARGS, repo);

    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(repo, ".review-shards/verify/manifest.json"), "utf8"),
    ) as VerifyManifest;
    expect(manifest.base_sha).toBe(baseSha);
    expect(manifest.findings.map((finding) => finding.id)).toEqual(["CR-001", "CR-002"]);
    expect(manifest.findings[0]?.severity).toBe("critical");
    expect(manifest.findings[1]?.file).toBe("src/h.ts");
    expect(readFileSync(join(repo, ".review-shards/verify/CR-001.md"), "utf8")).toContain(
      "### CR-001: Critical one",
    );
    expect(readFileSync(join(repo, ".review-shards/verify/CR-002.md"), "utf8")).toContain(
      "**Severity:** high",
    );
    expect(() => readFileSync(join(repo, ".review-shards/verify/CR-003.md"))).toThrow();
    expect(result.stdout).toContain("2 serious finding(s)");
  });

  it("refuses a report whose base does not match the shard manifest", () => {
    const { repo } = seriousFixture();
    const report = readFileSync(join(repo, "CODEBASE-REVIEW.md"), "utf8").replace(
      /^base_sha: .*$/m,
      "base_sha: 0000000000000000000000000000000000000000",
    );
    writeFileSync(join(repo, "CODEBASE-REVIEW.md"), report);

    const result = run(REVIEW_VERIFY_SCOPE, SCOPE_ARGS, repo);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("base_sha");
    expect(() => readFileSync(join(repo, ".review-shards/verify/manifest.json"))).toThrow();
  });
});

function scopedFixture(): MergeFixture {
  const fixture = seriousFixture();
  const scoped = run(REVIEW_VERIFY_SCOPE, SCOPE_ARGS, fixture.repo);
  expect(scoped.status, scoped.stderr).toBe(0);
  return fixture;
}

const RECORD_ARGS = ["--shards", ".review-shards"];

function ledgerOf(repo: string): { base_sha: string; results: Array<Record<string, string>> } {
  return JSON.parse(readFileSync(join(repo, ".review-shards/verifications.json"), "utf8"));
}

describe("review-verify-record behavior", () => {
  it("records raw verdicts and verdict lines pulled from a full reply, then feeds the merge", () => {
    const { baseSha, repo } = scopedFixture();
    writeFileSync(
      join(repo, "reply.txt"),
      'Reasoning paragraph.\n\nVERDICT-JSON: {"id":"CR-002","verdict":"confirmed-lower","severity":"medium","evidence":"Only a warm cache is affected."}\n',
    );

    const first = run(
      REVIEW_VERIFY_RECORD,
      [
        ...RECORD_ARGS,
        JSON.stringify({ id: "CR-001", verdict: "confirmed", evidence: "Reproduced." }),
      ],
      repo,
    );
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain("recorded CR-001 confirmed");
    expect(first.stdout).toContain("1/2 recorded");

    const second = run(REVIEW_VERIFY_RECORD, [...RECORD_ARGS, "--from-file", "reply.txt"], repo);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain("recorded CR-002 confirmed-lower -> medium");
    expect(second.stdout).toContain("2/2 recorded");

    const ledger = ledgerOf(repo);
    expect(ledger.base_sha).toBe(baseSha);
    expect(ledger.results).toEqual([
      { id: "CR-001", verdict: "confirmed", evidence: "Reproduced." },
      {
        id: "CR-002",
        verdict: "confirmed-lower",
        severity: "medium",
        evidence: "Only a warm cache is affected.",
      },
    ]);

    const merged = run(
      REVIEW_MERGE,
      [
        "--shards",
        ".review-shards",
        "--out",
        "CODEBASE-REVIEW.md",
        "--verification-results",
        ".review-shards/verifications.json",
      ],
      repo,
    );
    expect(merged.status, merged.stderr).toBe(0);
    const report = readFileSync(join(repo, "CODEBASE-REVIEW.md"), "utf8");
    expect(report).toContain("verified: true");
    expect(report).toContain("confirmed_lower: 1");
  });

  it("drops a severity that merely restates the original on a confirmed verdict", () => {
    const { repo } = scopedFixture();

    const result = run(
      REVIEW_VERIFY_RECORD,
      [
        ...RECORD_ARGS,
        JSON.stringify({ id: "CR-001", verdict: "confirmed", severity: "critical", evidence: "x" }),
      ],
      repo,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(ledgerOf(repo).results[0]).toEqual({
      id: "CR-001",
      verdict: "confirmed",
      evidence: "x",
    });
  });

  it.each([
    [
      "an unknown id",
      { id: "CR-009", verdict: "confirmed", evidence: "x" },
      "not a serious finding",
    ],
    ["an invalid verdict", { id: "CR-001", verdict: "maybe", evidence: "x" }, "verdict"],
    [
      "a confirmed-lower that does not lower",
      { id: "CR-001", verdict: "confirmed-lower", severity: "critical", evidence: "x" },
      "below",
    ],
    ["empty evidence", { id: "CR-001", verdict: "confirmed", evidence: "  " }, "evidence"],
    [
      "a severity that contradicts a non-lowering verdict",
      { id: "CR-001", verdict: "confirmed", severity: "low", evidence: "x" },
      "severity",
    ],
    [
      "evidence past the length cap",
      { id: "CR-001", verdict: "confirmed", evidence: "x".repeat(1001) },
      "1000",
    ],
  ])("rejects %s without writing the ledger", (_label, verdict, expected) => {
    const { repo } = scopedFixture();

    const result = run(REVIEW_VERIFY_RECORD, [...RECORD_ARGS, JSON.stringify(verdict)], repo);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(expected);
    expect(() => readFileSync(join(repo, ".review-shards/verifications.json"))).toThrow();
  });

  it("refuses to overwrite an existing verdict unless told to replace it", () => {
    const { repo } = scopedFixture();
    const first = JSON.stringify({ id: "CR-001", verdict: "confirmed", evidence: "first" });
    const second = JSON.stringify({ id: "CR-001", verdict: "refuted", evidence: "second" });
    expect(run(REVIEW_VERIFY_RECORD, [...RECORD_ARGS, first], repo).status).toBe(0);

    const again = run(REVIEW_VERIFY_RECORD, [...RECORD_ARGS, second], repo);
    expect(again.status).toBe(2);
    expect(again.stderr).toContain("--replace");
    expect(ledgerOf(repo).results[0]?.verdict).toBe("confirmed");

    const replaced = run(REVIEW_VERIFY_RECORD, [...RECORD_ARGS, "--replace", second], repo);
    expect(replaced.status, replaced.stderr).toBe(0);
    expect(ledgerOf(repo).results[0]?.verdict).toBe("refuted");
  });

  it("refuses a reply with no verdict line", () => {
    const { repo } = scopedFixture();
    writeFileSync(join(repo, "reply.txt"), "I could not decide.\n");

    const result = run(REVIEW_VERIFY_RECORD, [...RECORD_ARGS, "--from-file", "reply.txt"], repo);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("VERDICT-JSON");
    expect(() => readFileSync(join(repo, ".review-shards/verifications.json"))).toThrow();
  });
});
