import { chmod, cp, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assembleArtifactSet, type AssembledArtifact } from "../src/artifact/assemble.js";
import {
  readArtifactManifest,
  validateArtifact,
  type ArtifactManifestV1,
  type ExpectedArtifactContext,
} from "../src/artifact/artifact-manifest.js";
import { resolvePlatform } from "../src/platform/load.js";
import { TARGET_IDS } from "../src/vocabulary.js";

const fixtureRoot = fileURLToPath(new URL("../fixtures/universal-artifact", import.meta.url));
const workspaces: string[] = [];

interface SnapshotRow {
  readonly path: string;
  readonly mode: "0644" | "0755";
  readonly bytes: Buffer;
}

interface FixtureAssembly {
  readonly artifact: AssembledArtifact;
  readonly repositoryRoot: string;
}

interface DiagnosticError extends Error {
  readonly diagnostic: { readonly code: string; readonly source: string; readonly path?: string };
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function snapshot(root: string, relative = ""): Promise<readonly SnapshotRow[]> {
  const rows: SnapshotRow[] = [];
  const names = await readdir(join(root, relative), { encoding: "buffer" });
  names.sort(Buffer.compare);
  for (const rawName of names) {
    const name = new TextDecoder("utf-8", { fatal: true }).decode(rawName);
    const path = relative === "" ? name : `${relative}/${name}`;
    const stats = await lstat(join(root, path));
    if (stats.isDirectory()) rows.push(...(await snapshot(root, path)));
    else {
      rows.push({
        path,
        mode: (stats.mode & 0o111) === 0 ? "0644" : "0755",
        bytes: await readFile(join(root, path)),
      });
    }
  }
  return rows.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
}

async function assembleFixture(
  nonce: string,
  mutateSource?: (repositoryRoot: string) => Promise<void>,
): Promise<FixtureAssembly> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), `moe-universal-${nonce}-`));
  workspaces.push(repositoryRoot);
  await cp(fixtureRoot, join(repositoryRoot, "packages/universal-artifact"), { recursive: true });
  await Promise.all([
    cp(join(fixtureRoot, "legal/LICENSE"), join(repositoryRoot, "LICENSE")),
    cp(join(fixtureRoot, "legal/LICENSE-MIT"), join(repositoryRoot, "LICENSE-MIT")),
    cp(join(fixtureRoot, "legal/NOTICE"), join(repositoryRoot, "NOTICE")),
  ]);
  await writeFile(
    join(repositoryRoot, "moe-platform.yaml"),
    `schema: 1
targets:
  claude-code: {display_name: Claude Code, kind: host}
  cursor: {display_name: Cursor, kind: host}
  codex: {display_name: Codex, kind: host}
  kimi: {display_name: Kimi, kind: host}
  opencode:
    display_name: OpenCode
    kind: host
    contract:
      source: https://github.com/anomalyco/opencode
      revision: ef2792511deb406f3b064e05a7cc1a01979260ee
      path: packages/opencode/src/plugin/shared.ts
  pi:
    display_name: Pi
    kind: host
    contract:
      source: https://github.com/badlogic/pi-mono
      revision: e266507b606b9552fa277252644054afd4384b11
      path: packages/coding-agent/docs/packages.md
  agent-plugins-1.0: {display_name: Agent Plugins 1.0, kind: format}
  copilot: {display_name: GitHub Copilot CLI, kind: host, requires: [claude-code]}
profiles:
  core: {default: true, plugins: [universal-artifact]}
plugins:
  - id: universal-artifact
    source: packages/universal-artifact
    config: packages/universal-artifact/moe-mint.yaml
platform:
  known_operating_systems: [macos, linux, wsl2, windows]
  contributor_operating_systems: [macos, linux, wsl2]
  core_cli_required_operating_systems: [macos, linux, wsl2, windows]
  formal_release_requires_target_os_matrix: true
release:
  origin: {kind: npm, registry: https://registry.npmjs.org}
  mirror: {kind: github-release}
  channels: {stable: latest, prerelease: next}
`,
  );
  await mutateSource?.(repositoryRoot);
  const platform = await resolvePlatform(repositoryRoot);
  const artifacts = await assembleArtifactSet({
    repoRoot: repositoryRoot,
    platform,
    destinationRoot: join(repositoryRoot, `plugins.next-${nonce}`),
  });
  const artifact = artifacts[0];
  if (artifact === undefined) throw new Error("universal artifact was not assembled");
  return { artifact, repositoryRoot };
}

