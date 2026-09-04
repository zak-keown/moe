import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CORE = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(CORE, "skills/systematic-debugging/scripts/find-polluter.mjs");

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tmpDir() {
  const dir = mkdtempSync(join(tmpdir(), "polluter-test-"));
  roots.push(dir);
  return dir;
}

describe("find-polluter", () => {
  it("exits 2 with usage when no arguments given", () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage:");
  });

  it("exits 2 when only one argument given", () => {
    const r = spawnSync(process.execPath, [SCRIPT, ".git"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage:");
  });

  it("reports no polluter when no test creates the artifact", () => {
    const dir = tmpDir();
    const src = join(dir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "a.test.ts"), "// harmless\n");
    writeFileSync(join(src, "b.test.ts"), "// also harmless\n");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "echo ran" } }));

    const r = spawnSync(process.execPath, [SCRIPT, ".pollution", "src/**/*.test.ts"], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("No polluter found");
  });

  it("identifies the polluting test and exits 1", () => {
    const dir = tmpDir();
    const src = join(dir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "clean.test.ts"), "// clean\n");
    writeFileSync(join(src, "dirty.test.ts"), "// dirty\n");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: {
          test: `node -e "const f=process.argv[1]; if(f.includes('dirty')) require('fs').mkdirSync('.pollution',{recursive:true})"`,
        },
      }),
    );

    const r = spawnSync(process.execPath, [SCRIPT, ".pollution", "src/**/*.test.ts"], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("FOUND POLLUTER");
    expect(r.stdout).toContain("dirty.test.ts");
  });

  it("warns when pollution already exists before a test", () => {
    const dir = tmpDir();
    const src = join(dir, "src");
    mkdirSync(src, { recursive: true });
    mkdirSync(join(dir, ".pollution"));
    writeFileSync(join(src, "a.test.ts"), "// test\n");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "echo ran" } }));

    const r = spawnSync(process.execPath, [SCRIPT, ".pollution", "src/**/*.test.ts"], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.stdout).toContain("already exists");
  });

  it("handles paths with spaces and metacharacters", () => {
    const dir = tmpDir();
    const src = join(dir, "src dir (1)");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "a.test.ts"), "// clean\n");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "echo ran" } }));

    const r = spawnSync(process.execPath, [SCRIPT, ".pollution", "src dir (1)/**/*.test.ts"], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status).toBe(0);
  });
});
