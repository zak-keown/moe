import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIN_CLAUDE_VERSION } from "../src/summarizers/claude.js";

describe("claude-compatibility manifest", () => {
  const manifestPath = path.resolve(import.meta.dirname, "../runtime/claude-compatibility.json");

  it("manifest exists and parses", () => {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    expect(manifest.schema).toBe(1);
    expect(manifest.minimumVersion).toBe(MIN_CLAUDE_VERSION);
    expect(manifest.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("candidates include baseline and current", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const statuses = manifest.candidates.map((c: any) => c.status);
    expect(statuses).toContain("baseline");
    expect(statuses).toContain("current");
  });

  it("required flags match the CLI contract", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.requiredFlags).toEqual(
      expect.arrayContaining(["-p", "--input-format", "--output-format", "--model"]),
    );
  });

  it("MIN_CLAUDE_VERSION matches manifest minimum", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(MIN_CLAUDE_VERSION).toBe(manifest.minimumVersion);
  });
});
