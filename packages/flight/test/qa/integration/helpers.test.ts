import { describe, expect, it } from "vitest";
import { isChromeUnavailable } from "./helpers.js";

describe("isChromeUnavailable", () => {
  // The actual error `startChrome()` throws when no browser binary is on
  // disk (src/qa/adapters/web/lib/chrome-process.js: `throw new
  // Error(\`Chrome not found. Searched: ${paths.join(', ')}\`)`) — see
  // CR-041. Every web e2e suite wraps its `adapter.start()`/`runAgent()`
  // call in this guard specifically to turn that error into a skip instead
  // of a hard failure.
  it("recognizes the real 'Chrome not found' launcher error as unavailable", () => {
    const err = new Error(
      "Chrome not found. Searched: /usr/bin/google-chrome, /usr/bin/chromium-browser, /usr/bin/chromium",
    );
    expect(isChromeUnavailable(err)).toBe(true);
  });

  it("still recognizes the other known-unavailable substrings", () => {
    expect(isChromeUnavailable(new Error("connect ECONNREFUSED 127.0.0.1:9222"))).toBe(true);
    expect(isChromeUnavailable(new Error("chrome-ws-lib not available"))).toBe(true);
    expect(isChromeUnavailable(new Error("adapter.start() timed out after 15000ms"))).toBe(true);
  });

  it("returns false for an unrelated error", () => {
    expect(isChromeUnavailable(new Error("some unrelated failure"))).toBe(false);
  });
});
