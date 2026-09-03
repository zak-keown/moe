import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// biome-ignore format: TypeScript's next-line suppression must cover this import.
// @ts-expect-error — plain ESM production helper.
import { renderClaudeCandidate, renderClaudeSettings } from "../skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs";
// biome-ignore format: TypeScript's next-line suppression must cover this import.
// @ts-expect-error — plain ESM production helper.
import { inspectCodexDecision, renderCodexPermission, renderCodexRules, validateCodexReplacement } from "../skills/smoothing-the-experience/scripts/lib/harnesses/codex.mjs";
// biome-ignore format: TypeScript's next-line suppression must cover this import.
// @ts-expect-error — plain ESM production helper.
import { buildCandidates, candidateId, rankCandidates } from "../skills/smoothing-the-experience/scripts/lib/rank.mjs";

type EvidenceOverrides = Partial<{
  harness: "claude" | "codex";
  projectRoot: string;
  observedAt: string;
  class: "shell" | "filesystem" | "network" | "mcp";
  operation: Record<string, unknown>;
}>;

function evidence(
  rootSessionId: string,
  outcome: "success" | "denied" | "failed" | "unknown" = "success",
  approvalProvenance: "explicit" | "existing-rule" | "automatic" | "unknown" = "unknown",
  argv = ["git", "status"],
  overrides: EvidenceOverrides = {},
) {
  return {
    harness: "claude" as const,
    rootSessionId,
    projectRoot: "/fixture/repo-a",
    observedAt: "2026-09-01T12:00:00.000Z",
    class: "shell" as const,
    operation: { argv },
    outcome,
    approvalProvenance,
    sourceSchema: "fixture-v1",
    ...overrides,
  };
}

const fixtureContext = {
  all: true,
  realpath: async (path: string) => path,
  claude: {
    anchorProven: true,
    configDir: "/fixture/claude",
  },
  codex: {
    codexHome: "/fixture/codex",
    layerState: {
      status: "available",
      layers: [
        { scope: "user", enabled: true },
        {
          scope: "project",
          enabled: true,
          trusted: true,
          root: "/fixture/repo-a",
        },
      ],
    },
  },
};

