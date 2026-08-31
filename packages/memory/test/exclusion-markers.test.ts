import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SUMMARIZER_CONTEXT_MARKER } from "../src/constants.js";
import {
  EXCLUSION_MARKER,
  EXCLUSION_MARKERS,
  LEGACY_EXCLUSION_MARKER,
  shouldSkipConversation,
} from "../src/sync.js";

/**
 * NEW ON IMPORT. `<INSTRUCTIONS-TO-EPISODIC-MEMORY>DO NOT INDEX THIS CHAT</…>`
 * is a user-authored marker sitting inside transcripts on people's disks. It is
 * matched literally, it is hyphenated ALL-CAPS (so neither a lowercase sweep nor
 * an underscore sweep finds it), and renaming it without keeping the old form
 * does not fail — it silently starts indexing every conversation someone had
 * explicitly marked DO-NOT-INDEX.
 *
 * Upstream had one assertion on it, inside an encoder-dependent sync test. This
 * suite pins both forms offline, where they cannot be skipped.
 */
describe("DO NOT INDEX markers", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "moe-memory-markers-"));
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  function withContent(name: string, content: string): string {
    const p = join(dir, name);
    writeFileSync(p, content, "utf-8");
    return p;
  }

  it("exposes the Moe Memory marker in the documented form", () => {
    expect(EXCLUSION_MARKER).toBe(
      "<INSTRUCTIONS-TO-MOE-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-MOE-MEMORY>",
    );
  });

  it("keeps the upstream episodic-memory marker verbatim and forever", () => {
    expect(LEGACY_EXCLUSION_MARKER).toBe(
      "<INSTRUCTIONS-TO-EPISODIC-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-EPISODIC-MEMORY>",
    );
    expect(EXCLUSION_MARKERS).toContain(LEGACY_EXCLUSION_MARKER);
  });

  it("skips a transcript carrying the Moe Memory marker", () => {
    expect(shouldSkipConversation(withContent("a.jsonl", `x ${EXCLUSION_MARKER} y`))).toBe(true);
  });

  it("skips a transcript carrying the upstream marker", () => {
    expect(shouldSkipConversation(withContent("b.jsonl", `x ${LEGACY_EXCLUSION_MARKER} y`))).toBe(
      true,
    );
  });

  it("skips summarizer-agent transcripts, which is how the summarizer avoids indexing itself", () => {
    expect(
      shouldSkipConversation(withContent("c.jsonl", `prefix ${SUMMARIZER_CONTEXT_MARKER} suffix`)),
    ).toBe(true);
    expect(shouldSkipConversation(withContent("d.jsonl", "Only use NO_INSIGHTS_FOUND here"))).toBe(
      true,
    );
  });

  it("does not skip an ordinary transcript", () => {
    expect(shouldSkipConversation(withContent("e.jsonl", "just a normal conversation"))).toBe(
      false,
    );
  });

  it("does not skip an unreadable file — an I/O error must not silently drop a conversation", () => {
    expect(shouldSkipConversation(join(dir, "does-not-exist.jsonl"))).toBe(false);
  });
});
