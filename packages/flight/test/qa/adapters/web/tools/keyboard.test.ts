import { describe, expect, test, vi } from "vitest";
import { executeType } from "../../../../../src/qa/adapters/web/tools/keyboard.js";
import type { WebToolCtx } from "../../../../../src/qa/adapters/web/tools/types.js";

// CR-035: the no-selector branch of executeType used to walk `text`
// character by character through `keyboardPress`, which only knows named
// keys (Tab, Enter, Escape, arrows, F1-F12, ...). Any letter, digit or
// punctuation character missed the table and threw `Unknown key: <char>`
// on the very first character, with zero CDP calls issued. The `type`
// schema marks only `text` as required, so a caller that types plain text
// without a selector — the documented path, not an edge case — hit this
// on every call.
//
// The stub `keyboardPress` below faithfully reproduces that named-keys-only
// behaviour (throwing for anything outside a tiny allowlist) so the test
// fails for the real reason rather than a mock mismatch.
function makeCtx(): WebToolCtx & {
  chrome: { fill: ReturnType<typeof vi.fn>; keyboardPress: ReturnType<typeof vi.fn> };
} {
  const NAMED_KEYS = new Set(["Tab", "Enter", "Escape"]);
  const keyboardPress = vi.fn(async (_tab: unknown, keyName: string) => {
    if (!NAMED_KEYS.has(keyName)) {
      throw new Error(`Unknown key: ${keyName}. Supported keys: ${[...NAMED_KEYS].join(", ")}`);
    }
    return { pressed: keyName };
  });
  const fill = vi.fn(async (_tab: unknown, _selector: unknown, value: string) => ({
    typed: true,
    value,
  }));
  return {
    chrome: { fill, keyboardPress },
    tab: 0,
    logger: {} as WebToolCtx["logger"],
    takeReturnScreenshot: async () => ({ screenshotSkipped: "no chrome in this test" }),
  };
}

describe("executeType (CR-035)", () => {
  test("types ordinary text with no selector by delegating to fill, not per-character keyboardPress", async () => {
    const ctx = makeCtx();
    await expect(executeType(ctx, { text: "hello world" })).resolves.toBeDefined();
    expect(ctx.chrome.fill).toHaveBeenCalledWith(ctx.tab, undefined, "hello world");
    expect(ctx.chrome.keyboardPress).not.toHaveBeenCalled();
  });

  test("still fills through the selector when one is given", async () => {
    const ctx = makeCtx();
    await executeType(ctx, { selector: "#name", text: "hello" });
    expect(ctx.chrome.fill).toHaveBeenCalledWith(ctx.tab, "#name", "hello");
    expect(ctx.chrome.keyboardPress).not.toHaveBeenCalled();
  });
});
