import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// biome-ignore format: TypeScript's next-line suppression must cover this import.
// @ts-expect-error — plain ESM production helper.
import { CODEX_SCHEMA_DECODERS, classifyCodexActiveRules, codexDestination, codexRuleDirectories, collapseCodexRoots, decodeCodexLine, readCodexConfigLayers, readCodexSessions } from "../skills/smooth-experience/scripts/lib/harnesses/codex.mjs";

const itemCompletedFixture = fileURLToPath(
  new URL("fixtures/smoothing-the-experience/codex/item-completed.jsonl", import.meta.url),
);
const legacyFixture = fileURLToPath(
  new URL("fixtures/smoothing-the-experience/codex/legacy-function-call.jsonl", import.meta.url),
);

const readerOptions = {
  cutoffMs: Date.parse("2026-08-04T00:00:00Z"),
  resolveProjectRoot: async () => "/fixture/repo-a",
};

describe("Codex rollout decoding", () => {
  it("decodes supported rollout schemas and removes output", async () => {
    const result = await readCodexSessions({
      files: [itemCompletedFixture],
      ...readerOptions,
      existingPrefixes: [],
    });
    expect(result.evidence[0]).toMatchObject({
      harness: "codex",
      class: "shell",
      outcome: "success",
      sourceSchema: "codex-item-completed-v1",
      operation: { command: "git status" },
    });
    expect(JSON.stringify(result)).not.toContain("discard");
  });

  it("marks matching approved prefixes existing-rule and does not infer explicit approval", async () => {
    const result = await readCodexSessions({
      files: [itemCompletedFixture],
      ...readerOptions,
      existingPrefixes: [["git", "status"]],
    });
    expect(result.evidence[0].approvalProvenance).toBe("existing-rule");
  });

  it("does not retroactively apply a later world-state prefix", async () => {
    const file = await writeTemporaryFixture(
      [
        codexMeta("root-a", "2026-09-01T12:00:00.000Z"),
        codexCommand("2026-09-01T12:00:01.000Z"),
        codexWorldState("2026-09-01T12:00:02.000Z", ["git", "status"]),
      ].join("\n"),
    );
    const result = await readCodexSessions({
      files: [file],
      ...readerOptions,
      existingPrefixes: [],
    });
    expect(result.evidence[0].approvalProvenance).toBe("unknown");
  });

  it("does not apply a different root session's approved prefix", async () => {
    const evidenceFile = await writeTemporaryFixture(
      [
        codexMeta("root-a", "2026-09-01T12:00:00.000Z"),
        codexCommand("2026-09-01T12:00:02.000Z"),
      ].join("\n"),
    );
    const prefixFile = await writeTemporaryFixture(
      [
        codexMeta("root-b", "2026-09-01T12:00:00.000Z"),
        codexWorldState("2026-09-01T12:00:01.000Z", ["git", "status"]),
      ].join("\n"),
    );
    const result = await readCodexSessions({
      files: [evidenceFile, prefixFile],
      ...readerOptions,
      existingPrefixes: [],
    });
    expect(result.evidence[0].approvalProvenance).toBe("unknown");
  });

  it("uses a matching prefix already captured for the same root session", async () => {
    const file = await writeTemporaryFixture(
      [
        codexMeta("root-a", "2026-09-01T12:00:00.000Z"),
        codexWorldState("2026-09-01T12:00:01.000Z", ["git", "status"]),
        codexCommand("2026-09-01T12:00:02.000Z"),
      ].join("\n"),
    );
    const result = await readCodexSessions({
      files: [file],
      ...readerOptions,
      existingPrefixes: [],
    });
    expect(result.evidence[0].approvalProvenance).toBe("existing-rule");
  });

  it("decodes structural legacy shell, filesystem, network, and MCP records without output", async () => {
    const result = await readCodexSessions({
      files: [legacyFixture],
      ...readerOptions,
      existingPrefixes: [],
    });
    expect(result.evidence.map((entry: { class: string }) => entry.class)).toEqual([
      "shell",
      "shell",
      "filesystem",
      "network",
      "mcp",
    ]);
    expect(result.evidence[3].operation).toEqual({ hostname: "api.example.invalid" });
    expect(JSON.stringify(result)).not.toContain("discard");
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("filters by each record timestamp and retains diagnostics without making unknown shapes evidence", async () => {
    const oldRow = JSON.stringify({
      timestamp: "2026-08-03T23:59:59.000Z",
      type: "event_msg",
      payload: {
        type: "item_completed",
        item: { type: "CommandExecution", command: ["git", "status"] },
      },
    });
    const currentRows = await readFile(itemCompletedFixture, "utf8");
    const file = await writeTemporaryFixture(`${oldRow}\n${currentRows}`);
    const result = await readCodexSessions({
      files: [file],
      ...readerOptions,
      existingPrefixes: [],
    });
    expect(result.evidence).toHaveLength(1);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ cliVersion: "0.153.0" }));
  });

  it("collapses child thread headers and only exposes recognized decoders", () => {
    expect(
      collapseCodexRoots([
        { id: "root", parentId: null },
        { id: "child", parentId: "root" },
        { id: "grandchild", parentId: "child" },
      ]),
    ).toEqual(
      new Map([
        ["root", "root"],
        ["child", "root"],
        ["grandchild", "root"],
      ]),
    );
    expect(CODEX_SCHEMA_DECODERS.map((decoder: { name: string }) => decoder.name)).toEqual([
      "codex-item-completed-v1",
      "codex-function-call-v1",
      "codex-local-shell-call-v1",
    ]);
    expect(decodeCodexLine({ type: "event_msg", payload: { type: "unknown" } }, {})).toBeNull();
  });

  it.each([
    [
      "a nonzero exit code over a completed status",
      { status: "completed", exit_code: 7 },
      "failed",
    ],
    ["a failed status over a zero exit code", { status: "failed", exit_code: 0 }, "failed"],
    [
      "an unknown status over a zero exit code",
      { status: "future-status", exit_code: 0 },
      "unknown",
    ],
    ["missing result fields", {}, "unknown"],
    ["an explicit completed status", { status: "completed" }, "success"],
    ["an explicit zero exit code", { exit_code: 0 }, "success"],
  ])("decodes %s without manufacturing success", (_label, result, expected) => {
    const state = { currentSession: { id: "root-a", cwd: "/fixture/repo-a" } };
    const event = decodeCodexLine(
      {
        timestamp: "2026-09-01T12:00:00.000Z",
        type: "event_msg",
        payload: {
          type: "item_completed",
          item: { type: "CommandExecution", command: ["git", "status"], ...result },
        },
      },
      state,
    );
    expect(event?.outcome).toBe(expected);
  });
});

