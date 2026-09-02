// bin/test/moe.test.mjs — vitest for the `moe` dispatcher.
//
// resolve() is pure: sibling, PATH, workspace-fallback and the platform
// branches are all injected. main() is exercised through its opts too, so
// this test never actually spawns one of the seven namespace bins — every
// assertion runs against the resolver, not against a built dist bundle.

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main, NAMESPACES, resolve, USAGE } from "../moe.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function mktree() {
  return mkdtempSync(join(tmpdir(), "moe-bin-"));
}

function makeExec(dir, name) {
  const p = join(dir, name);
  writeFileSync(p, "#!/bin/sh\nexit 0\n");
  chmodSync(p, 0o755);
  return p;
}

function makeStream() {
  const chunks = [];
  return {
    write(c) {
      chunks.push(String(c));
      return true;
    },
    text: () => chunks.join(""),
  };
}

describe("resolve", () => {
  it("prefers a sibling bin over PATH", () => {
    const self = mktree();
    const pathDir = mktree();
    makeExec(self, "moe-crew");
    makeExec(pathDir, "moe-crew");
    const r = resolve("crew", [], {
      self,
      root: null,
      env: { PATH: pathDir },
      platform: "linux",
    });
    expect(r.source).toBe("sibling");
    expect(r.command).toBe(join(self, "moe-crew"));
  });

  it("falls through to PATH when no sibling is present", () => {
    const self = mktree();
    const pathDir = mktree();
    makeExec(pathDir, "moe-mint");
    const r = resolve("mint", [], {
      self,
      root: null,
      env: { PATH: pathDir },
      platform: "linux",
    });
    expect(r.source).toBe("path");
    expect(r.command).toBe(join(pathDir, "moe-mint"));
  });

  it("ignores a directory-shaped sibling and resolves the executable on PATH", () => {
    const self = mktree();
    const pathDir = mktree();
    mkdirSync(join(self, "moe-crew"));
    makeExec(pathDir, "moe-crew");

    const r = resolve("crew", [], {
      self,
      root: null,
      env: { PATH: pathDir },
      platform: "linux",
    });

    expect(r.source).toBe("path");
    expect(r.command).toBe(join(pathDir, "moe-crew"));
  });

  it("ignores a non-executable sibling on POSIX", () => {
    const self = mktree();
    const pathDir = mktree();
    writeFileSync(join(self, "moe-mint"), "not executable\n");
    makeExec(pathDir, "moe-mint");

    const r = resolve("mint", [], {
      self,
      root: null,
      env: { PATH: pathDir },
      platform: "linux",
    });

    expect(r.source).toBe("path");
    expect(r.command).toBe(join(pathDir, "moe-mint"));
  });

  it("falls through to the workspace bundle when sibling and PATH miss", () => {
    const self = mktree();
    const root = mktree();
    mkdirSync(join(root, "packages/crew/dist"), { recursive: true });
    writeFileSync(join(root, "packages/crew/dist/moe-crew.cjs"), "");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "");
    const r = resolve("crew", ["list"], {
      self,
      root,
      env: { PATH: "" },
      platform: "linux",
    });
    expect(r.source).toBe("workspace");
    expect(r.command).toBe(process.execPath);
    expect(r.args).toEqual([join(root, "packages/crew/dist/moe-crew.cjs"), "list"]);
  });

  it("does not pass a directory-shaped workspace bundle to Node", () => {
    const self = mktree();
    const root = mktree();
    mkdirSync(join(root, "packages/crew/dist/moe-crew.cjs"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "");

    const r = resolve("crew", [], {
      self,
      root,
      env: { PATH: "" },
      platform: "linux",
    });

    expect(r.missing).toBe(true);
  });

  it("proof workspace fallback goes through `uv run --project py/proof`", () => {
    const self = mktree();
    const root = mktree();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "");
    const r = resolve("proof", ["--foo"], {
      self,
      root,
      env: { PATH: "" },
      platform: "linux",
    });
    expect(r.source).toBe("workspace-uv");
    expect(r.command).toBe("uv");
    expect(r.args).toEqual(["run", "--project", join(root, "py/proof"), "moe-proof", "--foo"]);
  });

  it("tab workspace fallback picks moe-tab.exe on win32", () => {
    const self = mktree();
    const root = mktree();
    mkdirSync(join(root, "packages/tab/target/release"), { recursive: true });
    writeFileSync(join(root, "packages/tab/target/release/moe-tab.exe"), "");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "");
    const r = resolve("tab", [], {
      self,
      root,
      env: { PATH: "" },
      platform: "win32",
    });
    expect(r.source).toBe("workspace");
    expect(r.command).toBe(join(root, "packages/tab/target/release/moe-tab.exe"));
  });

  it("returns { missing } when nothing resolves", () => {
    const r = resolve("mint", [], {
      self: mktree(),
      root: null,
      env: { PATH: "" },
      platform: "linux",
    });
    expect(r.missing).toBe(true);
    expect(r.entry.bin).toBe("moe-mint");
  });

  it("returns { unknown } for a namespace not in the table", () => {
    const r = resolve("nonesuch", [], {
      self: mktree(),
      root: null,
      env: { PATH: "" },
      platform: "linux",
    });
    expect(r.unknown).toBe(true);
  });

  it("finds .cmd shims first on win32 (npm/pnpm cmd-shim shape)", () => {
    const self = mktree();
    writeFileSync(join(self, "moe-mint.cmd"), "@echo off\r\nexit /b 0\r\n");
    const r = resolve("mint", [], {
      self,
      root: null,
      env: { PATH: "" },
      platform: "win32",
    });
    expect(r.source).toBe("sibling");
    expect(r.command).toBe(join(self, "moe-mint.cmd"));
  });
});

