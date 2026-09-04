import { describe, expect, it } from "vitest";
import type { PlanTask } from "../src/parser.js";
import { computeWaves, parsePlan, validatePlan } from "../src/parser.js";

const FIXTURE = `
### Task 1: Foundation

**depends_on:** []

**Files:**
- Create: \`src/foundation.ts\`
- Test: \`test/foundation.test.ts\`

**Interfaces:**
- Consumes: \`None\`
- Produces: \`createFoundation(): Foundation\`

- [ ] **Step 1: Write test**
- [x] **Step 2: Implement**

### Task 2: Walls

**depends_on:** [1]

**Files:**
- Create: \`src/walls.ts\`
- Test: \`test/walls.test.ts\`

**Interfaces:**
- Consumes: \`createFoundation(): Foundation\`
- Produces: \`buildWalls(f: Foundation): Walls\`

- [ ] **Step 1: Write test**

### Task 3: Roof

**depends_on:** [1]

**Files:**
- Create: \`src/roof.ts\`
- Test: \`test/roof.test.ts\`

**Interfaces:**
- Consumes: \`createFoundation(): Foundation\`
- Produces: \`addRoof(f: Foundation): Roof\`

- [ ] **Step 1: Write test**
`;

describe("parsePlan", () => {
  it("extracts tasks with all fields", () => {
    const { tasks } = parsePlan(FIXTURE);
    expect(tasks).toHaveLength(3);

    const t1 = tasks.find((t) => t.num === 1)!;
    expect(t1.title).toBe("Foundation");
    expect(t1.dependsOn).toEqual([]);
    expect(t1.files).toEqual(["src/foundation.ts", "test/foundation.test.ts"]);
    expect(t1.hasConsumes).toBe(true);
    expect(t1.hasProduces).toBe(true);
    expect(t1.steps).toEqual([{ checked: false }, { checked: true }]);
  });

  it("parses depends_on integers", () => {
    const { tasks } = parsePlan(FIXTURE);
    const t2 = tasks.find((t) => t.num === 2)!;
    expect(t2.dependsOn).toEqual([1]);
  });

  it("skips fenced code blocks", () => {
    const withFence = "```\n### Task 99: Fake\n```\n" + FIXTURE;
    const { tasks } = parsePlan(withFence);
    expect(tasks.find((t) => t.num === 99)).toBeUndefined();
  });
});

describe("validatePlan", () => {
  it("passes on a valid plan", () => {
    const { tasks } = parsePlan(FIXTURE);
    const { errors } = validatePlan(tasks);
    expect(errors).toEqual([]);
  });

  it("detects duplicate task numbers", () => {
    const dup =
      FIXTURE +
      "\n### Task 1: Duplicate\n\n**Files:**\n- Create: `x.ts`\n\n**Interfaces:**\n- Consumes: `None`\n- Produces: `None`\n\n- [ ] Step\n";
    const { tasks } = parsePlan(dup);
    const { errors } = validatePlan(tasks);
    expect(errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("detects missing depends_on target", () => {
    const bad = FIXTURE.replace("**depends_on:** [1]", "**depends_on:** [99]");
    const { tasks } = parsePlan(bad);
    const { errors } = validatePlan(tasks);
    expect(errors.some((e) => e.includes("99"))).toBe(true);
  });
});

describe("computeWaves", () => {
  it("groups independent tasks into the same wave", () => {
    const { tasks } = parsePlan(FIXTURE);
    const waves = computeWaves(tasks);
    // Task 1 is wave 0. Tasks 2 and 3 depend on 1 but not each other,
    // and have disjoint files — same wave.
    expect(waves[0]).toEqual([1]);
    expect(waves[1]).toEqual(expect.arrayContaining([2, 3]));
  });

  it("does not silently drop a task whose depends_on references an unknown task number (CR-056)", () => {
    // Task 1's depends_on references task 99, which doesn't exist in this
    // task list. Unlike validatePlan (which ignores unknown targets via
    // `known.has(d)`), computeWaves must not let that dangling reference
    // inflate task 1's in-degree forever — every task must still end up
    // scheduled into some wave.
    const tasks: PlanTask[] = [
      {
        num: 1,
        title: "Has a dangling dependency",
        dependsOn: [99],
        blockedBy: null,
        files: ["src/a.ts"],
        hasConsumes: true,
        hasProduces: true,
        steps: [],
      },
      {
        num: 2,
        title: "No dependencies",
        dependsOn: [],
        blockedBy: null,
        files: ["src/b.ts"],
        hasConsumes: true,
        hasProduces: true,
        steps: [],
      },
    ];

    const waves = computeWaves(tasks);
    const scheduled = waves.flat();

    expect(scheduled).toContain(1);
    expect(scheduled).toContain(2);
    expect(scheduled).toHaveLength(2);
  });
});
