import { describe, test, expect } from "vitest";

import { createRequire } from "node:module";

// The CDP library under src/qa/adapters/web/lib/ is vendored CommonJS.
// Bun tolerated a bare `require()` in an ESM file; Node and vitest do
// not. Same fix as src/qa/adapters/web/adapter.ts.
const require = createRequire(import.meta.url);

const { attachNavigation } = require("../../../../../src/qa/adapters/web/lib/navigation.js");

// A fake page session whose Page.navigate send throws synchronously,
// modeling the "Browser WS not connected" failure we see in tutorial-04.
// waitForEvent returns a promise that rejects after `loadEventTimeoutMs`,
// keeping the test fast — the real navigation.js uses a 30s timer.
function makeFakePs(opts: {
  navigateError: Error;
  loadEventTimeoutMs: number;
}) {
  let waitForEventPromise: Promise<unknown> | null = null;
  return {
    sessionId: "fake-session-id",
    async send(method: string, _params?: Record<string, unknown>) {
      if (method === "Page.navigate") throw opts.navigateError;
      // Page.enable and any other domain enables succeed.
      return {};
    },
    async enableDomain(_name: string) {
      // no-op
    },
    onEvent(_handler: (msg: unknown) => void) {
      return () => {};
    },
    waitForEvent(_method: string, _wopts?: { timeoutMs?: number }) {
      // We deliberately ignore the timeoutMs the caller passes — the real
      // navigation.js uses 30s, which would make this test absurdly slow.
      // The behavior under test is "the rejection is suppressed if no one
      // awaits", which doesn't depend on the timeout duration.
      waitForEventPromise = new Promise((_resolve, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `waitForEvent Page.loadEventFired: timed out after ${opts.loadEventTimeoutMs}ms`,
              ),
            ),
          opts.loadEventTimeoutMs,
        ),
      );
      return waitForEventPromise;
    },
    _getLoadPromise: () => waitForEventPromise,
  };
}

// A fake page session whose Page.navigate resolves normally (not a thrown
// rejection) but carries an `errorText` field — exactly what CDP returns
// when the browser attempted the navigation and it failed (DNS failure,
// connection refused, cert error, ...). Chrome still renders an error page
// for these, and that error page still fires Page.loadEventFired, so
// `waitForEvent` below resolves normally too — the only signal a failed
// navigation leaves behind is `errorText` on the Page.navigate result.
function makeFailedNavigationPs(errorText: string) {
  return {
    sessionId: "fake-session-id",
    async send(method: string, _params?: Record<string, unknown>) {
      if (method === "Page.navigate") {
        return { frameId: "frame-1", loaderId: "loader-1", errorText };
      }
      return {};
    },
    async enableDomain(_name: string) {
      // no-op
    },
    onEvent(_handler: (msg: unknown) => void) {
      return () => {};
    },
    waitForEvent(_method: string, _wopts?: { timeoutMs?: number }) {
      // The error page still fires loadEventFired.
      return Promise.resolve();
    },
  };
}

describe("CR-012: navigate() surfaces Page.navigate's errorText instead of reporting success", () => {
  test("a failed navigation (errorText set) rejects instead of resolving", async () => {
    const ps = makeFailedNavigationPs("net::ERR_NAME_NOT_RESOLVED");
    const { navigate } = attachNavigation({
      state: { consoleMessages: new Map() },
      getPageSession: async () => ps,
      capturePageArtifacts: async () => ({}),
      evaluate: async () => ({}),
    });

    await expect(navigate(0, "http://nonexistent.invalid")).rejects.toThrow(
      /ERR_NAME_NOT_RESOLVED/,
    );
  });

  test("a successful navigation (no errorText) still resolves", async () => {
    const ps = makeFailedNavigationPs(undefined as unknown as string);
    // Successful case: no errorText key at all on the result.
    (ps as { send: (m: string) => Promise<Record<string, unknown>> }).send = async (
      method: string,
    ) => {
      if (method === "Page.navigate") return { frameId: "frame-1", loaderId: "loader-1" };
      return {};
    };
    const { navigate } = attachNavigation({
      state: { consoleMessages: new Map() },
      getPageSession: async () => ps,
      capturePageArtifacts: async () => ({}),
      evaluate: async () => ({}),
    });

    await expect(navigate(0, "http://example.com")).resolves.toBe("frame-1");
  });
});

describe("navigation orphan-loadP regression", () => {
  test("when Page.navigate throws, the loadP timer's rejection does not escape as unhandled", async () => {
    const captured: Array<{ reason: unknown }> = [];
    const onUnhandled = (reason: unknown) => {
      captured.push({ reason });
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const ps = makeFakePs({
        navigateError: new Error("Browser WS not connected (call send() first to lazy-open)"),
        loadEventTimeoutMs: 50,
      });
      const { navigate } = attachNavigation({
        state: { consoleMessages: new Map() },
        getPageSession: async () => ps,
        capturePageArtifacts: async () => ({}),
        evaluate: async () => ({}),
      });

      // The navigate call must throw — the agent's tool dispatch surfaces
      // this as an error result.
      await expect(navigate(0, "http://localhost:4444")).rejects.toThrow(/not connected/i);

      // Wait past the fake loadP timeout. Without the fix, this is the
      // window in which the orphan rejection escapes to unhandledRejection.
      await new Promise((r) => setTimeout(r, 150));

      // The fix: loadP's rejection must have been observed (e.g. via a
      // noop .catch attached at creation, or by structuring navigation.js
      // so the timer is never created when the send is about to throw).
      // Either way, no unhandledRejection should fire.
      expect(captured).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