describe("candidate eligibility and ranking", () => {
  it("requires two root sessions and suppresses denials and existing rules", async () => {
    const records = [
      evidence("root-a"),
      evidence("root-b", "success", "explicit"),
      evidence("root-a", "success", "unknown", ["git", "add", "src/index.ts"]),
      evidence("root-b", "success", "unknown", ["git", "add", "src/index.ts"]),
      evidence("root-c", "denied", "unknown", ["git", "add", "src/index.ts"]),
      evidence("root-a", "success", "unknown", ["git", "diff"]),
      evidence("root-b", "success", "unknown", ["git", "diff"]),
      evidence("root-d", "success", "existing-rule", ["git", "diff"]),
      evidence("root-only", "success", "unknown", ["git", "show"]),
    ];

    const report = await buildCandidates(records, fixtureContext);

    expect(report.suggestions.map((entry: { rule: string }) => entry.rule)).toEqual([
      "Bash(git status:*)",
    ]);
    expect(report.suggestions[0]).toMatchObject({
      scope: "project",
      rootSessionCount: 2,
      projectCount: 1,
      successfulObservationCount: 2,
      approvalProvenance: "explicit",
      confidence: "high",
    });
  });

  it("requires two projects for a global candidate and lets project scope win", async () => {
    const globalRecords = [
      evidence("root-a", "success", "unknown", ["git", "status"], {
        projectRoot: "/fixture/repo-a",
      }),
      evidence("root-b", "success", "unknown", ["git", "status"], {
        projectRoot: "/fixture/repo-b",
      }),
    ];
    const global = await buildCandidates(globalRecords, fixtureContext);
    expect(global.suggestions).toHaveLength(1);
    expect(global.suggestions[0]).toMatchObject({ scope: "global", projectCount: 2 });

    const oneProject = await buildCandidates(
      [globalRecords[0], evidence("root-c")],
      fixtureContext,
    );
    expect(oneProject.suggestions).toHaveLength(1);
    expect(oneProject.suggestions[0]).toMatchObject({ scope: "project", projectCount: 1 });
  });

  it("enforces ten total and five per class unless all is requested", () => {
    const candidates = [
      ...makeEligibleCandidates("shell", 8),
      ...makeEligibleCandidates("filesystem", 8),
    ];
    const ranked = rankCandidates(candidates, { all: false });
    expect(ranked).toHaveLength(10);
    expect(countByClass(ranked)).toEqual({ filesystem: 5, shell: 5 });
    expect(rankCandidates(candidates, { all: true })).toHaveLength(16);
  });

  it("uses the canonical permission body rather than ID decoration as the lexical tie-breaker", () => {
    const common = {
      harness: "codex",
      class: "shell",
      scope: "project",
      confidence: "medium",
      rootSessionCount: 2,
      projectCount: 1,
      successfulObservationCount: 2,
      lastSeen: "2026-09-01T12:00:00.000Z",
    };
    const ranked = rankCandidates(
      [
        {
          ...common,
          id: "shell-a",
          rule: '# moe-smoothing:shell-a\nprefix_rule(\n    pattern = ["git", "status"],\n)\n',
        },
        {
          ...common,
          id: "shell-z",
          rule: '# moe-smoothing:shell-z\nprefix_rule(\n    pattern = ["git", "add"],\n)\n',
        },
      ],
      { all: true },
    );
    expect(ranked.map((candidate: { id: string }) => candidate.id)).toEqual(["shell-z", "shell-a"]);
  });

  it("is deterministic across evidence order and never embeds session IDs or raw paths in IDs", async () => {
    const records = [
      evidence("root-a"),
      evidence("root-b", "success", "explicit", ["git", "status"], {
        observedAt: "2026-09-02T12:00:00.000Z",
      }),
      evidence("root-c", "success", "unknown", ["git", "add", "src/index.ts"]),
      evidence("root-d", "success", "unknown", ["git", "add", "src/index.ts"]),
    ];
    const forward = await buildCandidates(records, fixtureContext);
    const reverse = await buildCandidates([...records].reverse(), fixtureContext);
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
    for (const suggestion of forward.suggestions) {
      expect(suggestion.id).not.toContain("root-");
      expect(suggestion.id).not.toContain("/fixture/");
    }
    expect(candidateId({ ...forward.suggestions[0], rootSessionCount: 999 })).toBe(
      forward.suggestions[0].id,
    );
  });

  it("reports safe but unrenderable Codex evidence without exposing the operation", async () => {
    const records = [
      evidence("root-a", "success", "unknown", undefined, {
        harness: "codex",
        class: "filesystem",
        operation: { action: "read", path: "src/index.ts" },
      }),
      evidence("root-b", "success", "unknown", undefined, {
        harness: "codex",
        class: "filesystem",
        operation: { action: "read", path: "src/index.ts" },
      }),
    ];
    const report = await buildCandidates(records, {
      ...fixtureContext,
      codex: { ...fixtureContext.codex, anchorProven: true },
    });
    expect(report.suggestions).toEqual([]);
    expect(report.dispositions).toEqual([
      {
        harness: "codex",
        class: "filesystem",
        scope: "project",
        disposition: "no narrow renderer",
      },
    ]);
    expect(JSON.stringify(report.dispositions)).not.toContain("src/index.ts");
  });
});

