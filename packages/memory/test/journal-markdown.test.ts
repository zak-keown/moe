import { describe, expect, it } from "vitest";
import {
  extractSearchableText,
  formatEntry,
  generateExcerpt,
  journalEntryId,
  sectionsMatch,
  timestampFromEntryPath,
  timestampFromFrontmatter,
} from "../src/journal/markdown.js";

describe("extractSearchableText", () => {
  const markdown = `---
title: "Test Entry"
date: 2025-05-31T12:00:00.000Z
timestamp: 1717056000000
---

## Reflections

I feel great about this feature implementation.

## Technical Insights

TypeScript interfaces are really powerful for maintaining code quality.`;

  it("strips frontmatter and section headers and harvests the headings", () => {
    const { text, sections } = extractSearchableText(markdown);

    expect(text).toContain("I feel great about this feature implementation");
    expect(text).toContain("TypeScript interfaces are really powerful");
    expect(text).not.toContain('title: "Test Entry"');
    expect(sections).toEqual(["Reflections", "Technical Insights"]);
  });

  it("handles CRLF line endings", () => {
    // Upstream's frontmatter regex was `^---\n.*?\n---\n` with the `s` flag, so a
    // \r\n file kept its frontmatter in the embedded text.
    const { text, sections } = extractSearchableText(markdown.replace(/\n/g, "\r\n"));
    expect(text).not.toContain("timestamp:");
    expect(sections).toEqual(["Reflections", "Technical Insights"]);
  });

  it("returns no sections for an entry with no headings", () => {
    expect(extractSearchableText("just some text").sections).toEqual([]);
  });
});

describe("sectionsMatch", () => {
  const rendered = [
    "Reflections",
    "Observations",
    "Project Notes",
    "User Context",
    "Technical Insights",
    "World Knowledge",
  ];

  it("matches every documented snake_case name against its rendered heading", () => {
    // Upstream compared the two forms directly, so four of the six matched
    // nothing — and the broken form was the worked example in the live tool
    // description.
    for (const name of [
      "reflections",
      "observations",
      "project_notes",
      "user_context",
      "technical_insights",
      "world_knowledge",
    ]) {
      expect(sectionsMatch(rendered, [name]), name).toBe(true);
    }
  });

  it("keeps the upstream substring leniency", () => {
    expect(sectionsMatch(rendered, ["reflection"])).toBe(true);
  });

  it("matches the legacy Feelings heading", () => {
    expect(sectionsMatch(["Feelings"], ["feelings"])).toBe(true);
  });

  it("does not match a name nobody wrote", () => {
    expect(sectionsMatch(rendered, ["not_a_section"])).toBe(false);
  });

  it('treats an empty filter as "no filter"', () => {
    expect(sectionsMatch(rendered, [])).toBe(true);
  });

  it("ignores an all-punctuation filter rather than matching everything", () => {
    expect(sectionsMatch(rendered, ["___"])).toBe(false);
  });
});

describe("formatEntry", () => {
  it("renders sections in the fixed order and omits empty categories", () => {
    const out = formatEntry(
      { world_knowledge: "w", reflections: "r", project_notes: "p" },
      new Date("2025-05-31T12:00:00.000Z"),
    );

    const order = ["## Reflections", "## Project Notes", "## World Knowledge"].map((h) =>
      out.indexOf(h),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1] as number);
    expect(order[1]).toBeLessThan(order[2] as number);
    expect(out).not.toContain("## Observations");
  });

  it("round-trips its own frontmatter timestamp", () => {
    const when = new Date("2025-05-31T12:00:00.000Z");
    expect(timestampFromFrontmatter(formatEntry({ reflections: "x" }, when))).toBe(when.getTime());
  });
});

describe("timestampFromEntryPath", () => {
  it("parses the day directory plus the filename", () => {
    const parsed = timestampFromEntryPath("/root/2025-05-27/20-16-46-544103.md");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2025);
    expect(parsed?.getMonth()).toBe(4);
    expect(parsed?.getDate()).toBe(27);
    expect(parsed?.getHours()).toBe(20);
  });

  it("returns null for a filename that is not an entry", () => {
    expect(timestampFromEntryPath("/root/2025-05-27/notes.md")).toBeNull();
  });

  it("returns null when the day directory is not a date", () => {
    expect(timestampFromEntryPath("/root/inbox/20-16-46-544103.md")).toBeNull();
  });
});

describe("journalEntryId", () => {
  it("is stable across the root moving, because the root is not part of the id input", () => {
    const a = journalEntryId("user", "/old/root", "/old/root/2025-05-27/20-16-46-544103.md");
    const b = journalEntryId("user", "/new/root", "/new/root/2025-05-27/20-16-46-544103.md");
    expect(a).toBe(b);
  });

  it("distinguishes the two scopes for the same relative path", () => {
    const p = journalEntryId("project", "/root", "/root/2025-05-27/20-16-46-544103.md");
    const u = journalEntryId("user", "/root", "/root/2025-05-27/20-16-46-544103.md");
    expect(p).not.toBe(u);
  });
});

describe("generateExcerpt", () => {
  it("returns a prefix when there is no query", () => {
    expect(generateExcerpt("abcdef", "", 3)).toBe("abc...");
  });

  it("does not append an ellipsis when the text fits", () => {
    expect(generateExcerpt("abc", "", 10)).toBe("abc");
  });

  it("windows onto the query terms", () => {
    const text = `${"x".repeat(300)}needle${"y".repeat(300)}`;
    expect(generateExcerpt(text, "needle", 100)).toContain("needle");
  });
});
