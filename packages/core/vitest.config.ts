import { defineConfig } from "vitest/config";

// `@bubstack/moe-core` is a content package: every skill in the tree, three
// shared reference documents, a Stop hook and a polyglot wrapper. There is
// nothing to compile, so verification is about the CORRECTNESS OF METADATA,
// not a passing build — every skill has valid frontmatter, no name collides,
// no cross-reference is stale, every anchored path resolves, every executable
// keeps its bit, and every skill has a recorded rationale. That is what
// test/metadata.test.ts asserts.
//
// The four suites that are NOT in this project, and why:
//   test/iterative-development/  37 Python unittest tests covering the 9 skill
//                                CLIs. `pnpm test:python`; needs python3.
//   test/brainstorm-server/      3,000 lines of upstream node:assert + `ws`
//                                suites that spawn real servers on fixed ports.
//                                `pnpm test:brainstorm`.
//   test/shell/                  two bash suites; test-render-graphs.sh needs
//                                graphviz. `pnpm test:shell`.
//   test/latte/                  65 conversation scenarios x 5 runs = 325
//                                authenticated model calls. `pnpm latte:evals`,
//                                never in CI.
export default defineConfig({
  test: {
    include: ["test/*.test.ts"],
  },
});
