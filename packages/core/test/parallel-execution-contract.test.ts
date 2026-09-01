import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

const skillPaths = [
  "core/skills/dispatching-parallel-agents/SKILL.md",
  "core/skills/writing-plans/SKILL.md",
  "core/skills/subagent-driven-development/SKILL.md",
  "core/skills/implementing-tasks/SKILL.md",
  "core/skills/using-git-worktrees/SKILL.md",
  "crew/skills/driving-claude-code-sessions/SKILL.md",
] as const;

const skills = new Map(skillPaths.map((path) => [path, readFileSync(resolve(ROOT, path), "utf8")]));

interface Task {
  files?: string[];
  interfaces?: {
    consumes?: string[];
    produces?: string[];
  };
}

interface Worktree {
  created: boolean;
  gitDir?: string;
  commonDir?: string;
}

type Execution = "worktree-isolated-parallel" | "sequential";

interface ValidTask {
  files: string[];
  interfaces: {
    consumes: string[];
    produces: string[];
  };
}

function validateTask(task: Task): asserts task is ValidTask {
  if (!task.files || task.files.length === 0) throw new Error("missing Files");
  if (!task.interfaces) throw new Error("missing Interfaces");
  if (!task.interfaces.consumes) throw new Error("missing Consumes");
  if (!task.interfaces.produces) throw new Error("missing Produces");
}

function chooseExecution(tasks: Task[], worktrees: Worktree[]): Execution {
  const validTasks = tasks.map((task) => {
    validateTask(task);
    return task;
  });

  const claimed = new Set<string>();
  for (const task of validTasks) {
    for (const file of task.files) {
      if (claimed.has(file)) return "sequential";
      claimed.add(file);
    }
  }

  for (const producer of validTasks) {
    for (const consumer of validTasks) {
      if (producer === consumer) continue;
      if (
        producer.interfaces.produces.some((name) => consumer.interfaces.consumes.includes(name))
      ) {
        return "sequential";
      }
    }
  }

  if (worktrees.length !== tasks.length) return "sequential";
  const gitDirs = new Set<string>();
  for (const worktree of worktrees) {
    if (
      !worktree.created ||
      !worktree.gitDir ||
      !worktree.commonDir ||
      worktree.gitDir === worktree.commonDir ||
      gitDirs.has(worktree.gitDir)
    ) {
      return "sequential";
    }
    gitDirs.add(worktree.gitDir);
  }

  return "worktree-isolated-parallel";
}

