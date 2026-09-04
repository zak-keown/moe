import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CORE = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(CORE, "skills/write-skill/scripts/render-graphs.mjs");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "render-graphs-"));
  roots.push(root);
  const skill = join(root, "fixture-skill; harmless");
  mkdirSync(skill);
  writeFileSync(
    join(skill, "SKILL.md"),
    "# Fixture\n\n```dot\ndigraph fixture_graph {\n  start -> end;\n}\n```\n",
  );
  return { root, skill };
}

function fakeDot(root: string): string {
  const bin = join(root, "bin");
  mkdirSync(bin);
  const dot = join(bin, "dot");
  writeFileSync(
    dot,
    '#!/bin/sh\nif [ "$1" = "-V" ]; then exit 0; fi\nprintf \'<svg>fixture</svg>\\n\'\n',
  );
  chmodSync(dot, 0o755);
  return bin;
}

describe("render-graphs", () => {
  it("reports missing Graphviz without a module-classification error", () => {
    const { root, skill } = fixture();
    const emptyPath = join(root, "empty-path");
    mkdirSync(emptyPath);
    const result = spawnSync(process.execPath, [SCRIPT, skill], {
      encoding: "utf8",
      env: { ...process.env, PATH: emptyPath },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Error: graphviz (dot) not found.");
    expect(result.stderr).not.toContain("ReferenceError: require is not defined");
  });

  it("renders a diagram through fake dot and writes SVG markup", () => {
    const { root, skill } = fixture();
    const bin = fakeDot(root);
    const result = spawnSync(process.execPath, [SCRIPT, skill], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Found 1 diagram(s)");
    expect(result.stdout).toContain("Rendered: fixture_graph.svg");
    expect(readFileSync(join(skill, "diagrams", "fixture_graph.svg"), "utf8")).toContain("<svg>");
  });

  it("executes correctly through a symlink and preserves combined artifacts", () => {
    const { root, skill } = fixture();
    const bin = fakeDot(root);
    const linked = join(root, "linked-render.mjs");
    symlinkSync(SCRIPT, linked);
    const result = spawnSync(process.execPath, [linked, skill, "--combine"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(
      readFileSync(join(skill, "diagrams", "fixture_skill_harmless_combined.svg"), "utf8"),
    ).toContain("<svg>");
    expect(
      readFileSync(join(skill, "diagrams", "fixture_skill_harmless_combined.dot"), "utf8"),
    ).toContain("digraph fixture_skill_harmless_combined");
  });
});
