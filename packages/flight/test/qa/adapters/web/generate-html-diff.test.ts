import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

// The CDP library under src/qa/adapters/web/lib/ is vendored CommonJS.
// Bun tolerated a bare `require()` in an ESM file; Node and vitest do
// not. Same fix as src/qa/adapters/web/adapter.ts.
const require = createRequire(import.meta.url);

// Regression gate for the Myers-algorithm generateHtmlDiff (hand-ported
// from upstream obra/superpowers-chrome 9861d76). The pre-Myers
// implementation was set-based, so reordered identical lines reported
// "(no changes detected)" — masking real DOM changes from
// captureActionWithDiff. Protect that invariant.

describe("generateHtmlDiff (Myers)", () => {
  test("returns '(no changes detected)' for identical input", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createSession } = require("../../../../src/qa/adapters/web/lib/chrome-ws-lib.js");
    const { generateHtmlDiff } = createSession();
    const html = "<div>hello</div>\n<div>world</div>";
    expect(generateHtmlDiff(html, html)).toBe("(no changes detected)");
  });

  test("shows pure additions in ADDED section only", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createSession } = require("../../../../src/qa/adapters/web/lib/chrome-ws-lib.js");
    const { generateHtmlDiff } = createSession();
    const before = "<p>a</p>";
    const after = "<p>a</p>\n<p>b</p>";
    const diff = generateHtmlDiff(before, after);
    expect(diff).toMatch(/=== ADDED ===/);
    expect(diff).toMatch(/\+ <p>b<\/p>/);
    expect(diff).not.toMatch(/=== REMOVED ===/);
  });

  test("shows pure removals in REMOVED section only", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createSession } = require("../../../../src/qa/adapters/web/lib/chrome-ws-lib.js");
    const { generateHtmlDiff } = createSession();
    const before = "<p>a</p>\n<p>b</p>";
    const after = "<p>a</p>";
    const diff = generateHtmlDiff(before, after);
    expect(diff).toMatch(/=== REMOVED ===/);
    expect(diff).toMatch(/- <p>b<\/p>/);
    expect(diff).not.toMatch(/=== ADDED ===/);
  });

  test("detects reorderings of identical lines (the Myers bug-fix case)", () => {
    // The pre-Myers (set-based) logic returned "(no changes detected)" for
    // this — set membership doesn't capture order. Real reorderings (e.g. a
    // list re-sorted by a click) silently looked like no change.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createSession } = require("../../../../src/qa/adapters/web/lib/chrome-ws-lib.js");
    const { generateHtmlDiff } = createSession();
    const before = "<p>first</p>\n<p>second</p>";
    const after = "<p>second</p>\n<p>first</p>";
    const diff = generateHtmlDiff(before, after);
    expect(diff).not.toBe("(no changes detected)");
  });

  test("caps each side at 50 lines with 'and N more' footer", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createSession } = require("../../../../src/qa/adapters/web/lib/chrome-ws-lib.js");
    const { generateHtmlDiff } = createSession();
    const before = "";
    const after = Array.from({ length: 200 }, (_, i) => `<p>line ${i}</p>`).join("\n");
    const diff = generateHtmlDiff(before, after);
    const addedLines = diff.split("\n").filter((l) => l.startsWith("+ "));
    expect(addedLines.length).toBe(50);
    expect(diff).toMatch(/and 150 more added lines/);
  });

  test("handles null/empty input", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createSession } = require("../../../../src/qa/adapters/web/lib/chrome-ws-lib.js");
    const { generateHtmlDiff } = createSession();
    expect(generateHtmlDiff(null, null)).toBe("(no changes detected)");
    expect(generateHtmlDiff("", "")).toBe("(no changes detected)");
  });

  // CR-033: Myers' trace pushes a full frontier snapshot (`v.slice()`) at
  // every depth, so memory is O(D * (N + M)) with no cap on either input.
  // Two large, fully-different documents (a route change or re-render --
  // exactly the case captureActionWithDiff exists to describe) blow this
  // up: the full pathological repro in the review report OOMs a 512 MB
  // heap at 3000 lines per side. That is too slow/heavy to run as a unit
  // test directly, so this uses a bounded but still-adversarial size
  // (2000 fully-unique lines per side, comfortably above the module's
  // fallback threshold) and asserts a time budget the unfixed O(D*(N+M))
  // trace cannot meet -- it measured ~220ms/~110MB at this size, over 100x
  // the cheap multiset fallback's ~2ms/~1MB.
  test("stays fast on two large, fully-different documents instead of building the full Myers trace", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createSession } = require("../../../../src/qa/adapters/web/lib/chrome-ws-lib.js");
    const { generateHtmlDiff } = createSession();
    const before = Array.from({ length: 2000 }, (_, i) => `<p>before-line-${i}-unique</p>`).join(
      "\n",
    );
    const after = Array.from({ length: 2000 }, (_, i) => `<p>after-line-${i}-unique</p>`).join(
      "\n",
    );

    const start = performance.now();
    const diff = generateHtmlDiff(before, after);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(100);
    // Still a real diff, not a bail-out that reports nothing.
    expect(diff).toMatch(/=== REMOVED ===/);
    expect(diff).toMatch(/=== ADDED ===/);
  });
});
