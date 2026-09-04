import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, "../../../../../..");
const SCRIPT_PATH = resolve(PACKAGE_ROOT, "src/qa/adapters/web/lib/page-scripts/markdown.js");

// CR-033: markdown.js's header comment claimed "Tested directly against
// jsdom in test/lib/page-scripts/markdown.test.mjs". No such file exists
// anywhere under packages/flight — the only file with that name lives in the
// sibling packages/glass package, which this comment does not name, and
// nothing links flight's copy to glass's test. This script backs the
// `extract` tool's whole-page-markdown fallback and the auto-capture
// markdown artifact, both exercised only through mocked stubs in
// adapter.test.ts, never through the actual DOM-walking logic the comment
// claims is under test.
//
// This is a regression guard, not (yet) real jsdom coverage of the script's
// DOM-walking logic: it fails if the header claims a specific "Tested
// directly against jsdom in <path>" test file that does not actually exist
// in this package, so the comment can't silently go stale a second time.
describe("CR-033: markdown.js's header comment does not claim jsdom coverage this package lacks", () => {
  test("any 'Tested directly against jsdom in <path>' claim names a file that exists in this package", () => {
    const header = readFileSync(SCRIPT_PATH, "utf8")
      .split("\n")
      .slice(0, 10)
      .map((line) => line.replace(/^\/\/\s?/, ""))
      .join(" ");

    const match = header.match(/Tested directly against jsdom in\s+([^\s]+\.test\.mjs)/);

    if (!match) {
      // No specific-file claim at all — nothing to verify.
      return;
    }

    const claimedPath = resolve(PACKAGE_ROOT, match[1]);
    expect(existsSync(claimedPath)).toBe(true);
  });
});
