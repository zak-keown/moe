import { describe, expect, it } from "vitest";

describe("item model", () => {
  it("round-trips serialize → parse", async () => {
    const { serializeItem, parseItem } = await import("../src/backlog.js");
    const item = {
      id: "BL-0007", title: "tab FFI ABI drift", status: "carry-over" as const,
      reason: "budget", severity: "high" as const, source: "code-review:CR-012",
      created: "2026-09-04", updated: "2026-09-04",
      filedBy: "wave3", filedSha: "a1b2c3d",
      blockedBy: ["BL-0003"], blocks: [], tags: ["tab", "ffi"],
      body: "## Context\n\nwhy\n\n## Resume\n\n- next: bindings\n",
    };
    const back = parseItem(serializeItem(item));
    expect(back.id).toBe("BL-0007");
    expect(back.status).toBe("carry-over");
    expect(back.blockedBy).toEqual(["BL-0003"]);
    expect(back.tags).toEqual(["tab", "ffi"]);
    expect(back.body).toContain("## Resume");
  });

  it("throws on text with no frontmatter", async () => {
    const { parseItem } = await import("../src/backlog.js");
    expect(() => parseItem("no frontmatter here")).toThrow(/frontmatter/);
  });

  it("allocates the next zero-padded id, ignoring gaps", async () => {
    const { allocateId } = await import("../src/backlog.js");
    expect(allocateId(["0001-a.md", "0003-c.md"])).toEqual({ num: 4, id: "BL-0004" });
    expect(allocateId([])).toEqual({ num: 1, id: "BL-0001" });
  });
});
