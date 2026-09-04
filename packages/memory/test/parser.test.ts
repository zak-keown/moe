import { describe, expect, it } from "vitest";
import { parseConversationFile } from "../src/parser.js";
import { countLines, getFixturePath } from "./test-utils.js";

describe("Parser - Real Conversation Data", () => {
  describe("Short conversation (3 lines)", () => {
    const fixturePath = getFixturePath("short-conversation.jsonl");

    it("should parse file successfully", async () => {
      const result = await parseConversationFile(fixturePath);
      expect(result).toBeDefined();
      expect(result.exchanges).toBeDefined();
      expect(result.project).toBeDefined();
    });

    it("should extract conversation metadata", async () => {
      const result = await parseConversationFile(fixturePath);

      // Should have project name (extracted from parent dir, which is "fixtures" in tests)
      expect(result.project).toBe("fixtures");

      // Should have timestamp
      expect(result.exchanges.length).toBeGreaterThan(0);
      expect(result.exchanges[0]?.timestamp).toBeDefined();
    });

    it("should parse summary line", async () => {
      const result = await parseConversationFile(fixturePath);

      // First line should be summary type
      const lines = result.exchanges;
      expect(lines.length).toBeGreaterThan(0);
    });

    it("should extract user and assistant messages", async () => {
      const result = await parseConversationFile(fixturePath);

      const exchanges = result.exchanges;
      expect(exchanges.length).toBeGreaterThan(0);

      // Should have user message
      const firstExchange = exchanges[0];
      expect(firstExchange).toBeDefined();
      expect(firstExchange?.userMessage).toBeDefined();
      expect(firstExchange?.userMessage.length).toBeGreaterThan(0);

      // Should have assistant message
      expect(firstExchange?.assistantMessage).toBeDefined();
      expect(firstExchange?.assistantMessage.length).toBeGreaterThan(0);
    });
  });

  describe("Medium conversation (23 lines)", () => {
    const fixturePath = getFixturePath("medium-conversation.jsonl");

    it("should parse file successfully", async () => {
      const result = await parseConversationFile(fixturePath);
      expect(result).toBeDefined();
      // Note: This file has only file-history-snapshot entries, no user/assistant messages
      expect(result.exchanges).toEqual([]);
    });

    it("should handle file-history-snapshot entries", async () => {
      const result = await parseConversationFile(fixturePath);

      // Medium conversation has many file history snapshots but no actual exchanges
      // Parser should handle them without crashing
      expect(result.exchanges).toBeDefined();
      expect(Array.isArray(result.exchanges)).toBe(true);
    });

    it("should extract project path correctly", async () => {
      const result = await parseConversationFile(fixturePath);

      expect(result.project).toBeDefined();
      expect(result.project).toBe("fixtures");
    });

    it("should handle empty exchange lists", async () => {
      const result = await parseConversationFile(fixturePath);

      // This file has no exchanges, just metadata
      // Should return empty array, not crash
      expect(result.exchanges).toEqual([]);
    });
  });

  describe("Long conversation (295 lines)", () => {
    const fixturePath = getFixturePath("long-conversation.jsonl");

    it("should parse large file without errors", async () => {
      const lineCount = countLines(fixturePath);
      expect(lineCount).toBeGreaterThan(100);

      const result = await parseConversationFile(fixturePath);
      expect(result).toBeDefined();
      expect(result.exchanges.length).toBeGreaterThan(0);
    });

    it("should handle many exchanges efficiently", async () => {
      const startTime = Date.now();
      const result = await parseConversationFile(fixturePath);
      const parseTime = Date.now() - startTime;

      // Should parse in reasonable time (< 1 second)
      expect(parseTime).toBeLessThan(1000);

      // Should have multiple exchanges
      expect(result.exchanges.length).toBeGreaterThan(1);
    });

    it("should maintain data integrity across all exchanges", async () => {
      const result = await parseConversationFile(fixturePath);

      for (const exchange of result.exchanges) {
        // Every exchange must have required fields
        expect(exchange.project).toBeDefined();
        expect(exchange.timestamp).toBeDefined();
        expect(exchange.userMessage).toBeDefined();
        expect(exchange.assistantMessage).toBeDefined();
        expect(exchange.archivePath).toBe(getFixturePath("long-conversation.jsonl"));

        // Line numbers must be valid
        expect(exchange.lineStart).toBeGreaterThan(0);
        expect(exchange.lineEnd).toBeGreaterThanOrEqual(exchange.lineStart);
      }
    });
  });

  describe("Error handling", () => {
    it("should throw on non-existent file", async () => {
      await expect(parseConversationFile("/nonexistent/file.jsonl")).rejects.toThrow();
    });

    it("should handle malformed JSONL gracefully", async () => {
      // CR-098: this used to just re-parse a valid fixture and assert
      // `toBeDefined()` — it never exercised a malformed line, so it could
      // not catch a regression in the parser's malformed-line handling.
      // malformed-conversation.jsonl has a genuinely malformed middle line
      // (unterminated, non-JSON) between two valid user/assistant messages.
      const result = await parseConversationFile(getFixturePath("malformed-conversation.jsonl"));

      // The malformed line must not crash the parser...
      expect(result).toBeDefined();

      // ...and the valid lines surrounding it must still parse into a real
      // exchange, proving the bad line was skipped rather than corrupting or
      // dropping its neighbors.
      expect(result.exchanges).toHaveLength(1);
      expect(result.exchanges[0]?.userMessage).toBe("Where should uploaded files be stored?");
      expect(result.exchanges[0]?.assistantMessage).toBe("Store them in S3 for production.");
    });
  });
});
