import { describe, expect, it } from "vitest";
import { trustStateFromHooksList } from "../src/codex-hook-trust.js";
import { buildCodexDoctorReport } from "../src/doctor.js";

describe("Codex doctor report", () => {
  it("reports the production support floor, plugin hook state, MCP state, and log path", () => {
    const report = buildCodexDoctorReport({
      codexVersionOutput: "codex-cli 0.130.0",
      featuresOutput:
        "hooks stable true\nplugin_hooks under development true\nplugins stable true\n",
      mcpListOutput: "moe-memory  node  ./cli/mcp-server-wrapper.js  enabled",
      codexHome: "/tmp/codex-home",
      sessionsDirExists: true,
      logPath: "/tmp/moe-memory/logs/moe-memory.log",
      dbPath: "/tmp/moe-memory/conversation-index/db.sqlite",
      hookTrustState: "trusted",
    });

    expect(report.ok).toBe(true);
    expect(report.text).toContain("Codex version: codex-cli 0.130.0 (ok; minimum 0.130.0)");
    expect(report.text).toContain("Plugin hooks feature: enabled");
    expect(report.text).toContain("Moe Memory MCP: enabled");
    expect(report.text).toContain("Hook trust: trusted");
    expect(report.text).toContain("/tmp/moe-memory/logs/moe-memory.log");
  });

  it("does not tell users to trust hooks when the Moe Memory hook is already trusted", () => {
    const report = buildCodexDoctorReport({
      codexVersionOutput: "codex-cli 0.130.0",
      featuresOutput:
        "hooks stable true\nplugin_hooks under development true\nplugins stable true\n",
      mcpListOutput: "moe-memory  node  ./cli/mcp-server-wrapper.js  enabled",
      codexHome: "/tmp/codex-home",
      sessionsDirExists: true,
      logPath: "/tmp/moe-memory/logs/moe-memory.log",
      dbPath: "/tmp/moe-memory/conversation-index/db.sqlite",
      hookTrustState: "trusted",
    });

    expect(report.ok).toBe(true);
    expect(report.text).toContain("Hook trust: trusted");
    expect(report.text).not.toContain("/hooks");
  });

  it("tells users to trust hooks when the Moe Memory hook is untrusted", () => {
    const report = buildCodexDoctorReport({
      codexVersionOutput: "codex-cli 0.130.0",
      featuresOutput:
        "hooks stable true\nplugin_hooks under development true\nplugins stable true\n",
      mcpListOutput: "moe-memory  node  ./cli/mcp-server-wrapper.js  enabled",
      codexHome: "/tmp/codex-home",
      sessionsDirExists: true,
      logPath: "/tmp/moe-memory/logs/moe-memory.log",
      dbPath: "/tmp/moe-memory/conversation-index/db.sqlite",
      hookTrustState: "untrusted",
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain("Hook trust: untrusted");
    expect(report.text).toContain("/hooks");
  });

  it("fails when Codex is below the support floor", () => {
    const report = buildCodexDoctorReport({
      codexVersionOutput: "codex-cli 0.129.9",
      featuresOutput: "",
      mcpListOutput: "",
      codexHome: "/tmp/codex-home",
      sessionsDirExists: false,
      logPath: "/tmp/moe-memory/logs/moe-memory.log",
      dbPath: "/tmp/moe-memory/conversation-index/db.sqlite",
      hookTrustState: "trusted",
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain("minimum 0.130.0");
    expect(report.text).toContain("codex update");
  });

  it("reads Moe Memory hook trust from Codex hooks/list results", () => {
    expect(
      trustStateFromHooksList({
        data: [
          {
            hooks: [
              {
                pluginId: "moe-memory@moe",
                key: "moe-memory@moe:hooks/hooks.json:session_start:0:0",
                trustStatus: "trusted",
              },
            ],
          },
        ],
      }),
    ).toBe("trusted");

    expect(
      trustStateFromHooksList({
        data: [
          {
            hooks: [
              {
                pluginId: "moe-memory@moe",
                key: "moe-memory@moe:hooks/hooks.json:session_start:0:0",
                trustStatus: "untrusted",
              },
            ],
          },
        ],
      }),
    ).toBe("untrusted");

    expect(
      trustStateFromHooksList({
        data: [
          {
            hooks: [
              {
                pluginId: "moe-memory@moe",
                key: "moe-memory@moe:hooks/hooks.json:session_start:0:0",
                trustStatus: "modified",
              },
            ],
          },
        ],
      }),
    ).toBe("modified");
  });
});
