import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test } from "vitest";

// Upstream spawned `bun src/index.ts`. There is no `node src/index.ts`, so the
// CLI is driven through the built bundle. turbo's `test dependsOn build`
// guarantees it; a bare `vitest run` will not, hence the guard below.
const PKG_ROOT = join(import.meta.dirname, "..", "..", "..");
const ENTRY = join(PKG_ROOT, "dist", "cli.js");
// `qa` is the namespace the upstream `gauntlet` bin collapsed into; see
// src/cli.ts.
const QA = "qa";
const HAVE_DIST = existsSync(ENTRY);
if (!HAVE_DIST) {
  console.error(
    `[skip] ${ENTRY} is missing — build first (\`pnpm --filter @bubstack/moe-flight build\`). ` +
      "These suites drive the shipped CLI, not the source tree.",
  );
}

function setupProject(): { dir: string; cardPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "moe-flight-spae-"));
  mkdirSync(join(dir, ".moe-flight", "context"), { recursive: true });
  writeFileSync(
    join(dir, ".moe-flight", "context", "HOW-TO-LOGIN.md"),
    "Use email and password.",
    "utf-8",
  );
  const cardPath = join(dir, "card.md");
  writeFileSync(
    cardPath,
    [
      "---",
      "id: spae-001",
      "title: Test card",
      "---",
      "",
      "## Acceptance Criteria",
      "- Logged in",
      "",
    ].join("\n"),
    "utf-8",
  );
  return { dir, cardPath };
}

describe.skipIf(!HAVE_DIST)("--show-prompt-and-exit", () => {
  test("exits 0 and prints all section headers", () => {
    const { dir, cardPath } = setupProject();
    try {
      const r = spawnSync(
        process.execPath,
        [
          ENTRY,
          QA,
          "run",
          cardPath,
          "--target",
          "http://x",
          "--project-dir",
          dir,
          "--show-prompt-and-exit",
        ],
        { encoding: "utf-8" },
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("Persona");
      expect(r.stdout).toContain("Scenario");
      expect(r.stdout).toContain("Evaluation");
      expect(r.stdout).toContain("Adapter (web)");
      expect(r.stdout).toContain("Project");
      expect(r.stdout).toContain("Context");
      expect(r.stdout).toContain("Tools");
      expect(r.stdout).toContain("Initial user message");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--project-prompt is included in the output", () => {
    const { dir, cardPath } = setupProject();
    const extra = join(dir, "extra.md");
    writeFileSync(extra, "PROJECT_AUGMENT_MARKER", "utf-8");
    try {
      const r = spawnSync(
        process.execPath,
        [
          ENTRY,
          QA,
          "run",
          cardPath,
          "--target",
          "http://x",
          "--project-dir",
          dir,
          "--project-prompt",
          extra,
          "--show-prompt-and-exit",
        ],
        { encoding: "utf-8" },
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("PROJECT_AUGMENT_MARKER");
      expect(r.stdout).toContain("(caller-supplied)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("absent Project shows (none)", () => {
    const { dir, cardPath } = setupProject();
    try {
      const r = spawnSync(
        process.execPath,
        [
          ENTRY,
          QA,
          "run",
          cardPath,
          "--target",
          "http://x",
          "--project-dir",
          dir,
          "--show-prompt-and-exit",
        ],
        { encoding: "utf-8" },
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/Project.*\(none\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("missing card argument exits non-zero", () => {
    const r = spawnSync(
      process.execPath,
      [ENTRY, QA, "run", "--target", "http://x", "--show-prompt-and-exit"],
      { encoding: "utf-8" },
    );
    expect(r.status).not.toBe(0);
  });
});
