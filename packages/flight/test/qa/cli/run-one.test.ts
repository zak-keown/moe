import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runOne } from "../../../src/qa/cli/run-one.js";
import type { RunSetCtx } from "../../../src/qa/runs/run-set-types.js";
import { makeConfig } from "../helpers/make-config.js";
import { makeScriptedClient, report } from "../integration/helpers.js";

// Every root any test in this file has created via mkdtempSync, so afterEach
// can remove it — see CR-087. Deliberately never cleared (not even by
// afterEach): the last test asserts on it to confirm earlier roots were
// actually deleted from disk, not merely forgotten by this array.
const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const MINIMAL_CARD = `---
id: run-one-ctx-test
title: Minimal ctx test card
status: ready
---

A minimal card for runSetCtx threading tests.
`;

describe("runOne — runSetCtx threading", () => {
  test("runSetCtx is written into result.json when provided", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "moe-flight-runone-ctx-"));
    createdDirs.push(projectRoot);
    const cardPath = join(projectRoot, "card.md");
    writeFileSync(cardPath, MINIMAL_CARD);

    const ctx: RunSetCtx = {
      runSetId: "rset-test-001",
      kind: "batch",
      passes: 3,
      cards: ["run-one-ctx-test"],
      cardIndex: 0,
      attemptNumber: 1,
    };

    const client = makeScriptedClient([report("pass", "all good", "looked fine")]);

    const { outDir } = await runOne({
      scenarioPath: cardPath,
      target: "true",
      adapterType: "cli",
      config: makeConfig(projectRoot),
      runSetCtx: ctx,
      clientFactory: () => client,
    });

    const resultJson = JSON.parse(readFileSync(join(outDir, "result.json"), "utf-8"));
    expect(resultJson.runSet).toEqual(ctx);
  });

  test("runSet field is absent from result.json when runSetCtx is not provided", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "moe-flight-runone-noctx-"));
    createdDirs.push(projectRoot);
    const cardPath = join(projectRoot, "card.md");
    writeFileSync(cardPath, MINIMAL_CARD);

    const client = makeScriptedClient([report("pass", "all good", "looked fine")]);

    const { outDir } = await runOne({
      scenarioPath: cardPath,
      target: "true",
      adapterType: "cli",
      config: makeConfig(projectRoot),
      clientFactory: () => client,
    });

    const resultJson = JSON.parse(readFileSync(join(outDir, "result.json"), "utf-8"));
    expect(resultJson.runSet).toBeUndefined();
  });
});

describe("runOne", () => {
  test("propagates parseStoryCard errors and never calls onLogger when parse fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "moe-flight-runone-"));
    createdDirs.push(dir);
    const badCard = join(dir, "bad.md");
    writeFileSync(badCard, "this is not a valid story card");

    let onLoggerCalls = 0;
    await expect(
      runOne({
        scenarioPath: badCard,
        target: "noop",
        adapterType: "cli",
        config: makeConfig(dir),
        onLogger: () => {
          onLoggerCalls += 1;
          return () => {};
        },
      }),
    ).rejects.toBeDefined();

    expect(onLoggerCalls).toBe(0);
  });

  test("removes every earlier test's temp dir after each test finishes (CR-087)", () => {
    let leftoverFromPriorTest: string | undefined;
    for (const created of createdDirs) {
      if (existsSync(created)) leftoverFromPriorTest = created;
    }
    expect(leftoverFromPriorTest).toBeUndefined();
  });
});
