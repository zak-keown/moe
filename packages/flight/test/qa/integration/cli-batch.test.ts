import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";

import { runBatch } from "../../../src/qa/cli/batch.js";
import { makeScriptedClient, report } from "./helpers.js";

// Cards: description and acceptanceCriteria come from the markdown body,
// not from frontmatter. We only need id + title in frontmatter to parse.
const STORY_A = `---
id: cli-batch-a
title: A passes
status: ready
---

stub
`;

const STORY_B = `---
id: cli-batch-b
title: B fails
status: ready
---

stub
`;

describe("moe-flight qa batch — e2e against CLI adapter", () => {
  let projectRoot: string;
  let pathA: string;
  let pathB: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "moe-flight-batch-e2e-"));
    pathA = join(projectRoot, "a.md");
    pathB = join(projectRoot, "b.md");
    writeFileSync(pathA, STORY_A);
    writeFileSync(pathB, STORY_B);
  });

  test("two cards: one pass, one fail; exit code 1; both evidence dirs created", async () => {
    const passClient = makeScriptedClient([report("pass", "ok", "")]);
    const failClient = makeScriptedClient([report("fail", "nope", "")]);

    let i = 0;
    const clients = [passClient, failClient];

    const sink = {
      out: "",
      write(s: string) {
        this.out += s;
      },
    };

    const exitCode = await runBatch({
      scenarioPaths: [pathA, pathB],
      target: "true",
      adapterType: "cli",
      config: {
        projectRoot,
        stateDirName: ".moe-flight",
        port: 4400,
        defaultChrome: { host: "127.0.0.1", port: 9222 },
        defaultBudgetMs: 300000,
        defaultMaxStuckRetries: 5,
        defaultViewport: { width: 1440, height: 900 },
        saveScreencast: false,
        models: { agent: "claude-sonnet-4-6", fanout: undefined },
        sources: { defaultChrome: "default" },
      } as any,
      silent: false,
      format: undefined,
      noColor: true,
      sink,
      isTTY: false,
      passes: 1,
      clientFactory: () => clients[i++],
    });

    expect(exitCode).toBe(1);
    expect(sink.out).toContain("done (pass)");
    expect(sink.out).toContain("done (fail)");
    expect(sink.out).toContain("batch: 1 pass · 1 fail");

    const resultsRoot = join(projectRoot, ".moe-flight", "results");
    expect(existsSync(resultsRoot)).toBe(true);
    // RunIds embed the batch cardId as their stem (`<cardId>_<ts>_<nonce>`).
    // The batch cardId is the file stem (basename without extension), not the
    // frontmatter id — the orchestrator generates runIds from the file stem
    // before parsing the card.
    const runDirs = readdirSync(resultsRoot);
    expect(runDirs.length).toBe(2);
    expect(runDirs.some((d) => d.startsWith("a_"))).toBe(true);
    expect(runDirs.some((d) => d.startsWith("b_"))).toBe(true);
  });
});