describe("Claude rendering", () => {
  it.each([
    [
      { class: "filesystem", operation: { action: "read", path: "src/index.ts" } },
      "Read(src/index.ts)",
    ],
    [
      { class: "filesystem", operation: { action: "modify", path: "src/index.ts" } },
      "Edit(src/index.ts)",
    ],
    [
      { class: "network", operation: { hostname: "docs.example.invalid" } },
      "WebFetch(domain:docs.example.invalid)",
    ],
    [
      {
        class: "mcp",
        operation: {
          toolId: "mcp__plugin_moe-memory_moe-memory__search_conversations",
        },
      },
      "mcp__plugin_moe-memory_moe-memory__search_conversations",
    ],
  ])("renders the exact supported Claude rule", (candidate, rule) => {
    expect(
      renderClaudeCandidate(
        { harness: "claude", scope: "project", projectRoot: "/fixture/repo-a", ...candidate },
        {
          anchorProven: true,
          projectRoot: "/fixture/repo-a",
          configDir: "/fixture/claude",
        },
      ),
    ).toMatchObject({
      rule,
      destination: "/fixture/repo-a/.claude/settings.local.json",
      restartRequired: false,
    });
  });

  it("never emits Write, declines an unproven filesystem anchor, and uses the user destination globally", () => {
    const modifyCandidate = {
      harness: "claude",
      class: "filesystem",
      operation: { action: "modify", path: "src/index.ts" },
      scope: "project",
      projectRoot: "/fixture/repo-a",
    };
    expect(renderClaudeCandidate(modifyCandidate, { anchorProven: false })).toBeNull();
    expect(
      renderClaudeCandidate(
        {
          harness: "claude",
          class: "network",
          operation: { hostname: "docs.example.invalid" },
          scope: "global",
        },
        { configDir: "/fixture/claude" },
      ),
    ).toMatchObject({ destination: "/fixture/claude/settings.json" });
    expect(
      renderClaudeSettings('{"permissions":{"allow":[]},"unrelated":true}', ["Edit(src/index.ts)"]),
    ).not.toContain("Write(");
  });

  it("preserves unrelated settings and deduplicates existing semantic rules", () => {
    const rendered = renderClaudeSettings(
      JSON.stringify({
        permissions: { allow: ["Read(src/index.ts)"], ask: ["Bash(git push)"] },
        unrelated: { enabled: true },
      }),
      ["Read(src/index.ts)", "Edit(src/index.ts)", "Edit(src/index.ts)"],
    );
    expect(JSON.parse(rendered)).toEqual({
      permissions: {
        allow: ["Read(src/index.ts)", "Edit(src/index.ts)"],
        ask: ["Bash(git push)"],
      },
      unrelated: { enabled: true },
    });
    expect(rendered.endsWith("\n")).toBe(true);
    expect(() => renderClaudeSettings("not-json", ["Read(src/index.ts)"])).toThrow(
      /invalid Claude settings JSON/,
    );
  });
});

