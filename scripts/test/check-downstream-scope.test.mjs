import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkDownstreamScope,
  MANIFEST_IDENTITIES,
  PRIVATE_FLIGHT_MANIFESTS,
} from "../check-downstream-scope.mjs";
import { marketplaceProblems } from "../mint-plugins.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../check-downstream-scope.mjs", import.meta.url));
const fixtureRoots = [];
const UPSTREAM_SCOPE = "@bubstack";
const UPSTREAM_MOE = `${UPSTREAM_SCOPE}/moe`;

function rootMarketplace() {
  return JSON.parse(readFileSync(join(REPOSITORY_ROOT, ".claude-plugin/marketplace.json"), "utf8"));
}

function npmMarketplaceEntry(marketplace, name) {
  const entry = marketplace.plugins.find((plugin) => plugin.name === name);
  assert.ok(entry, `missing ${name} marketplace entry`);
  assert.equal(entry.source?.source, "npm", `${name} must use an npm source`);
  return entry;
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(path, source) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}

function writeJson(path, value) {
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function cleanFixture() {
  const root = mkdtempSync(join(tmpdir(), "moe-downstream-scope-"));
  fixtureRoots.push(root);
  for (const [displayPath, name] of Object.entries(MANIFEST_IDENTITIES)) {
    writeJson(join(root, displayPath), {
      name,
      version: "1.2.3-tc.4",
      ...(PRIVATE_FLIGHT_MANIFESTS.includes(displayPath) ? { private: true } : {}),
    });
  }
  writeJson(join(root, ".claude-plugin/marketplace.json"), {
    name: "moe",
    plugins: [{ name: "moe-memory", source: { source: "npm", package: "@tc/moe-memory" } }],
  });
  writeJson(join(root, "plugins/moe-memory/package.json"), {
    name: "moe-memory",
    version: "1.2.3-tc.4",
  });
  write(join(root, "INSTALL.md"), "Install with `npx @tc/moe install`.\n");
  return root;
}

function codes(result) {
  return result.problems.map((item) => item.code);
}

describe("TC downstream identity guard", () => {
  it("accepts the exact 11-name mapping and exact private Flight denylist", () => {
    const result = checkDownstreamScope(cleanFixture());

    assert.equal(result.ok, true);
    assert.equal(result.manifests.length, 11);
    assert.deepEqual(
      result.manifests.filter((item) => item.private).map((item) => item.path),
      PRIVATE_FLIGHT_MANIFESTS,
    );
  });

  it("rejects manifest identity drift and any private-set drift", () => {
    const root = cleanFixture();
    writeJson(join(root, "packages/core/package.json"), {
      name: `${UPSTREAM_MOE}-core`,
      private: true,
    });
    writeJson(join(root, "packages/flight/ui/package.json"), {
      name: "@tc/moe-flight-ui",
      private: false,
    });

    const result = checkDownstreamScope(root);

    assert.equal(result.ok, false);
    for (const code of [
      "manifest.name",
      "manifest.unexpected-private",
      "manifest.flight-private",
      "scope.upstream-leak",
    ]) {
      assert.ok(codes(result).includes(code), `missing ${code}`);
    }
  });

  it("catches dependency, runtime import, install-doc, marketplace, and minted-plugin leaks", () => {
    const root = cleanFixture();
    const flightManifest = JSON.parse(
      readFileSync(join(root, "packages/flight/package.json"), "utf8"),
    );
    flightManifest.dependencies = { [`${UPSTREAM_MOE}-tab`]: "workspace:*" };
    writeJson(join(root, "packages/flight/package.json"), flightManifest);
    write(
      join(root, "packages/glass/src/index.ts"),
      `import { launch } from "${UPSTREAM_MOE}-glass";\nvoid launch;\n`,
    );
    write(join(root, "INSTALL.md"), `Run \`npx ${UPSTREAM_MOE} install\`.\n`);
    writeJson(join(root, ".claude-plugin/marketplace.json"), {
      plugins: [
        {
          name: "moe-memory",
          source: { source: "npm", package: `${UPSTREAM_MOE}-memory` },
        },
      ],
    });
    writeJson(join(root, "plugins/moe-memory/package.json"), {
      name: `${UPSTREAM_MOE}-memory`,
    });

    const result = checkDownstreamScope(root);
    const leakLocations = result.problems
      .filter((item) => item.code === "scope.upstream-leak")
      .map((item) => item.location);

    assert.equal(result.ok, false);
    for (const prefix of [
      "packages/flight/package.json:",
      "packages/glass/src/index.ts:",
      "INSTALL.md:",
      ".claude-plugin/marketplace.json:",
      "plugins/moe-memory/package.json:",
    ]) {
      assert.ok(
        leakLocations.some((location) => location.startsWith(prefix)),
        `missing ${prefix}`,
      );
    }
  });

  it("allows only named legal, history, and frozen red-fixture references", () => {
    const root = cleanFixture();
    write(join(root, ".planning/status.md"), `Historic ${UPSTREAM_MOE}-core command.\n`);
    write(join(root, "docs/history/import.md"), `Historic ${UPSTREAM_MOE}-mint package.\n`);
    write(join(root, "PARITY.md"), `Frozen source: ${UPSTREAM_MOE}-flight.\n`);
    write(join(root, "NOTICE"), `Prior identity: ${UPSTREAM_MOE}.\n`);
    write(
      join(root, "scripts/fixtures/provenance-red/PARITY.md"),
      `Broken fixture: ${UPSTREAM_MOE}-regressed.\n`,
    );
    write(
      join(root, "packages/core/test/house-voice/fixtures/generic.md"),
      `# ${UPSTREAM_MOE}-example\n`,
    );
    write(join(root, "ARCHITECTURE.md"), `The upstream analogue is \`${UPSTREAM_MOE}\`.\n`);

    const result = checkDownstreamScope(root);

    assert.equal(result.ok, true);
    assert.equal(result.allowlistedReferences, 5);
  });

  it("does not turn an upstream mention into a blanket documentation exemption", () => {
    const root = cleanFixture();
    write(
      join(root, "packages/core/README.md"),
      `The neutral upstream exists. Install ${UPSTREAM_MOE}-core here.\n`,
    );

    const result = checkDownstreamScope(root);

    assert.equal(result.ok, false);
    assert.ok(
      result.problems.some(
        (item) =>
          item.code === "scope.upstream-leak" &&
          item.location.startsWith("packages/core/README.md:"),
      ),
    );
  });

  it("CLI mode is deterministic and read-only", () => {
    const root = cleanFixture();
    const manifestPath = join(root, "package.json");
    const before = readFileSync(manifestPath, "utf8");

    const run = spawnSync(process.execPath, [SCRIPT, "--root", root, "--json"], {
      encoding: "utf8",
    });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).ok, true);
    assert.equal(readFileSync(manifestPath, "utf8"), before);
  });

  it("uses committed surfaces in git mode and still reads tracked working-tree edits", () => {
    const root = cleanFixture();
    write(join(root, ".gitignore"), "dist/\n**/dist/\n");
    for (const args of [
      ["init", "--quiet"],
      ["add", "--all"],
    ]) {
      const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
    }

    write(
      join(root, "packages/memory/dist/index.js"),
      `export const name = "${UPSTREAM_MOE}-memory";\n`,
    );
    assert.equal(checkDownstreamScope(root).ok, true);

    writeJson(join(root, "plugins/moe-memory/package.json"), {
      name: `${UPSTREAM_MOE}-memory`,
    });
    const result = checkDownstreamScope(root);
    assert.ok(
      result.problems.some(
        (item) =>
          item.code === "scope.upstream-leak" &&
          item.location.startsWith("plugins/moe-memory/package.json:"),
      ),
    );
  });

  it("passes against the real committed downstream tree", () => {
    const result = checkDownstreamScope(REPOSITORY_ROOT);

    assert.deepEqual(result.problems, []);
    assert.equal(result.manifests.length, 11);
  });
});

