import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

describe("bundle closure", () => {
  it("emits a bundle-manifest.json with entrypoints and file hashes", () => {
    const manifestPath = path.join(DIST, "bundle-manifest.json");
    if (!fs.existsSync(manifestPath)) {
      return; // build not run yet — skip
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.version).toBe(1);
    expect(manifest.entrypoints).toContain("cli.js");
    expect(manifest.entrypoints).toContain("index.js");
    expect(manifest.files.length).toBeGreaterThan(0);
    for (const file of manifest.files) {
      expect(file.hash).toMatch(/^[a-f0-9]{16}$/);
      expect(file.bytes).toBeGreaterThan(0);
    }
  });

  it("contains no host-absolute paths in emitted JS files", () => {
    const manifestPath = path.join(DIST, "bundle-manifest.json");
    if (!fs.existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    if (!homeDir) return;

    for (const file of manifest.files) {
      if (!file.path.endsWith(".js")) continue;
      const content = fs.readFileSync(path.join(DIST, file.path), "utf8");
      expect(content).not.toContain(homeDir);
    }
  });
});
