import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { buildReturnScreenshot } from "../../../../../src/qa/adapters/web/tools/return-screenshot.js";
import type { ChromeSession } from "../../../../../src/qa/adapters/web/adapter.js";
import type { EvidenceLogger } from "../../../../../src/qa/evidence/logger.js";

// CR-034: buildReturnScreenshot() names its temp screenshot file
// `moe-flight-screenshot-${Date.now()}.png` — millisecond-resolution
// timestamp only, no PID, no random suffix, no per-run namespace.
// AppConfig.maxConcurrentRuns and the daemon's ActiveRunRegistry establish
// that this process runs multiple QA agents concurrently, each independently
// driving a browser tab and independently calling `return_screenshot`. Two
// runs whose calls compute Date.now() in the same millisecond collide on the
// same temp file — one run's screenshot can clobber, or be read back as,
// another run's.
describe("CR-034: return_screenshot temp file name does not collide across concurrent calls", () => {
  const writtenPaths: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const p of writtenPaths.splice(0)) {
      try {
        if (existsSync(p)) unlinkSync(p);
      } catch {
        // best-effort cleanup
      }
    }
  });

  function makeChrome(seenPaths: string[]): ChromeSession {
    return {
      screenshot: vi.fn(async (_tab: unknown, filePath: string) => {
        seenPaths.push(filePath);
        writtenPaths.push(filePath);
        // Stand in for a real PNG write — buildReturnScreenshot reads this
        // back via readFileSync right after screenshot() resolves.
        writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      }),
    } as unknown as ChromeSession;
  }

  test("two calls whose Date.now() lands in the same millisecond use different temp files", async () => {
    // Freeze time to force the collision window the finding describes: two
    // concurrent runs' screenshot calls that happen to compute Date.now()
    // in the same millisecond.
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const seenPaths: string[] = [];
    const logger = {
      saveScreenshot: vi.fn(() => "evidence/screenshot.png"),
    } as unknown as EvidenceLogger;

    const takeA = buildReturnScreenshot({
      chrome: makeChrome(seenPaths),
      defaultTab: 0,
      logger,
      toolName: "click",
      args: { return_screenshot: true },
    });
    const takeB = buildReturnScreenshot({
      chrome: makeChrome(seenPaths),
      defaultTab: 0,
      logger,
      toolName: "click",
      args: { return_screenshot: true },
    });

    await Promise.all([takeA(), takeB()]);

    expect(seenPaths).toHaveLength(2);
    expect(seenPaths[0]).not.toBe(seenPaths[1]);
  });
});
