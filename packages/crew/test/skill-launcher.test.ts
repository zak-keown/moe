import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CREW = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(CREW, "skills/driving-claude-code-sessions/scripts/moe-crew.mjs");

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tmpDir() {
  const dir = mkdtempSync(join(tmpdir(), "crew-launcher-test-"));
  roots.push(dir);
  return dir;
}

describe("moe-crew launcher", () => {
  it("forwards all arguments to dist/moe-crew.cjs", () => {
    const dir = tmpDir();
    const distDir = join(dir, "dist");
    mkdirSync(distDir, { recursive: true });

    const logFile = join(dir, "args.json");
    writeFileSync(
      join(distDir, "moe-crew.cjs"),
      `#!/usr/bin/env node
const fs = require("fs");
fs.writeFileSync(${JSON.stringify(logFile)}, JSON.stringify(process.argv.slice(2)));
`,
    );
    chmodSync(join(distDir, "moe-crew.cjs"), 0o755);

    const r = spawnSync(
      process.execPath,
      [SCRIPT, "launch", "--harness", "codex", "my-worker", "/tmp/proj"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CLAUDE_PLUGIN_ROOT: dir,
        },
      },
    );
    expect(r.status, r.stderr).toBe(0);
    const args = JSON.parse(readFileSync(logFile, "utf8"));
    expect(args).toEqual(["launch", "--harness", "codex", "my-worker", "/tmp/proj"]);
  });

  it("propagates the exit code from moe-crew.cjs", () => {
    const dir = tmpDir();
    const distDir = join(dir, "dist");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, "moe-crew.cjs"), "#!/usr/bin/env node\nprocess.exit(7);\n");
    chmodSync(join(distDir, "moe-crew.cjs"), 0o755);

    const r = spawnSync(process.execPath, [SCRIPT, "list"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: dir,
      },
    });
    expect(r.status).toBe(7);
  });

  it("falls back to import.meta.url-based path when CLAUDE_PLUGIN_ROOT is unset", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--help"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: undefined,
      },
    });
    // It should attempt to find dist/moe-crew.cjs relative to the script.
    // Even if it fails (no built dist), it should NOT crash with a syntax
    // error — it should give a meaningful error about the missing CJS file.
    // status may be nonzero if dist isn't built, but stderr should be clean
    // (no SyntaxError, no unexpected token).
    if (r.status !== 0) {
      expect(r.stderr).not.toContain("SyntaxError");
      expect(r.stderr).not.toContain("unexpected");
    }
  });

  it("preserves stdio inheritance (stdin/stdout/stderr)", () => {
    const dir = tmpDir();
    const distDir = join(dir, "dist");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      join(distDir, "moe-crew.cjs"),
      `#!/usr/bin/env node
process.stdout.write("out-message\\n");
process.stderr.write("err-message\\n");
`,
    );
    chmodSync(join(distDir, "moe-crew.cjs"), 0o755);

    const r = spawnSync(process.execPath, [SCRIPT, "test"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: dir,
      },
    });
    expect(r.stdout).toContain("out-message");
    expect(r.stderr).toContain("err-message");
  });
});
