/**
 * `moe-memory journal search` argument parsing.
 *
 * The bug this pins: the query was built as
 *
 *   rest.filter((arg) => !arg.startsWith("--")).join(" ")
 *
 * which drops flag NAMES but keeps their VALUES. So every value-taking flag
 * leaked its value into the search string:
 *
 *   journal search --limit 5 foo          searched for "5 foo"
 *   journal search --scope user foo       searched for "user foo"
 *   journal search --journal-path /x foo  searched for "/x foo"
 *
 * Semantic search does not fail on a polluted query, it silently returns worse
 * results — which is why this went unnoticed and why it needs a test rather
 * than a comment.
 */

import { describe, expect, it } from "vitest";
import { parseJournalArgs } from "../src/journal-cli.js";

describe("parseJournalArgs", () => {
  it("does not leak a flag's value into the query", () => {
    expect(parseJournalArgs(["--limit", "5", "foo"]).query).toBe("foo");
    expect(parseJournalArgs(["--scope", "user", "foo"]).query).toBe("foo");
    expect(parseJournalArgs(["--journal-path", "/x", "foo"]).query).toBe("foo");
  });

  it("still reads the flags it consumed", () => {
    const parsed = parseJournalArgs(["--limit", "5", "--scope", "user", "foo", "bar"]);
    expect(parsed.limit).toBe(5);
    expect(parsed.scope).toBe("user");
    expect(parsed.query).toBe("foo bar");
  });

  it("handles flags after the query, and multi-word queries", () => {
    const parsed = parseJournalArgs(["why", "is", "it", "slow", "--limit", "3"]);
    expect(parsed.query).toBe("why is it slow");
    expect(parsed.limit).toBe(3);
  });

  it("keeps a value-shaped positional that is not a flag value", () => {
    // "5" here is the query, not a --limit value.
    expect(parseJournalArgs(["5"]).query).toBe("5");
    expect(parseJournalArgs(["--limit", "10", "5"]).query).toBe("5");
  });

  it("falls back on a missing or unusable --limit value", () => {
    expect(parseJournalArgs(["foo"]).limit).toBe(10);
    expect(parseJournalArgs(["--limit", "0", "foo"]).limit).toBe(10);
    expect(parseJournalArgs(["--limit", "abc", "foo"]).limit).toBe(10);
    // A trailing flag with no value must not consume the query.
    expect(parseJournalArgs(["foo", "--limit"]).query).toBe("foo");
    expect(parseJournalArgs(["foo", "--limit"]).limit).toBe(10);
  });

  it("defaults scope to both, and rejects an unknown scope", () => {
    expect(parseJournalArgs(["foo"]).scope).toBe("both");
    expect(parseJournalArgs(["--scope", "sideways", "foo"]).scope).toBe("both");
    // The rejected value is still consumed, not left in the query.
    expect(parseJournalArgs(["--scope", "sideways", "foo"]).query).toBe("foo");
  });

  it("treats boolean flags as taking no value", () => {
    const parsed = parseJournalArgs(["--remove", "foo"]);
    expect(parsed.query).toBe("foo");
    expect(parsed.remove).toBe(true);
  });

  it("reports journalPath only when given", () => {
    expect(parseJournalArgs(["foo"]).journalPath).toBeUndefined();
    expect(parseJournalArgs(["--journal-path", "/j", "foo"]).journalPath).toBe("/j");
  });
});
