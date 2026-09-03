import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIN_CODEX_VERSION } from "../src/codex-support.js";

describe("codex-compatibility manifest", () => {
  const manifestPath = path.resolve(import.meta.dirname, "../runtime/codex-compatibility.json");

  it("manifest exists and parses", () => {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    expect(manifest.schema).toBe(1);
    expect(manifest.minimumVersion).toBe(MIN_CODEX_VERSION);
    expect(manifest.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("candidates include baseline and current", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const statuses = manifest.candidates.map((c: any) => c.status);
    expect(statuses).toContain("baseline");
    expect(statuses).toContain("current");
  });

  it("required features include plugins and app-server", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.requiredFeatures).toEqual(expect.arrayContaining(["plugins", "app-server"]));
  });

  it("MIN_CODEX_VERSION matches manifest minimum", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(MIN_CODEX_VERSION).toBe(manifest.minimumVersion);
  });
});
