import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// biome-ignore format: TypeScript's next-line suppression must cover this import.
// @ts-expect-error — plain ESM production helper.
import { matchClaudePermission, renderClaudeCandidate, renderClaudeSettings } from "../skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs";
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
        {
          name: { type: "user", file: "/fixture/codex/config.toml", profile: null },
          version: `sha256:${"a".repeat(64)}`,
          config: {},
        },
        {
          name: { type: "project", dotCodexFolder: "/fixture/repo-a/.codex" },
          version: `sha256:${"b".repeat(64)}`,
          config: {},
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

  it("unions successful suffix variants that render to one shared authority", async () => {
    const report = await buildCandidates(
      [
        evidence("root-a", "success", "unknown", ["git", "status", "--short"]),
        evidence("root-b", "success", "explicit", ["git", "status", "--branch"]),
      ],
      fixtureContext,
    );

    expect(report.suggestions).toHaveLength(1);
    expect(report.suggestions[0]).toMatchObject({
      rule: "Bash(git status:*)",
      rootSessionCount: 2,
      successfulObservationCount: 2,
    });
    expect(new Set(report.suggestions.map((candidate: { id: string }) => candidate.id)).size).toBe(
      1,
    );
  });

  it("lets a denied suffix suppress the complete shared rendered authority", async () => {
    const report = await buildCandidates(
      [
        evidence("root-a", "success", "unknown", ["git", "status", "--short"]),
        evidence("root-b", "success", "explicit", ["git", "status", "--branch"]),
        evidence("root-c", "denied", "unknown", ["git", "status", "--porcelain"]),
      ],
      fixtureContext,
    );

    expect(report.suggestions).toEqual([]);
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

  it("uses locale-independent code-unit order before applying the per-class cap", () => {
    const rules = [
      "permission-a",
      "permission-b",
      "permission-c",
      "permission-d",
      "permission-ä",
      "permission-z",
    ];
    const ranked = rankCandidates(
      rules.map((rule) => ({
        id: rule,
        harness: "claude",
        class: "shell",
        scope: "project",
        rule,
        confidence: "medium",
        rootSessionCount: 2,
        projectCount: 1,
        successfulObservationCount: 2,
        lastSeen: "2026-09-01T12:00:00.000Z",
      })),
      { all: false },
    );

    expect(ranked.map((candidate: { rule: string }) => candidate.rule)).toEqual([
      "permission-a",
      "permission-b",
      "permission-c",
      "permission-d",
      "permission-z",
    ]);
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

  it("does not build a Codex suggestion without explicit proven layer state", async () => {
    const records = [
      evidence("root-a", "success", "unknown", ["git", "status"], { harness: "codex" }),
      evidence("root-b", "success", "unknown", ["git", "status", "--short"], {
        harness: "codex",
      }),
    ];
    const report = await buildCandidates(records, {
      ...fixtureContext,
      codex: { codexHome: "/fixture/codex" },
    });

    expect(report.suggestions).toEqual([]);
    expect(report.dispositions).toEqual([
      {
        harness: "codex",
        class: "shell",
        scope: "project",
        disposition: "no narrow renderer",
      },
    ]);
  });
});

describe("Claude rendering", () => {
  it("matches a rendered Bash suffix rule against both bare and argument-bearing commands", () => {
    expect(
      matchClaudePermission("Bash(git status:*)", { class: "shell", command: "git status" }, {}),
    ).toBe(true);
    expect(
      matchClaudePermission(
        "Bash(git status:*)",
        { class: "shell", command: "git status --short" },
        {},
      ),
    ).toBe(true);
    expect(
      matchClaudePermission(
        "Bash(git status:*)",
        { class: "shell", command: "git status-unsafe" },
        {},
      ),
    ).toBe(false);
    expect(
      matchClaudePermission("Bash(git add:*)", { class: "shell", command: "git add" }, {}),
    ).toBe(true);
    expect(
      matchClaudePermission(
        "Bash(git add:*)",
        { class: "shell", command: "git add src/index.ts" },
        {},
      ),
    ).toBe(true);
    expect(
      matchClaudePermission("Bash(git add:*)", { class: "shell", command: "git address" }, {}),
    ).toBe(false);
  });

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

  it.each(["allow", "deny", "ask"])("fails closed on malformed permissions.%s", (kind) => {
    expect(() =>
      renderClaudeSettings(JSON.stringify({ permissions: { [kind]: "not-an-array" } }), [
        "Read(src/index.ts)",
      ]),
    ).toThrow(new RegExp(`permissions\\.${kind} must contain strings`));
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
      renderCodexPermission(
        {
          id: "shell-abc",
          class: "shell",
          operation: { argv: ["git", "status"] },
          scope: "project",
          projectRoot: "/fixture/repo-a",
        },
        fixtureContext.codex,
      )?.rule,
    ).toBe(validRule);
  });

  it("declines a destination-bound rule without a stable candidate ID", () => {
    expect(
      renderCodexPermission(
        {
          class: "shell",
          operation: { argv: ["git", "status"] },
          scope: "project",
          projectRoot: "/fixture/repo-a",
        },
        fixtureContext.codex,
      ),
    ).toBeNull();
  });

  it("declines missing or unproven project layers, global git add, and unsupported classes", () => {
    expect(
      renderCodexPermission({
        id: "shell-missing",
        harness: "codex",
        class: "shell",
        operation: { argv: ["git", "status"] },
        scope: "project",
        projectRoot: "/fixture/repo-a",
      }),
    ).toBeNull();
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

  it("sorts Unicode stable IDs with locale-independent code-unit order", () => {
    const rendered = renderCodexRules("", [
      { id: "shell-ä", rule: validRule.replaceAll("shell-abc", "shell-ä") },
      { id: "shell-z", rule: validRule.replaceAll("shell-abc", "shell-z") },
    ]);
    expect(rendered.indexOf("shell-z")).toBeLessThan(rendered.indexOf("shell-ä"));
  });

  it("fails closed when execpolicy output shape drifts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "moe-smoothing-render-"));
    await expect(
      validateCodexReplacement({
        contents: validRule,
        ruleFiles: [],
        witnesses: [
          { ruleId: "shell-abc", argv: ["git", "status"], expectation: "match" },
          { ruleId: "shell-abc", argv: ["git", "push"], expectation: "not_match" },
        ],
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
        { ruleId: "shell-abc", argv: ["git", "status"], expectation: "match" },
        { ruleId: "shell-abc", argv: ["git", "push"], expectation: "not_match" },
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
    expect(invocations).toHaveLength(4);
    expect(invocations[0]).toEqual([
      "execpolicy",
      "check",
      "--rules",
      expect.stringMatching(/^.+\.rules$/),
      "--",
      "git",
      "status",
    ]);
    expect(invocations[2]).toEqual([
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

  it.each([
    ["positive-only", [{ ruleId: "shell-abc", argv: ["git", "status"], expectation: "match" }]],
    ["negative-only", [{ ruleId: "shell-abc", argv: ["git", "push"], expectation: "not_match" }]],
    [
      "unrelated-negative",
      [
        { ruleId: "shell-abc", argv: ["git", "status"], expectation: "match" },
        { ruleId: "shell-abc", argv: ["npm", "publish"], expectation: "not_match" },
      ],
    ],
  ])("rejects an incomplete %s witness set", async (_label, witnesses) => {
    const directory = await mkdtemp(join(tmpdir(), "moe-smoothing-render-"));
    await expect(
      validateCodexReplacement({
        contents: validRule,
        ruleFiles: [],
        witnesses,
        codexBin: "codex",
        tempDir: directory,
        runExecpolicy: async () => {
          throw new Error("must not run");
        },
      }),
    ).rejects.toThrow(/positive and adjacent negative witnesses/);
    expect(await readdir(directory)).toEqual([]);
  });

  it("does not let a broad existing allow mask a non-matching proposed rule", async () => {
    const directory = await mkdtemp(join(tmpdir(), "moe-smoothing-render-"));
    await expect(
      validateCodexReplacement({
        contents: validRule,
        ruleFiles: ["/fixture/broad-existing.rules"],
        witnesses: [
          { ruleId: "shell-abc", argv: ["git", "diff"], expectation: "match" },
          { ruleId: "shell-abc", argv: ["git", "push"], expectation: "not_match" },
        ],
        codexBin: "codex",
        tempDir: directory,
        runExecpolicy: async (_bin: string, args: string[]) =>
          args.includes("/fixture/broad-existing.rules")
            ? {
                matchedRules: [
                  {
                    prefixRuleMatch: {
                      matchedPrefix: ["git"],
                      decision: "allow",
                      justification: "broad existing rule",
                    },
                  },
                ],
                decision: "allow",
              }
            : { matchedRules: [] },
      }),
    ).rejects.toThrow(/positive witness did not match the proposed rule/);
    expect(await readdir(directory)).toEqual([]);
  });

  it("does not let a pre-existing allow inside the complete replacement mask the selected block", async () => {
    const directory = await mkdtemp(join(tmpdir(), "moe-smoothing-render-"));
    const preExistingRule = `prefix_rule(
    pattern = ["git", "diff"],
    decision = "allow",
    justification = "pre-existing rule",
)
`;
    await expect(
      validateCodexReplacement({
        contents: `${preExistingRule}\n${validRule}`,
        ruleFiles: [],
        witnesses: [
          { ruleId: "shell-abc", argv: ["git", "diff"], expectation: "match" },
          { ruleId: "shell-abc", argv: ["git", "push"], expectation: "not_match" },
        ],
        codexBin: "codex",
        tempDir: directory,
        runExecpolicy: async (_bin: string, args: string[]) => {
          const rulePath = args[args.lastIndexOf("--rules") + 1];
          const testedRules = await readFile(rulePath as string, "utf8");
          return args.at(-1) === "diff" && testedRules.includes('pattern = ["git", "diff"]')
            ? {
                matchedRules: [
                  {
                    prefixRuleMatch: {
                      matchedPrefix: ["git", "diff"],
                      decision: "allow",
                      justification: "pre-existing rule",
                    },
                  },
                ],
                decision: "allow",
              }
            : { matchedRules: [] };
        },
      }),
    ).rejects.toThrow(/positive witness did not match the proposed rule/);
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
