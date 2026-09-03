import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { fanoutRoutes } from "../../../src/qa/api/routes/fanout.js";
import type { LLMClient } from "../../../src/qa/models/provider.js";
import { flightPath } from "../../../src/qa/paths.js";
import { ErrorLog } from "../../../src/qa/util/error-log.js";

import { makeConfig } from "../helpers/make-config.js";

const STORY_MD = `---
id: story-001
title: Test story
status: draft
tags: core
---

A test story.

## Acceptance Criteria
- Something works
`;

function makeFakeClient(responseText: string): LLMClient {
  return {
    chat: async () => ({
      text: responseText,
      toolCalls: [],
      stopReason: "end_turn" as const,
      rawAssistantMessage: null,
      usage: { inputTokens: 0, outputTokens: 0 },
    }),
    userMessage: (content: string) => ({ role: "user", content }),
    toolResultMessages: () => [],
  };
}

const GENERATED_CARD_A = `---
id: story-001-a
title: Edge case empty input
status: draft
tags: core
parent: story-001
---

Tests empty input handling.

## Acceptance Criteria
- Handles empty input gracefully
`;

const GENERATED_CARD_B = `---
id: story-001-b
title: Error path network failure
status: draft
tags: core
parent: story-001
---

Tests network failure scenario.

## Acceptance Criteria
- Shows error message on network failure
`;