describe("Codex App Server layer proof", () => {
  it("uses config/read layer details to prove a trusted project destination", async () => {
    const messages: Array<{ id?: number; method: string }> = [];
    const state = await readCodexConfigLayers({
      codexBin: "codex",
      cwd: "/fixture/repo-a",
      spawnProcess: fakeAppServer("ready", messages),
      timeoutMs: 100,
    });
    expect(
      messages.map(({ id, method }) => ({ ...(id === undefined ? {} : { id }), method })),
    ).toEqual([
      { id: 1, method: "initialize" },
      { method: "initialized" },
      { id: 2, method: "config/read" },
    ]);
    expect(state).toMatchObject({
      status: "available",
      layers: [
        {
          name: { type: "user", file: "/fixture/codex/config.toml", profile: null },
          version: CONFIG_VERSION,
          config: {},
        },
        {
          name: { type: "system", file: "/etc/codex/config.toml" },
          version: CONFIG_VERSION,
          config: {},
        },
        {
          name: { type: "project", dotCodexFolder: "/fixture/repo-a/.codex" },
          version: CONFIG_VERSION,
          config: {},
        },
      ],
    });
    expect(codexRuleDirectories(state)).toEqual([
      "/fixture/codex/rules",
      "/etc/codex/rules",
      "/fixture/repo-a/.codex/rules",
    ]);
    expect(
      codexDestination({
        scope: "project",
        codexHome: "/fixture/codex",
        projectRoot: "/fixture/repo-a",
        layerState: state,
      }),
    ).toEqual({
      path: "/fixture/repo-a/.codex/rules/moe-smoothing.rules",
      scope: "project",
      restartRequired: true,
    });
  });

  it("uses an enabled user layer for the global destination", async () => {
    const state = await readCodexConfigLayers({
      codexBin: "codex",
      cwd: "/fixture/repo-a",
      spawnProcess: fakeAppServer(),
      timeoutMs: 100,
    });
    expect(
      codexDestination({
        scope: "global",
        codexHome: "/fixture/codex",
        projectRoot: "/fixture/repo-a",
        layerState: state,
      }),
    ).toEqual({
      path: "/fixture/codex/rules/moe-smoothing.rules",
      scope: "global",
      restartRequired: true,
    });
  });

  it.each(["timeout", "malformed", "error"] as const)(
    "returns unavailable when config/read %s",
    async (mode) => {
      const state = await readCodexConfigLayers({
        codexBin: "codex",
        cwd: "/fixture/repo-a",
        spawnProcess: fakeAppServer(mode),
        timeoutMs: 20,
      });
      expect(state).toEqual({ status: "unavailable", layers: [] });
    },
  );

  it.each(["initialize-drift", "unknown-layer", "missing-version", "invalid-version"] as const)(
    "fails closed when the frozen App Server contract has %s",
    async (mode) => {
      const state = await readCodexConfigLayers({
        codexBin: "codex",
        cwd: "/fixture/repo-a",
        spawnProcess: fakeAppServer(mode),
        timeoutMs: 100,
      });
      expect(state).toEqual({ status: "unavailable", layers: [] });
    },
  );

  it("treats disabled project layers as untrusted", async () => {
    const state = await readCodexConfigLayers({
      codexBin: "codex",
      cwd: "/fixture/repo-a",
      spawnProcess: fakeAppServer("disabled-project"),
      timeoutMs: 100,
    });
    expect(state.status).toBe("available");
    expect(
      codexDestination({
        scope: "project",
        codexHome: "/fixture/codex",
        projectRoot: "/fixture/repo-a",
        layerState: state,
      }),
    ).toBeNull();
  });

  it("declines project rendering when config/read is unavailable or trust is unproven", () => {
    expect(
      codexDestination({
        scope: "project",
        codexHome: "/fixture/codex",
        projectRoot: "/fixture/repo-a",
        layerState: { status: "unavailable", layers: [] },
      }),
    ).toBeNull();
  });

  it.each([
    ["project", { trustedProjectRoots: ["/fixture/repo-a"] }],
    ["global", { userLayerEnabled: true }],
  ] as const)("does not trust forged %s layer-state flags", (scope, forgedState) => {
    expect(
      codexDestination({
        scope,
        codexHome: "/fixture/codex",
        projectRoot: "/fixture/repo-a",
        layerState: { status: "available", layers: [], ...forgedState },
      }),
    ).toBeNull();
  });

  it.each([
    [
      "project",
      {
        name: {
          type: "project",
          dotCodexFolder: "/fixture/repo-a/.codex",
          futureTrustFlag: true,
        },
      },
    ],
    ["global", { name: { type: "user" } }],
  ] as const)(
    "does not trust a malformed %s layer shaped around the discriminator",
    (scope, layer) => {
      expect(
        codexDestination({
          scope,
          codexHome: "/fixture/codex",
          projectRoot: "/fixture/repo-a",
          layerState: {
            status: "available",
            layers: [{ ...layer, version: CONFIG_VERSION, config: {}, disabledReason: null }],
          },
        }),
      ).toBeNull();
    },
  );
});

