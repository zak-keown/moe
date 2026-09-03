import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const SOURCE = join(REPO, "packages/core/skills/smoothing-the-experience");
const PLUGIN = join(REPO, "plugins/moe");
const GENERATED_SKILL = "skills/smoothing-the-experience";
const ADAPTER_SKILLS = [
  ".codex-plugin/skills/smoothing-the-experience",
  ".cursor-plugin/skills/smoothing-the-experience",
  ".kimi-plugin/skills/smoothing-the-experience",
  ".opencode/skills/smoothing-the-experience",
  ".pi/skills/smoothing-the-experience",
] as const;

function filesBelow(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop() as string;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      if (entry.isFile()) files.push(relative(root, path));
    }
  }
  return files.sort();
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

describe("smoothing-the-experience distribution contract", () => {
  it("has valid skill frontmatter and a loadable Node entrypoint", () => {
    const skill = readFileSync(join(SOURCE, "SKILL.md"), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(skill);
    expect(frontmatter, "SKILL.md has YAML frontmatter").not.toBeNull();

    const metadata = parseYaml(frontmatter?.[1] ?? "") as Record<string, unknown>;
    expect(metadata.name).toBe("smoothing-the-experience");
    expect(typeof metadata.description).toBe("string");
    expect((metadata.description as string).trim()).not.toBe("");

    for (const entrypoint of [
      join(SOURCE, "scripts/smooth.mjs"),
      join(PLUGIN, GENERATED_SKILL, "scripts/smooth.mjs"),
    ]) {
      const result = spawnSync(process.execPath, [entrypoint, "unknown"], { encoding: "utf8" });
      expect(result.status, entrypoint).toBe(2);
      expect(result.stderr, entrypoint).toContain("Usage:");
    }
  });

  it("ships the complete executable skill and exact adapter skill views", () => {
    const sourceFiles = filesBelow(SOURCE);
    const generatedRoot = join(PLUGIN, GENERATED_SKILL);
    expect(filesBelow(generatedRoot)).toEqual(sourceFiles);
    for (const file of sourceFiles) {
      expect(readFileSync(join(generatedRoot, file)), `${GENERATED_SKILL}/${file}`).toEqual(
        readFileSync(join(SOURCE, file)),
      );
    }

    const sourceSkill = readFileSync(join(SOURCE, "SKILL.md"));
    for (const adapterSkill of ADAPTER_SKILLS) {
      expect(filesBelow(join(PLUGIN, adapterSkill)), adapterSkill).toEqual(["SKILL.md"]);
      expect(readFileSync(join(PLUGIN, adapterSkill, "SKILL.md")), adapterSkill).toEqual(
        sourceSkill,
      );
    }
  });

  it("accounts for every generated copy in the mint manifest", () => {
    const manifest = JSON.parse(readFileSync(join(PLUGIN, ".moe-mint/manifest.json"), "utf8")) as {
      files: Record<string, { sha256: string }>;
    };

    for (const adapterSkill of ADAPTER_SKILLS) {
      for (const file of filesBelow(join(PLUGIN, adapterSkill))) {
        const path = `${adapterSkill}/${file}`;
        const content = readFileSync(join(PLUGIN, path));
        expect(manifest.files[path]?.sha256, path).toBe(sha256(content));
      }
    }
  });
});
