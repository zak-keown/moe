import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectInstalledHarnesses, getDriver } from "../src/harness/registry.js";
import { resolveHarness } from "../src/harness/resolver.js";

describe("resolveHarness", () => {
  it("uses the worker harness ahead of every default source", () => {
    expect(
      resolveHarness({
        worker: "pi",
        command: "codex",
        pack: "claude",
        environment: "codex",
        installed: ["claude"],
      }),
    ).toEqual({ ok: true, harness: "pi", source: "worker" });
  });

  it("uses command, pack, environment, then sole-installed precedence", () => {
    expect(
      resolveHarness({
        command: "codex",
        pack: "pi",
        environment: "claude",
        installed: ["claude"],
      }),
    ).toEqual({ ok: true, harness: "codex", source: "command" });
    expect(resolveHarness({ pack: "pi", environment: "claude", installed: ["codex"] })).toEqual({
      ok: true,
      harness: "pi",
      source: "pack",
    });
    expect(resolveHarness({ environment: "codex", installed: ["pi"] })).toEqual({
      ok: true,
      harness: "codex",
      source: "environment",
    });
    expect(resolveHarness({ installed: ["pi"] })).toEqual({
      ok: true,
      harness: "pi",
      source: "installed",
    });
  });

  it("rejects corrupt worker state instead of silently using a lower default", () => {
    const resolution = resolveHarness({
      worker: "not-a-harness",
      command: "claude",
      pack: "codex",
      environment: "pi",
      installed: ["claude"],
    });
    expect(resolution).toMatchObject({ ok: false, code: 2 });
    if (!resolution.ok) {
      expect(resolution.diagnostic).toContain("worker harness 'not-a-harness'");
      expect(resolution.diagnostic).toContain("claude, codex, pi");
    }
  });

  it("refuses an ambiguous installed set and lists only valid installed choices", () => {
    const resolution = resolveHarness({ installed: ["claude", "pi"] });
    expect(resolution).toMatchObject({ ok: false, code: 2 });
    if (!resolution.ok) {
      expect(resolution.diagnostic).toContain("multiple crew harnesses are installed");
      expect(resolution.diagnostic).toContain("claude, pi");
      expect(resolution.diagnostic).not.toContain("claude, codex, pi");
    }
  });

  it("reports that no supported harness is installed without guessing Claude", () => {
    const resolution = resolveHarness({ installed: [] });
    expect(resolution).toMatchObject({ ok: false, code: 2 });
    if (!resolution.ok) {
      expect(resolution.diagnostic).toContain("no supported crew harness is installed");
      expect(resolution.diagnostic).toContain("claude, codex, pi");
    }
  });
});

describe("detectInstalledHarnesses", () => {
  it("probes the actual configured executable for each registered harness", () => {
    const probed: string[] = [];
    const installed = detectInstalledHarnesses({
      environment: {
        MOE_CREW_CLAUDE_BIN: "/opt/agents/claude-custom",
        MOE_CREW_CODEX_BIN: "/opt/agents/codex-custom",
        MOE_CREW_PI_BIN: "/opt/agents/pi-custom",
      },
      isExecutable(executable) {
        probed.push(executable);
        return executable.endsWith("claude-custom") || executable.endsWith("pi-custom");
      },
    });

    expect(probed).toEqual([
      "/opt/agents/claude-custom",
      "/opt/agents/codex-custom",
      "/opt/agents/pi-custom",
    ]);
    expect(installed).toEqual(["claude", "pi"]);
  });

  it("normalizes empty binary overrides to each harness default", () => {
    const environment = {
      MOE_CREW_CLAUDE_BIN: "",
      MOE_CREW_CODEX_BIN: "",
      MOE_CREW_PI_BIN: "",
      PATH: "",
    };

    expect(["claude", "codex", "pi"].map((id) => getDriver(id).bin(environment))).toEqual([
      "claude",
      "codex",
      "pi",
    ]);
  });

  it("does not treat executable directories on PATH or in overrides as harness binaries", () => {
    const pathDir = mkdtempSync(join(tmpdir(), "moe-crew-bin-dir-"));
    const explicitDir = mkdtempSync(join(tmpdir(), "moe-crew-explicit-dir-"));
    try {
      mkdirSync(join(pathDir, "claude"));
      mkdirSync(join(pathDir, "pi"));

      expect(
        detectInstalledHarnesses({
          environment: {
            PATH: pathDir,
            MOE_CREW_CODEX_BIN: explicitDir,
          },
        }),
      ).toEqual([]);
    } finally {
      rmSync(pathDir, { recursive: true, force: true });
      rmSync(explicitDir, { recursive: true, force: true });
    }
  });
});