describe("Fanout API", () => {
  let projectRoot: string;
  let storiesDir: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "moe-flight-fanout-api-"));
    storiesDir = flightPath(projectRoot, ".moe-flight", "stories");
    mkdirSync(storiesDir, { recursive: true });
    writeFileSync(join(storiesDir, "story-001-test.md"), STORY_MD);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  test("POST /api/fanout/:id returns 404 for unknown scenario", async () => {
    const app = new Hono();
    app.route(
      "/api/fanout",
      fanoutRoutes(makeConfig(projectRoot), () => makeFakeClient("")),
    );

    const res = await app.request("/api/fanout/story-999", { method: "POST" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not found");
  });

  test("POST /api/fanout/:id returns 400 when fanout model not in allow-list", async () => {
    const app = new Hono();
    const config = makeConfig(projectRoot, {
      models: {
        agent: "claude-sonnet-4-6",
        fanout: "claude-opus-4-6",
        available: ["claude-sonnet-4-6"],
      },
    });
    app.route("/api/fanout", fanoutRoutes(config));

    const res = await app.request("/api/fanout/story-001", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("allow-list");
    expect(body.error).toContain("claude-opus-4-6");
  });

  test("POST /api/fanout/:id generates cards and writes to stories dir", async () => {
    const responseText = `${GENERATED_CARD_A}---CARD---${GENERATED_CARD_B}`;
    const client = makeFakeClient(responseText);

    const app = new Hono();
    app.route(
      "/api/fanout",
      fanoutRoutes(makeConfig(projectRoot), () => client),
    );

    const res = await app.request("/api/fanout/story-001", { method: "POST" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.parent).toBe("story-001");
    expect(body.generated).toHaveLength(2);
    expect(body.generated[0].id).toBe("story-001-a");
    expect(body.generated[1].id).toBe("story-001-b");

    // Verify files were written to disk
    const files = readdirSync(storiesDir).sort();
    expect(files).toContain("story-001-a.md");
    expect(files).toContain("story-001-b.md");

    const contentA = readFileSync(join(storiesDir, "story-001-a.md"), "utf-8");
    expect(contentA).toContain("Edge case empty input");
  });

  // CR-040/CR-042: writeCards joined an LLM-supplied `card.id` straight
  // into a filename under storiesDir with no charset or containment
  // check. A card whose frontmatter `id` is a traversal sequence writes
  // attacker-controlled content outside the stories directory — reachable
  // via indirect prompt injection, since the fanout prompts interpolate
  // the agent's own observation/summary text. Three ".." segments from
  // storiesDir (<projectRoot>/.moe-flight/stories) land exactly at
  // os.tmpdir(), matching the review's own repro depth.
  test("CR-040/CR-042: a traversal card id never writes outside the stories directory", async () => {
    const MALICIOUS_CARD = `---
id: ../../../pwned
title: Malicious
status: draft
tags: core
parent: story-001
---

malicious content
`;
    const client = makeFakeClient(MALICIOUS_CARD);
    const errorLog = new ErrorLog();
    const app = new Hono();
    app.route(
      "/api/fanout",
      fanoutRoutes(makeConfig(projectRoot), () => client, errorLog),
    );

    const escapeTarget = join(tmpdir(), "pwned.md");
    try {
      const res = await app.request("/api/fanout/story-001", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.generated).toHaveLength(0);
      expect(existsSync(escapeTarget)).toBe(false);
      expect(readdirSync(storiesDir)).not.toContain("../../../pwned.md");
      expect(errorLog.entries().some((e) => e.message.includes("../../../pwned"))).toBe(true);
    } finally {
      rmSync(escapeTarget, { force: true });
    }
  });
});

// --- Observation promotion tests ---

const OBS_CARD_A = `---
id: test-001-obs-1
title: Fix submit button
status: draft
tags: observation
parent: test-001
---

Submit button is unresponsive.

## Acceptance Criteria
- Button responds to clicks
`;

const OBS_CARD_B = `---
id: test-001-obs-2
title: Improve contrast
status: draft
tags: observation
parent: test-001
---

Low contrast text.

## Acceptance Criteria
- Text meets WCAG AA
`;

const FAIL_CARD_A = `---
id: test-002-fail-1
title: Investigate login crash
status: draft
tags: failure-analysis
parent: test-002
---

Login crashes on submit.

## Acceptance Criteria
- Login completes without error
`;

const FAIL_CARD_B = `---
id: test-002-fail-2
title: Verify fix under load
status: draft
tags: failure-analysis
parent: test-002
---

Re-test after fix.

## Acceptance Criteria
- Login works under concurrent load
`;

describe("Fanout observations API", () => {
  let projectRoot: string;
  let storiesDir: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "moe-flight-fanout-obs-"));
    storiesDir = flightPath(projectRoot, ".moe-flight", "stories");
    mkdirSync(storiesDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  test("POST /api/fanout/:id/observations promotes observations to story cards", async () => {
    const runId = "test-001_20260416T142301Z_k3xm";
    const resultsDir = flightPath(projectRoot, ".moe-flight", "results", runId);
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(
      join(resultsDir, "result.json"),
      JSON.stringify({
        runId,
        scenario: "test-001",
        status: "pass",
        summary: "Passed with observations",
        reasoning: "All good but noted issues",
        observations: [
          { kind: "bug", description: "Submit button unresponsive" },
          { kind: "a11y", description: "Low contrast text" },
        ],
        evidence: { screenshots: [], log: "run.jsonl" },
        duration_ms: 1000,
      }),
    );

    const responseText = `${OBS_CARD_A}---CARD---${OBS_CARD_B}`;
    const app = new Hono();
    app.route(
      "/api/fanout",
      fanoutRoutes(makeConfig(projectRoot), () => makeFakeClient(responseText)),
    );

    const res = await app.request(`/api/fanout/${runId}/observations`, { method: "POST" });
    expect(res.status).toBe(200);

    const body = await res.json();
    // parent is the cardId (for linking fanout children to their source card),
    // runId is the run provenance.
    expect(body.parent).toBe("test-001");
    expect(body.runId).toBe(runId);
    expect(body.generated).toHaveLength(2);
    expect(body.generated[0].id).toBe("test-001-obs-1");
    expect(body.generated[1].id).toBe("test-001-obs-2");

    // Filenames come from the generated card's id (not a letter-suffix scheme).
    const files = readdirSync(storiesDir).sort();
    expect(files).toContain("test-001-obs-1.md");
    expect(files).toContain("test-001-obs-2.md");
  });

  test("POST /api/fanout/:id/observations returns empty generated when no observations", async () => {
    const runId = "test-noobs_20260416T142301Z_q9x2";
    const resultsDir = flightPath(projectRoot, ".moe-flight", "results", runId);
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(
      join(resultsDir, "result.json"),
      JSON.stringify({
        runId,
        scenario: "test-noobs",
        status: "pass",
        summary: "Clean pass",
        reasoning: "Nothing observed",
        observations: [],
        evidence: { screenshots: [], log: "run.jsonl" },
        duration_ms: 500,
      }),
    );

    const app = new Hono();
    app.route(
      "/api/fanout",
      fanoutRoutes(makeConfig(projectRoot), () => makeFakeClient("")),
    );

    const res = await app.request(`/api/fanout/${runId}/observations`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.parent).toBe("test-noobs");
    expect(body.runId).toBe(runId);
    expect(body.generated).toEqual([]);
  });

  test("POST /api/fanout/:id/observations returns 404 when no result exists", async () => {
    const app = new Hono();
    app.route(
      "/api/fanout",
      fanoutRoutes(makeConfig(projectRoot), () => makeFakeClient("")),
    );

    const res = await app.request("/api/fanout/nonexistent/observations", { method: "POST" });
    expect(res.status).toBe(404);
  });

  test("POST /api/fanout/:id/:mode returns 404 for unknown mode", async () => {
    const app = new Hono();
    app.route(
      "/api/fanout",
      fanoutRoutes(makeConfig(projectRoot), () => makeFakeClient("")),
    );

    const res = await app.request("/api/fanout/anything/bogus", { method: "POST" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("unknown mode");
  });
});

describe("Fanout failure API", () => {
  let projectRoot: string;
  let storiesDir: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "moe-flight-fanout-fail-"));
    storiesDir = flightPath(projectRoot, ".moe-flight", "stories");
    mkdirSync(storiesDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  test("POST /api/fanout/:id/failure generates follow-up stories from a failed run", async () => {
    const runId = "test-002_20260416T142301Z_f7v1";
    const resultsDir = flightPath(projectRoot, ".moe-flight", "results", runId);
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(
      join(resultsDir, "result.json"),
      JSON.stringify({
        runId,
        scenario: "test-002",
        status: "fail",
        summary: "Login crashed",
        reasoning: "Button handler threw exception",
        observations: [],
        evidence: { screenshots: [], log: "run.jsonl" },
        duration_ms: 2000,
      }),
    );

    const responseText = `${FAIL_CARD_A}---CARD---${FAIL_CARD_B}`;
    const app = new Hono();
    app.route(
      "/api/fanout",
      fanoutRoutes(makeConfig(projectRoot), () => makeFakeClient(responseText)),
    );

    const res = await app.request(`/api/fanout/${runId}/failure`, { method: "POST" });
    expect(res.status).toBe(200);

    const body = await res.json();
    // parent is the cardId; runId is returned for provenance.
    expect(body.parent).toBe("test-002");
    expect(body.runId).toBe(runId);
    expect(body.generated).toHaveLength(2);
    expect(body.generated[0].id).toBe("test-002-fail-1");
    expect(body.generated[1].id).toBe("test-002-fail-2");

    // Filenames come from the generated card's id (not a letter-suffix scheme).
    const files = readdirSync(storiesDir).sort();
    expect(files).toContain("test-002-fail-1.md");
    expect(files).toContain("test-002-fail-2.md");
  });

  test("POST /api/fanout/:id/failure returns 400 when result is not a failure", async () => {
    const runId = "test-003_20260416T142301Z_p2xq";
    const resultsDir = flightPath(projectRoot, ".moe-flight", "results", runId);
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(
      join(resultsDir, "result.json"),
      JSON.stringify({
        runId,
        scenario: "test-003",
        status: "pass",
        summary: "All good",
        reasoning: "Everything works",
        observations: [],
        evidence: { screenshots: [], log: "run.jsonl" },
        duration_ms: 500,
      }),
    );

    const app = new Hono();
    app.route(
      "/api/fanout",
      fanoutRoutes(makeConfig(projectRoot), () => makeFakeClient("")),
    );

    const res = await app.request(`/api/fanout/${runId}/failure`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not a failure");
  });

  // CR-041: the /:id/:mode route composed the raw `id` param straight into
  // a results/<runId>/result.json path with no containment check. Percent-
  // encoded slashes reach c.req.param intact even though the Hono router
  // blocks raw "../" in the URL, so this is reachable over HTTP. A
  // result.json OUTSIDE the results tree, with status "pass" rather than
  // "fail", makes a successful read distinguishable from "not found":
  // pre-fix, the preflight check runs against the outside file's real
  // content and returns 400 "result is not a failure"; post-fix, the
  // traversal-shaped id must never resolve at all.
  test("CR-041: a traversal-shaped id never reaches an outside result.json", async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "moe-flight-fanout-outside-"));
    writeFileSync(
      join(outsideDir, "result.json"),
      JSON.stringify({
        runId: "outside",
        scenario: "outside-card",
        status: "pass",
        summary: "should never be read",
        reasoning: "should never be read",
        observations: [],
        evidence: { screenshots: [], log: "run.jsonl" },
        duration_ms: 1,
      }),
    );

    try {
      const app = new Hono();
      app.route(
        "/api/fanout",
        fanoutRoutes(makeConfig(projectRoot), () => makeFakeClient("")),
      );

      // Exactly 3 percent-encoded ".." segments — <projectRoot>/.moe-flight/
      // results/<id> is 3 levels below projectRoot's parent, which is where
      // outsideDir (a sibling temp dir) lives.
      const traversal = `..%2f..%2f..%2f${outsideDir.split("/").pop()}`;
      const res = await app.request(`/api/fanout/${traversal}/failure`, { method: "POST" });
      expect(res.status).toBe(404);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
