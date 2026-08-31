import { describe, expect, test } from "vitest";
import { createAnthropicClient } from "../../../src/qa/models/anthropic.js";
import { createOpenAIClient } from "../../../src/qa/models/openai.js";

describe("API key validation", () => {
  test("Anthropic client throws clear error without API key", () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => createAnthropicClient("claude-sonnet-4-6")).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (origKey) process.env.ANTHROPIC_API_KEY = origKey;
    }
  });

  test("OpenAI client throws clear error without API key", () => {
    const origKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createOpenAIClient("gpt-4o")).toThrow(/OPENAI_API_KEY/);
    } finally {
      if (origKey) process.env.OPENAI_API_KEY = origKey;
    }
  });
});
