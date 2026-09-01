// TC-downstream distribution metadata shared by the dependency-free CLI.
//
// Keep package identity explicit. In particular, a namespace name does not
// imply that an npm package exists or that a package carrying the name ships
// the corresponding executable.

export const UMBRELLA_PACKAGE = "@tc/moe";

export const MARKETPLACE = Object.freeze({
  name: "moe",
  repository: "https://gitlab.tcdevops.com/Zak/moe.git",
  sparsePaths: Object.freeze([".claude-plugin", "plugins"]),
  plugins: Object.freeze([
    "moe-core",
    "moe-everything",
    "moe-backstory",
    "moe-crew",
    "moe-memory",
    "moe-glass",
  ]),
});

export const NAMESPACE_DISTRIBUTIONS = Object.freeze({
  crew: Object.freeze({
    bin: "moe-crew",
    workspace: "packages/crew/dist/moe-crew.cjs",
    packageName: "@tc/moe-crew",
    npmCli: true,
    description: "Launch and monitor worker sessions over tmux.",
  }),
  flight: Object.freeze({
    bin: "moe-flight",
    workspace: "packages/flight/dist/cli.js",
    packageName: "@tc/moe-flight",
    npmCli: false,
    availability: "private source-only tool; not distributed",
    description: "Drive web/CLI/TUI targets through acceptance criteria and grade them.",
  }),
  glass: Object.freeze({
    bin: "moe-glass",
    workspace: "packages/glass/dist/index.js",
    packageName: "@tc/moe-glass",
    npmCli: true,
    description: "Zero-dependency Chrome DevTools Protocol client (MCP: moe-glass).",
  }),
  memory: Object.freeze({
    bin: "moe-memory",
    workspace: "packages/memory/dist/cli.js",
    packageName: "@tc/moe-memory",
    npmCli: true,
    description: "Semantic recall over past sessions and journal entries (MCP: moe-memory).",
  }),
  mint: Object.freeze({
    bin: "moe-mint",
    workspace: "packages/mint/dist/cli.js",
    packageName: "@tc/moe-mint",
    npmCli: true,
    description: "Generate native plugin manifests for every harness from one config.",
  }),
  proof: Object.freeze({
    bin: "moe-proof",
    workspace: "py/proof",
    runner: "uv",
    packageName: null,
    npmCli: false,
    availability: "Python source-only eval tool; no npm package",
    description: "Evals against small models (Python).",
  }),
  tab: Object.freeze({
    bin: "moe-tab",
    workspace: "packages/tab/target/release/moe-tab",
    packageName: "@tc/moe-tab",
    npmCli: false,
    availability: "native source-built CLI; @tc/moe-tab publishes bindings only",
    description: "Price an agent transcript — what the run cost you.",
  }),
});

export const NPM_CLI_PACKAGES = Object.freeze(
  Object.values(NAMESPACE_DISTRIBUTIONS)
    .filter((entry) => entry.npmCli)
    .map((entry) => entry.packageName),
);
