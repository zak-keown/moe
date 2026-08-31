import { describe, expect, test } from "vitest";
import { buildInitialUserMessage } from "../../../src/qa/agent/initial-message.js";

describe("buildInitialUserMessage", () => {
  test("appends adapter.describeTarget when target is provided", () => {
    const adapter = { describeTarget: (t: string) => `Open ${t} in Chromium.` };
    const result = buildInitialUserMessage(adapter, "http://x");
    expect(result).toBe(
      "Begin testing. Use the available tools to interact with the application.\n\nOpen http://x in Chromium.",
    );
  });
});
