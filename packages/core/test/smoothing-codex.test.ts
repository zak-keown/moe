import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM production helper.
import {
  CODEX_SCHEMA_DECODERS,
  codexDestination,
  collapseCodexRoots,
  decodeCodexLine,
  readCodexConfigLayers,
  readCodexSessions,
} from "../skills/smoothing-the-experience/scripts/lib/harnesses/codex.mjs";

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
});

describe("Codex App Server layer proof", () => {
  it("uses config/read layer details to prove a trusted project destination", async () => {
    const state = await readCodexConfigLayers({
      codexBin: "codex",
      cwd: "/fixture/repo-a",
      spawnProcess: fakeAppServer(),
      timeoutMs: 100,
    });
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

  it.each(["timeout", "malformed", "error"])(
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
});

async function writeTemporaryFixture(contents: string) {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "moe-codex-fixture-"));
  const file = join(directory, "rollout.jsonl");
  await writeFile(file, contents);
  return file;
}

function fakeAppServer(mode: "ready" | "timeout" | "malformed" | "error" = "ready") {
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
    child.stdin.write = (message) => {
      const request = JSON.parse(message) as { id: number };
      queueMicrotask(() => {
        if (request.id === 1) {
          child.stdout.emit(
            "data",
            Buffer.from(
              '{"method":"event","params":{}}\n{"id":1,"result":{"protocolVersion":"1"}}\n',
            ),
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
          Buffer.from(
            '{"id":2,"result":{"layers":[{"scope":"user","enabled":true},{"scope":"project","root":"/fixture/repo-a","enabled":true,"trusted":true}]}}\n',
          ),
        );
      });
      return true;
    };
    return child;
  };
}