describe("parallel execution skill contract", () => {
  it("documents only the two safe implementation rungs", () => {
    const dispatcher = skills.get("core/skills/dispatching-parallel-agents/SKILL.md") as string;
    expect(dispatcher).toContain("exact two-rung ladder");
    expect(dispatcher).toContain("**Worktree-isolated parallel dispatch**");
    expect(dispatcher).toContain("**Sequential dispatch**");

    for (const [path, text] of skills) {
      expect(text, `${path} must state the two-rung contract`).toMatch(
        /two[- ]rung|exactly two (?:execution )?rungs/i,
      );
      expect(text, path).not.toContain("Parallel dispatch on disjoint files with no isolation");
    }
  });

  it("requires pairwise-unique linked Git directories at every dispatch boundary", () => {
    for (const path of [
      "core/skills/dispatching-parallel-agents/SKILL.md",
      "core/skills/writing-plans/SKILL.md",
      "core/skills/subagent-driven-development/SKILL.md",
      "core/skills/implementing-tasks/SKILL.md",
      "core/skills/using-git-worktrees/SKILL.md",
      "crew/skills/driving-claude-code-sessions/SKILL.md",
    ] as const) {
      expect(skills.get(path), path).toMatch(/pairwise[ -]unique linked Git director(?:y|ies)/i);
    }
  });

  it("makes all four task metadata fields mandatory at authoring and execution", () => {
    for (const path of [
      "core/skills/writing-plans/SKILL.md",
      "core/skills/subagent-driven-development/SKILL.md",
      "core/skills/implementing-tasks/SKILL.md",
      "crew/skills/driving-claude-code-sessions/SKILL.md",
    ] as const) {
      const text = skills.get(path) as string;
      for (const field of ["Files:", "Interfaces:", "Consumes:", "Produces:"]) {
        expect(text, `${path} must name ${field}`).toContain(field);
      }
      expect(text, `${path} must fail malformed input`).toMatch(
        /fails? (?:plan |batch )?validation/i,
      );
    }
  });

  it.each([
    ["Files", { interfaces: { consumes: [], produces: [] } }],
    ["Interfaces", { files: ["src/a.ts"] }],
    ["Consumes", { files: ["src/a.ts"], interfaces: { produces: [] } }],
    ["Produces", { files: ["src/a.ts"], interfaces: { consumes: [] } }],
  ])("rejects a pressure fixture missing %s", (field, task) => {
    expect(() => chooseExecution([task], [])).toThrow(`missing ${field}`);
  });

  it("runs independent pressure-fixture tasks in isolated parallel worktrees", () => {
    const tasks: Task[] = [
      { files: ["src/a.ts"], interfaces: { consumes: [], produces: ["A"] } },
      { files: ["src/b.ts"], interfaces: { consumes: [], produces: ["B"] } },
      { files: ["src/c.ts"], interfaces: { consumes: [], produces: ["C"] } },
    ];
    const worktrees: Worktree[] = ["a", "b", "c"].map((name) => ({
      created: true,
      gitDir: `/repo/.git/worktrees/${name}`,
      commonDir: "/repo/.git",
    }));

    expect(chooseExecution(tasks, worktrees)).toBe("worktree-isolated-parallel");
  });

  it("falls the whole pressure fixture back to sequential on worktree failure", () => {
    const tasks: Task[] = [
      { files: ["src/a.ts"], interfaces: { consumes: [], produces: [] } },
      { files: ["src/b.ts"], interfaces: { consumes: [], produces: [] } },
    ];
    const failedCreation: Worktree[] = [
      { created: true, gitDir: "/repo/.git/worktrees/a", commonDir: "/repo/.git" },
      { created: false },
    ];
    const duplicateGitDir: Worktree[] = [
      { created: true, gitDir: "/repo/.git/worktrees/a", commonDir: "/repo/.git" },
      { created: true, gitDir: "/repo/.git/worktrees/a", commonDir: "/repo/.git" },
    ];
    const mainCheckout: Worktree[] = [
      { created: true, gitDir: "/repo/.git", commonDir: "/repo/.git" },
      { created: true, gitDir: "/repo/.git/worktrees/b", commonDir: "/repo/.git" },
    ];

    expect(chooseExecution(tasks, failedCreation)).toBe("sequential");
    expect(chooseExecution(tasks, duplicateGitDir)).toBe("sequential");
    expect(chooseExecution(tasks, mainCheckout)).toBe("sequential");
  });

  it("serializes file collisions and interface dependencies under pressure", () => {
    const worktrees: Worktree[] = ["a", "b"].map((name) => ({
      created: true,
      gitDir: `/repo/.git/worktrees/${name}`,
      commonDir: "/repo/.git",
    }));
    const collision: Task[] = [
      { files: ["src/shared.ts"], interfaces: { consumes: [], produces: [] } },
      { files: ["src/shared.ts"], interfaces: { consumes: [], produces: [] } },
    ];
    const dependency: Task[] = [
      { files: ["src/a.ts"], interfaces: { consumes: [], produces: ["Api"] } },
      { files: ["src/b.ts"], interfaces: { consumes: ["Api"], produces: [] } },
    ];

    expect(chooseExecution(collision, worktrees)).toBe("sequential");
    expect(chooseExecution(dependency, worktrees)).toBe("sequential");
  });
});