describe("Codex active rule classification", () => {
  const records = [
    codexEvidence("root-a", ["git", "status"]),
    codexEvidence("root-b", ["git", "diff"]),
    codexEvidence("root-c", ["git", "show"]),
    codexEvidence("root-d", ["git", "log"]),
  ];

  it("returns unchanged evidence without invoking execpolicy when no rules are active", async () => {
    const classified = await classifyCodexActiveRules({
      evidence: records,
      ruleFiles: [],
      runExecpolicy: async () => {
        throw new Error("must not run");
      },
    });
    expect(classified).toEqual(records);
  });

  it("suppresses every recognized native decision using all active rule files", async () => {
    const invocations: string[][] = [];
    const classified = await classifyCodexActiveRules({
      evidence: records,
      ruleFiles: ["/fixture/user.rules", "/fixture/project.rules"],
      codexBin: "codex",
      runExecpolicy: async (_bin: string, args: string[]) => {
        invocations.push(args);
        const command = args.at(-1);
        if (command === "log") return { matchedRules: [] };
        const decision =
          command === "status" ? "allow" : command === "diff" ? "prompt" : "forbidden";
        return {
          decision,
          matchedRules: [
            {
              prefixRuleMatch: {
                matchedPrefix: ["git", command],
                decision,
                justification: "pre-existing native rule",
              },
            },
          ],
        };
      },
    });
    expect(
      classified.map((record: { approvalProvenance: string }) => record.approvalProvenance),
    ).toEqual(["existing-rule", "existing-rule", "existing-rule", "unknown"]);
    expect(invocations).toHaveLength(4);
    expect(invocations[0]).toEqual([
      "execpolicy",
      "check",
      "--rules",
      "/fixture/user.rules",
      "--rules",
      "/fixture/project.rules",
      "--",
      "git",
      "status",
    ]);
  });

  it("fails the Codex classification closed on drift without mutating evidence", async () => {
    const original = structuredClone(records);
    await expect(
      classifyCodexActiveRules({
        evidence: records,
        ruleFiles: ["/fixture/user.rules"],
        runExecpolicy: async () => ({ futureDecision: "allow" }),
      }),
    ).rejects.toThrow(/unsupported execpolicy output/);
    expect(records).toEqual(original);
  });

  it("bounds injected execpolicy classification", async () => {
    await expect(
      classifyCodexActiveRules({
        evidence: records.slice(0, 1),
        ruleFiles: ["/fixture/user.rules"],
        timeoutMs: 10,
        runExecpolicy: async () => new Promise(() => {}),
      }),
    ).rejects.toThrow(/timed out/);
  });
});