describe("mint marketplace registry guard", () => {
  it("pins npm sources to the exact canonical downstream version", () => {
    const marketplace = rootMarketplace();

    assert.deepEqual(marketplaceProblems({ marketplace }), []);
    for (const name of ["moe-memory", "moe-glass"]) {
      const entry = npmMarketplaceEntry(marketplace, name);
      assert.equal(entry.source.version, entry.version);
      assert.equal(Object.hasOwn(entry.source, "registry"), false);
    }
  });

  it("rejects an npm source whose own version is missing", () => {
    const marketplace = rootMarketplace();
    delete npmMarketplaceEntry(marketplace, "moe-memory").source.version;

    assert.ok(
      marketplaceProblems({ marketplace }).some(
        (problem) => problem.includes("moe-memory") && problem.includes("version: undefined"),
      ),
    );
  });

  it("rejects an npm source whose own version is not the canonical version", () => {
    const marketplace = rootMarketplace();
    const canonicalVersion = JSON.parse(
      readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8"),
    ).version;
    npmMarketplaceEntry(marketplace, "moe-glass").source.version = "0.0.0-tc.999";

    assert.ok(
      marketplaceProblems({ marketplace }).some(
        (problem) =>
          problem.includes("moe-glass") &&
          problem.includes('version: "0.0.0-tc.999"') &&
          problem.includes(`version: ${JSON.stringify(canonicalVersion)}`),
      ),
    );
  });
});