describe("Codex rendering and execpolicy validation", () => {
  const validRule = `# moe-smoothing:shell-abc
prefix_rule(
    pattern = ["git", "status"],
    decision = "allow",
    justification = "Moe smoothing: repeated safe use",
)
`;

  it("renders one lexical literal-only prefix block", () => {
    expect(
      renderCodexPermission({
        id: "shell-abc",
        class: "shell",
        operation: { argv: ["git", "status"] },
        scope: "project",
      })?.rule,
    ).toBe(validRule);
  });

  it("declines unproven project layers, global git add, and unsupported classes", () => {
    expect(
      renderCodexPermission({
        id: "shell-abc",
        harness: "codex",
        class: "shell",
        operation: { argv: ["git", "status"] },
        scope: "project",
        projectRoot: "/fixture/repo-a",
        codexHome: "/fixture/codex",
        layerState: { status: "unavailable", layers: [] },
      }),
    ).toBeNull();
    expect(
      renderCodexPermission({
        id: "shell-add",
        class: "shell",
        operation: { argv: ["git", "add", "src/index.ts"] },
        scope: "global",
      }),
    ).toBeNull();
    expect(
      renderCodexPermission({
        id: "filesystem-read",
        class: "filesystem",
        operation: { action: "read", path: "src/index.ts" },
        scope: "project",
      }),
    ).toBeNull();
  });

  it("sorts owned rule blocks lexically by stable ID and preserves unrelated rules", () => {
    const rendered = renderCodexRules("# user rule\n", [
      { id: "shell-z", rule: validRule.replaceAll("shell-abc", "shell-z") },
      { id: "shell-a", rule: validRule.replaceAll("shell-abc", "shell-a") },
    ]);
    expect(rendered).toBe(
      `# user rule\n\n${validRule.replaceAll("shell-abc", "shell-a")}\n${validRule.replaceAll("shell-abc", "shell-z")}`,
    );
  });

  it("fails closed when execpolicy output shape drifts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "moe-smoothing-render-"));
    await expect(
      validateCodexReplacement({
        contents: validRule,
        ruleFiles: [],
        witnesses: [["git", "status"]],
        codexBin: "codex",
        tempDir: directory,
        runExecpolicy: async () => ({ novel: true }),
      }),
    ).rejects.toThrow(/unsupported execpolicy output/);
    expect(await readdir(directory)).toEqual([]);
  });

  it("requires matching and adjacent non-matching witnesses against the complete active rules", async () => {
    const directory = await mkdtemp(join(tmpdir(), "moe-smoothing-render-"));
    const invocations: string[][] = [];
    await validateCodexReplacement({
      contents: validRule,
      ruleFiles: ["/fixture/existing.rules"],
      witnesses: [
        { argv: ["git", "status"], expectation: "match" },
        { argv: ["git", "push"], expectation: "not_match" },
      ],
      codexBin: "codex",
      tempDir: directory,
      runExecpolicy: async (_bin: string, args: string[]) => {
        invocations.push(args);
        const validationPath = args[args.lastIndexOf("--rules") + 1];
        expect(validationPath).toBeDefined();
        expect(await readFile(validationPath as string, "utf8")).toBe(validRule);
        return args.at(-1) === "status"
          ? {
              matchedRules: [
                {
                  prefixRuleMatch: {
                    matchedPrefix: ["git", "status"],
                    decision: "allow",
                    justification: "Moe smoothing: repeated safe use",
                  },
                },
              ],
              decision: "allow",
            }
          : { matchedRules: [] };
      },
    });
    expect(invocations).toHaveLength(2);
    expect(invocations[0]).toEqual([
      "execpolicy",
      "check",
      "--rules",
      "/fixture/existing.rules",
      "--rules",
      expect.stringMatching(/^.+\.rules$/),
      "--",
      "git",
      "status",
    ]);
    expect(await readdir(directory)).toEqual([]);
  });

  it("parses recognized execpolicy JSON and rejects non-JSON output", async () => {
    await expect(
      inspectCodexDecision({
        ruleFiles: ["/fixture/rules"],
        argv: ["git", "status"],
        codexBin: "codex",
        runExecpolicy: async () => ({ stdout: '{"matchedRules":[]}' }),
      }),
    ).resolves.toEqual({ decision: "not_match", matchedRules: [] });
    await expect(
      inspectCodexDecision({
        ruleFiles: ["/fixture/rules"],
        argv: ["git", "status"],
        codexBin: "codex",
        runExecpolicy: async () => ({ stdout: "not-json" }),
      }),
    ).rejects.toThrow(/unsupported execpolicy output/);
  });
});

function makeEligibleCandidates(className: "shell" | "filesystem", count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${className}-${index}`,
    harness: "claude",
    class: className,
    scope: "project",
    rule: `${className}-${String(index).padStart(2, "0")}`,
    confidence: "medium",
    rootSessionCount: 2,
    projectCount: 1,
    successfulObservationCount: 2,
    lastSeen: "2026-09-01T12:00:00.000Z",
  }));
}

function countByClass(candidates: Array<{ class: string }>) {
  return Object.fromEntries(
    [...new Set(candidates.map((candidate) => candidate.class))]
      .sort()
      .map((className) => [
        className,
        candidates.filter((candidate) => candidate.class === className).length,
      ]),
  );
}