function codexMeta(id: string, timestamp: string) {
  return JSON.stringify({
    timestamp,
    type: "session_meta",
    payload: { id, cwd: "/fixture/repo-a" },
  });
}

function codexCommand(timestamp: string) {
  return JSON.stringify({
    timestamp,
    type: "event_msg",
    payload: {
      type: "item_completed",
      item: { type: "CommandExecution", command: ["git", "status"], status: "completed" },
    },
  });
}

function codexWorldState(timestamp: string, prefix: string[]) {
  return JSON.stringify({
    timestamp,
    type: "world_state",
    payload: { state: { permissions: { approved_command_prefixes: [prefix] } } },
  });
}

async function writeTemporaryFixture(contents: string) {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "moe-codex-fixture-"));
  const file = join(directory, "rollout.jsonl");
  await writeFile(file, contents);
  return file;
}

const CONFIG_VERSION = `sha256:${"a".repeat(64)}`;

function codexEvidence(rootSessionId: string, argv: string[]) {
  return {
    harness: "codex",
    rootSessionId,
    projectRoot: "/fixture/repo-a",
    observedAt: "2026-09-01T12:00:00.000Z",
    class: "shell",
    operation: { argv },
    outcome: "success",
    approvalProvenance: "unknown",
    sourceSchema: "fixture-v1",
  };
}

type AppServerMode =
  | "ready"
  | "timeout"
  | "malformed"
  | "error"
  | "initialize-drift"
  | "unknown-layer"
  | "missing-version"
  | "invalid-version"
  | "disabled-project";

function fakeAppServer(
  mode: AppServerMode = "ready",
  messages: Array<{ id?: number; method: string }> = [],
) {
  return () => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: EventEmitter & { write: (message: string) => boolean };
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: () => boolean;
    };
    child.stdin = new EventEmitter() as EventEmitter & { write: (message: string) => boolean };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    let initialized = false;
    child.stdin.write = (message) => {
      const request = JSON.parse(message) as { id?: number; method: string };
      messages.push(request);
      if (request.method === "initialized") {
        initialized = true;
        return true;
      }
      queueMicrotask(() => {
        if (request.id === 1) {
          child.stdout.emit(
            "data",
            Buffer.from(
              `${JSON.stringify({ method: "event", params: {} })}\n${JSON.stringify({
                id: 1,
                result:
                  mode === "initialize-drift"
                    ? { protocolVersion: "1" }
                    : {
                        userAgent: "codex_cli_rs/0.1.0",
                        codexHome: "/fixture/codex",
                        platformFamily: "unix",
                        platformOs: "macos",
                      },
              })}\n`,
            ),
          );
          return;
        }
        if (!initialized) {
          child.stdout.emit(
            "data",
            Buffer.from('{"id":2,"error":{"message":"Not initialized"}}\n'),
          );
          return;
        }
        if (mode === "timeout") return;
        if (mode === "malformed") {
          child.stdout.emit("data", Buffer.from("not-json\n"));
          return;
        }
        if (mode === "error") {
          child.stdout.emit("data", Buffer.from('{"id":2,"error":{"message":"denied"}}\n'));
          return;
        }
        child.stdout.emit(
          "data",
          Buffer.from(`${JSON.stringify({ id: 2, result: configReadResult(mode) })}\n`),
        );
      });
      return true;
    };
    return child;
  };
}

function configReadResult(mode: AppServerMode) {
  const projectLayer: Record<string, unknown> = {
    name:
      mode === "unknown-layer"
        ? { type: "futureProject", dotCodexFolder: "/fixture/repo-a/.codex" }
        : { type: "project", dotCodexFolder: "/fixture/repo-a/.codex" },
    version: mode === "invalid-version" ? "1" : CONFIG_VERSION,
    config: {},
    ...(mode === "disabled-project" ? { disabledReason: "project is not trusted" } : {}),
  };
  if (mode === "missing-version") delete projectLayer.version;
  return {
    config: {},
    origins: {},
    layers: [
      {
        name: { type: "user", file: "/fixture/codex/config.toml", profile: null },
        version: CONFIG_VERSION,
        config: {},
      },
      {
        name: { type: "system", file: "/etc/codex/config.toml" },
        version: CONFIG_VERSION,
        config: {},
      },
      projectLayer,
    ],
  };
}
