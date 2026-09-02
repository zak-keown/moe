import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// CR-026: docker/compose.yaml's build context is the monorepo root
// (`context: ../../..`), and Docker reads a plain `.dockerignore` only from
// the context root — there is none at the repo root, and the only ignore
// file in this package (../.dockerignore) documents itself as inert at that
// depth ("INERT AS PLACED ... this file is never consulted"). Without an
// ignore file, `COPY packages/flight packages/flight` in the Dockerfile pulls
// in packages/flight/.env verbatim — the file docker/compose.yaml's own
// env_file directive tells operators to create for their provider keys —
// baking secrets into an image layer, plus node_modules/dist/.turbo.
//
// Fix: a BuildKit per-Dockerfile ignore file, `<Dockerfile>.dockerignore`,
// placed in the SAME DIRECTORY as the Dockerfile it applies to (Docker's
// documented convention) — this works regardless of the context root, so it
// needs no file outside packages/flight.
const DOCKER_DIR = join(import.meta.dirname, "..", "..", "docker");
const IGNORE_FILE = join(DOCKER_DIR, "Dockerfile.dockerignore");

describe("CR-026: the Chrome-serving Dockerfile has a working ignore file", () => {
  test("Dockerfile.dockerignore exists next to ./Dockerfile", () => {
    expect(existsSync(join(DOCKER_DIR, "Dockerfile"))).toBe(true);
    expect(existsSync(IGNORE_FILE)).toBe(true);
  });

  test("excludes .env files, node_modules, dist, .turbo, and .git", () => {
    const lines = readFileSync(IGNORE_FILE, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    for (const pattern of [
      "**/.env",
      "**/.env.*",
      "**/node_modules",
      "**/dist",
      "**/.turbo",
      ".git",
    ]) {
      expect(lines).toContain(pattern);
    }
  });
});