describe("main", () => {
  it("bare invocation prints USAGE naming every namespace, exit 0", async () => {
    const stdout = makeStream();
    const stderr = makeStream();
    const code = await main([], {
      stdout,
      stderr,
      self: mktree(),
      root: null,
      env: { PATH: "" },
      platform: "linux",
      release: "",
    });
    expect(code).toBe(0);
    for (const ns of Object.keys(NAMESPACES)) {
      expect(stdout.text()).toContain(ns);
    }
  });

  it("--help prints the full USAGE block, exit 0", async () => {
    const stdout = makeStream();
    const code = await main(["--help"], {
      stdout,
      stderr: makeStream(),
      self: mktree(),
      root: null,
      env: { PATH: "" },
      platform: "linux",
      release: "",
    });
    expect(code).toBe(0);
    expect(stdout.text()).toBe(USAGE);
  });

  it("unknown namespace writes an error plus USAGE and exits non-zero", async () => {
    const stderr = makeStream();
    const code = await main(["nonesuch"], {
      stdout: makeStream(),
      stderr,
      self: mktree(),
      root: null,
      env: { PATH: "" },
      platform: "linux",
      release: "",
    });
    expect(code).not.toBe(0);
    expect(stderr.text()).toContain('unknown namespace "nonesuch"');
    expect(stderr.text()).toContain("crew");
  });

  it("absent namespace exits 127 naming the package and moe-install", async () => {
    const stderr = makeStream();
    const code = await main(["mint"], {
      stdout: makeStream(),
      stderr,
      self: mktree(),
      root: null,
      env: { PATH: "" },
      platform: "linux",
      release: "",
    });
    expect(code).toBe(127);
    expect(stderr.text()).toContain("@bubstack/moe-mint");
    expect(stderr.text()).toContain("moe-install");
  });

  it("refuses `moe crew` on bare Windows with the WSL2 message", async () => {
    const stderr = makeStream();
    const code = await main(["crew"], {
      stdout: makeStream(),
      stderr,
      self: mktree(),
      root: null,
      env: { PATH: "" },
      platform: "win32",
      release: "10.0.22631",
    });
    expect(code).toBe(2);
    expect(stderr.text()).toContain("WSL2");
    expect(stderr.text()).toContain("tmux");
  });

  it("under WSL (linux + microsoft-in-release) crew resolves normally", async () => {
    const self = mktree();
    makeExec(self, "moe-crew");
    let captured;
    const spawnMock = async (command, args) => {
      captured = { command, args };
      return 0;
    };
    const code = await main(["crew", "list"], {
      stdout: makeStream(),
      stderr: makeStream(),
      self,
      root: null,
      env: { PATH: "" },
      platform: "linux",
      release: "5.15.153.1-microsoft-standard-WSL2",
      spawn: spawnMock,
    });
    expect(code).toBe(0);
    expect(captured.command).toBe(join(self, "moe-crew"));
    expect(captured.args).toEqual(["list"]);
  });

  it("forwards positional args unchanged to the resolved bin", async () => {
    const self = mktree();
    makeExec(self, "moe-flight");
    let captured;
    const spawnMock = async (command, args) => {
      captured = { command, args };
      return 0;
    };
    const code = await main(["flight", "qa", "run", "story.md", "--verbose", "--"], {
      stdout: makeStream(),
      stderr: makeStream(),
      self,
      root: null,
      env: { PATH: "" },
      platform: "linux",
      release: "",
      spawn: spawnMock,
    });
    expect(code).toBe(0);
    expect(captured.args).toEqual(["qa", "run", "story.md", "--verbose", "--"]);
  });

  it("propagates the child's exit code", async () => {
    const self = mktree();
    makeExec(self, "moe-mint");
    const code = await main(["mint", "--nope"], {
      stdout: makeStream(),
      stderr: makeStream(),
      self,
      root: null,
      env: { PATH: "" },
      platform: "linux",
      release: "",
      spawn: async () => 42,
    });
    expect(code).toBe(42);
  });
});

describe("packaging invariants", () => {
  it("bin/moe.js opens with #!/usr/bin/env node", () => {
    const src = readFileSync(join(HERE, "..", "moe.js"), "utf8");
    expect(src.split("\n")[0]).toBe("#!/usr/bin/env node");
  });

  it("root package.json declares bin.moe → ./bin/moe.js", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.bin?.moe).toBe("./bin/moe.js");
  });

  it("namespace table has exactly the seven expected keys", () => {
    expect(Object.keys(NAMESPACES).sort()).toEqual([
      "crew",
      "flight",
      "glass",
      "memory",
      "mint",
      "proof",
      "tab",
    ]);
  });

  it("every namespace declares either a workspace path or a runner", () => {
    for (const [ns, entry] of Object.entries(NAMESPACES)) {
      expect(entry.bin).toBe(`moe-${ns}`);
      expect(entry.workspace || entry.runner).toBeTruthy();
    }
  });
});