function expectedFor(artifact: AssembledArtifact): ExpectedArtifactContext {
  return {
    plugin: {
      id: artifact.plugin.id,
      package: artifact.plugin.npmPackage,
      version: artifact.plugin.version,
    },
    targets: Object.fromEntries(
      TARGET_IDS.flatMap((target) => {
        const emission = artifact.emissions[target];
        return emission === undefined
          ? []
          : [[target, { emitted_capabilities: emission.emittedCapabilities }]];
      }),
    ),
    omitted_optional_payloads: artifact.omittedOptionalPayloads,
  };
}

async function captureDiagnostic(operation: () => Promise<unknown>): Promise<DiagnosticError["diagnostic"]> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Error && "diagnostic" in error) {
      return (error as DiagnosticError).diagnostic;
    }
    throw error;
  }
  throw new Error("operation unexpectedly succeeded");
}

async function rewriteManifest(
  artifactRoot: string,
  mutate: (manifest: ArtifactManifestV1) => void,
): Promise<void> {
  const path = join(artifactRoot, ".moe/artifact.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as ArtifactManifestV1;
  mutate(manifest);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

describe("universal artifact", () => {
  it("assembles byte-identically with the same tree digest in independent repositories", async () => {
    const [first, second] = await Promise.all([assembleFixture("first"), assembleFixture("second")]);

    const firstSnapshot = await snapshot(first.artifact.root);
    expect(firstSnapshot).toEqual(await snapshot(second.artifact.root));
    const firstArtifactManifest = await readArtifactManifest(first.artifact.root);
    expect(firstArtifactManifest.tree_sha256).toBe(
      (await readArtifactManifest(second.artifact.root)).tree_sha256,
    );
    expect(firstArtifactManifest.targets).toEqual(expectedFor(first.artifact).targets);
    expect(firstSnapshot.map((row) => row.path)).toEqual(
      expect.arrayContaining([
        "runtime/index.js",
        "types/index.d.ts",
        "bin/moe-fixture",
        "skills/universal-fixture/SKILL.md",
        "commands/universal-probe.md",
        "agents/universal-reviewer.md",
        "hooks/hooks.json",
        ".mcp.json",
        "mcp/server.js",
        "prompts/universal-prompt.md",
        "bootstrap/CONTEXT.md",
        "legal/imported/source.txt",
        "LICENSE",
        "NOTICE",
      ]),
    );

    const packageManifest = JSON.parse(
      await readFile(join(first.artifact.root, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(packageManifest).not.toHaveProperty("scripts");
    expect(packageManifest).not.toHaveProperty("devDependencies");
    expect(packageManifest).toMatchObject({
      dependencies: { "fixture-runtime-external": "^1.0.0" },
      optionalDependencies: { "fixture-optional-external": "^2.0.0" },
      sideEffects: ["./runtime/register.js"],
      exports: {
        ".": { types: "./types/index.d.ts", import: "./runtime/index.js" },
        "./server": "./.opencode/plugins/universal-artifact.js",
      },
      pi: {
        extensions: ["./.pi/extensions/universal-artifact.ts"],
        skills: ["./skills"],
      },
    });
    expect(await readFile(join(first.artifact.root, ".opencode/plugins/universal-artifact.js"), "utf8"))
      .toContain("export");
    expect((await lstat(join(first.artifact.root, "bin/moe-fixture"))).mode & 0o777).toBe(0o755);
  });

  it.each([
    [
      "runtime bytes",
      async (root: string) => writeFile(join(root, "runtime/index.js"), "tampered\n"),
      "ARTIFACT_MANIFEST_FILES_MISMATCH",
    ],
    [
      "executable mode",
      async (root: string) => chmod(join(root, "bin/moe-fixture"), 0o644),
      "ARTIFACT_MANIFEST_FILES_MISMATCH",
    ],
    [
      "an added file",
      async (root: string) => writeFile(join(root, "runtime/added.js"), "added\n"),
      "ARTIFACT_MANIFEST_FILES_MISMATCH",
    ],
    [
      "a removed file",
      async (root: string) => rm(join(root, "runtime/register.js")),
      "ARTIFACT_MANIFEST_FILES_MISMATCH",
    ],
    [
      "a symbolic link",
      async (root: string) => {
        await rm(join(root, "runtime/register.js"));
        await symlink("index.js", join(root, "runtime/register.js"));
      },
      "ARTIFACT_UNSAFE_FILE_TYPE",
    ],
  ] as const)("rejects tampered %s", async (_name, tamper, code) => {
    const { artifact } = await assembleFixture(`tamper-${code.toLowerCase()}`);
    await tamper(artifact.root);

    expect(await captureDiagnostic(() => validateArtifact(artifact.root, expectedFor(artifact))))
      .toMatchObject({ code, source: "artifact tree" });
  });

  it.each([
    ["parent traversal", "../escape.js"],
    ["case-fold alias", "RUNTIME/index.js"],
    ["Unicode normalization alias", "legal/imported/cafe\u0301.txt"],
  ] as const)("rejects a manifest %s", async (_name, injectedPath) => {
    const { artifact } = await assembleFixture(`manifest-${injectedPath.length}`);
    await rewriteManifest(artifact.root, (manifest) => {
      const original = manifest.files.find((entry) =>
        injectedPath.startsWith("legal/") ? entry.path === "legal/imported/café.txt" : entry.path === "runtime/index.js",
      );
      if (original === undefined) throw new Error("fixture row missing");
      (manifest.files as Array<(typeof manifest.files)[number]>).push({ ...original, path: injectedPath });
    });

    expect(await captureDiagnostic(() => validateArtifact(artifact.root, expectedFor(artifact))))
      .toMatchObject({ code: "ARTIFACT_MANIFEST_INVALID", source: "artifact tree" });
  });

  it("rejects a source package field that collides with OpenCode's server export", async () => {
    const diagnostic = await captureDiagnostic(() =>
      assembleFixture("package-collision", async (repositoryRoot) => {
        const path = join(repositoryRoot, "packages/universal-artifact/package.json");
        const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        const exports = manifest.exports as Record<string, unknown>;
        exports["./server"] = "./runtime/index.js";
        await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
      }),
    );

    expect(diagnostic).toMatchObject({ code: "PACKAGE_MANIFEST_COLLISION" });
  });

  it("rejects stale bundled-work revision metadata when work is undeclared", async () => {
    const diagnostic = await captureDiagnostic(() =>
      assembleFixture("stale-legal", async (repositoryRoot) => {
        const noticePath = join(repositoryRoot, "NOTICE");
        const notice = await readFile(noticePath, "utf8");
        await writeFile(noticePath, notice.replace("`2.0.0`", "`9.9.9`"));
        const mintYamlPath = join(repositoryRoot, "packages/universal-artifact/moe-mint.yaml");
        const mintYaml = await readFile(mintYamlPath, "utf8");
        await writeFile(mintYamlPath, mintYaml.replace(/- name: fixture-bundle-apache\n\s+artifact_roots: \[]/g, ""));
      }),
    );
    expect(diagnostic).toMatchObject({ code: "STAGED_IMPORT_UNDECLARED", source: "staged imports" });
  });

  it("rejects adapter capability evidence that differs from canonical generation", async () => {
    const { artifact } = await assembleFixture("capability-drift");
    const expected = expectedFor(artifact);
    const codex = expected.targets.codex;
    if (codex === undefined) throw new Error("Codex fixture emission missing");
    const changed: ExpectedArtifactContext = {
      ...expected,
      targets: {
        ...expected.targets,
        codex: { emitted_capabilities: [...codex.emitted_capabilities, "command-discovery"] },
      },
    };

    expect(await captureDiagnostic(() => validateArtifact(artifact.root, changed)))
      .toMatchObject({ code: "ARTIFACT_MANIFEST_TARGETS_MISMATCH", source: "artifact tree" });
  });
});
