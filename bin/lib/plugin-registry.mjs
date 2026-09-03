// Canonical Moe plugin and host-harness registry.
//
// This module deliberately imports nothing, including workspace packages. It
// is consumed by the pre-install bin scripts and by scripts/mint-plugins.mjs,
// so it must remain usable before pnpm install or a TypeScript build.

export const REPOSITORY_URL = "https://github.com/zak-keown/moe";
export const REPOSITORY_CLONE_URL = `${REPOSITORY_URL}.git`;
export const MARKETPLACE_NAME = "moe";

export const HARNESS_IDS = [
  "claude-code",
  "cursor",
  "codex",
  "kimi",
  "opencode",
  "pi",
  "agent-plugins-1.0",
  "copilot",
];

const ALL_HARNESSES = [...HARNESS_IDS];
export const PLUGINS = [
  {
    name: "moe",
    pkg: "core",
    config: "mint/moe.yaml",
    repository: REPOSITORY_URL,
    distribution: { npm: "@bubstack/moe-core" },
    harnesses: [...ALL_HARNESSES],
  },
  {
    name: "moe-backstory",
    pkg: "backstory",
    config: "mint/moe-backstory.yaml",
    repository: REPOSITORY_URL,
    distribution: { npm: "@bubstack/moe-backstory" },
    harnesses: [...ALL_HARNESSES],
  },
  {
    name: "moe-memory",
    pkg: "memory",
    config: "mint/moe-memory.yaml",
    repository: REPOSITORY_URL,
    distribution: { npm: "@bubstack/moe-memory" },
    harnesses: [...ALL_HARNESSES],
  },
  {
    name: "moe-glass",
    pkg: "glass",
    config: "mint/moe-glass.yaml",
    repository: REPOSITORY_URL,
    distribution: { npm: "@bubstack/moe-glass" },
    harnesses: [...ALL_HARNESSES],
  },
  {
    name: "moe-crew",
    pkg: "crew",
    config: "mint/moe-crew.yaml",
    repository: REPOSITORY_URL,
    distribution: { npm: "@bubstack/moe-crew" },
    harnesses: [...ALL_HARNESSES],
  },
  {
    name: "moe-statusline",
    pkg: "statusline",
    config: "mint/moe-statusline.yaml",
    repository: REPOSITORY_URL,
    distribution: { npm: "@bubstack/moe-statusline" },
    harnesses: ["claude-code"],
  },
];

function marketplaceLifecycle(host, surface, action, plugins) {
  const verb = action === "upgrade" ? "update" : "remove";
  return [
    `Open ${host}'s ${surface} and ${verb} each exact marketplace plugin:`,
    ...plugins.map((plugin) => `- ${plugin.name}@${MARKETPLACE_NAME}`),
  ];
}

const CLAUDE_MANUAL = {
  install: (plugins) => [
    `Register ${REPOSITORY_CLONE_URL} in Claude Code's plugin marketplace, then install:`,
    ...plugins.map((plugin) => `- ${plugin.name}@${MARKETPLACE_NAME}`),
  ],
  upgrade: (plugins) =>
    marketplaceLifecycle("Claude Code", "`/plugins` interface", "upgrade", plugins),
  uninstall: (plugins) =>
    marketplaceLifecycle("Claude Code", "`/plugins` interface", "uninstall", plugins),
};

function cursorInstall(plugins) {
  return [
    `Clone ${REPOSITORY_CLONE_URL}. In Cursor Agent chat, use the generated \`/add-plugin\` flow for each directory:`,
    ...plugins.map(
      (plugin) =>
        `- ${plugin.name}: run \`/add-plugin\`; plugin directory \`plugins/${plugin.name}/\``,
    ),
  ];
}

function codexInstall(plugins) {
  return [
    "From Codex CLI or the Codex App plugin sidebar, use `/plugins` for each generated marketplace descriptor:",
    ...plugins.map(
      (plugin) =>
        `- ${plugin.name}: open \`/plugins\`; marketplace descriptor \`plugins/${plugin.name}/.agents/plugins/marketplace.json\``,
    ),
  ];
}

function kimiInstall(plugins) {
  return [
    "In Kimi Code, use the adapter-emitted install command for each plugin:",
    ...plugins.map((plugin) => `- ${plugin.name}: \`/plugins install ${REPOSITORY_URL}\``),
  ];
}

function opencodeInstall(plugins) {
  return [
    "Add these exact generated entries to your project's `opencode.json`:",
    '{ "plugin": [',
    ...plugins.map(
      (plugin, index) =>
        `  "${plugin.name}@git+${REPOSITORY_CLONE_URL}"${index === plugins.length - 1 ? "" : ","}`,
    ),
    "] }",
  ];
}

function piInstall(plugins) {
  return [
    "Use Pi's adapter-emitted package target for each plugin:",
    ...plugins.map((plugin) => `- ${plugin.name}: \`pi install git:github.com/zak-keown/moe\``),
  ];
}

function agentPluginsInstall(plugins) {
  return [
    `Clone ${REPOSITORY_CLONE_URL}; point the client at each generated plugin directory (root \`plugin.json\`, \`skills/\`, and \`mcp.json\` when present):`,
    ...plugins.map((plugin) => `- ${plugin.name}: \`plugins/${plugin.name}/\``),
  ];
}

function directoryLifecycle(host, action, plugins) {
  const verb = action === "upgrade" ? "reload after updating the checkout" : "remove";
  return [
    `In ${host}, ${verb} each exact plugin directory:`,
    ...plugins.map((plugin) => `- ${plugin.name}: \`plugins/${plugin.name}/\``),
  ];
}

export const HARNESSES = {
  "claude-code": {
    displayName: "Claude Code",
    executable: "claude",
    requiresWindowsBash: true,
    scopes: ["user", "project", "local"],
    automation: {
      install: "claude-marketplace",
      upgrade: null,
      uninstall: null,
    },
    manual: CLAUDE_MANUAL,
  },
  cursor: {
    displayName: "Cursor",
    executable: "cursor-agent",
    requiresWindowsBash: true,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install: cursorInstall,
      upgrade: (plugins) => directoryLifecycle("Cursor's plugin manager", "upgrade", plugins),
      uninstall: (plugins) => directoryLifecycle("Cursor's plugin manager", "uninstall", plugins),
    },
  },
  codex: {
    displayName: "Codex",
    executable: "codex",
    requiresWindowsBash: false,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install: codexInstall,
      upgrade: (plugins) =>
        marketplaceLifecycle("Codex", "`/plugins` interface", "upgrade", plugins),
      uninstall: (plugins) =>
        marketplaceLifecycle("Codex", "`/plugins` interface", "uninstall", plugins),
    },
  },
  kimi: {
    displayName: "Kimi Code",
    executable: "kimi",
    requiresWindowsBash: false,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install: kimiInstall,
      upgrade: (plugins) => marketplaceLifecycle("Kimi Code", "plugin manager", "upgrade", plugins),
      uninstall: (plugins) =>
        marketplaceLifecycle("Kimi Code", "plugin manager", "uninstall", plugins),
    },
  },
  opencode: {
    displayName: "OpenCode",
    executable: "opencode",
    requiresWindowsBash: false,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install: opencodeInstall,
      upgrade: (plugins) => [
        "Refresh these exact git-backed entries through your OpenCode configuration/package workflow:",
        ...plugins.map((plugin) => `- ${plugin.name}@git+${REPOSITORY_CLONE_URL}`),
      ],
      uninstall: (plugins) => [
        "Remove these exact entries from the `plugin` array in your OpenCode configuration:",
        ...plugins.map((plugin) => `- ${plugin.name}@git+${REPOSITORY_CLONE_URL}`),
      ],
    },
  },
  pi: {
    displayName: "Pi",
    executable: "pi",
    requiresWindowsBash: false,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install: piInstall,
      upgrade: (plugins) => marketplaceLifecycle("Pi", "package manager", "upgrade", plugins),
      uninstall: (plugins) => marketplaceLifecycle("Pi", "package manager", "uninstall", plugins),
    },
  },
  "agent-plugins-1.0": {
    displayName: "Agent Plugins 1.0 client",
    // The specification spans many clients and has no unique host executable.
    executable: null,
    requiresWindowsBash: false,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install: agentPluginsInstall,
      upgrade: (plugins) => directoryLifecycle("your Agent Plugins 1.0 client", "upgrade", plugins),
      uninstall: (plugins) =>
        directoryLifecycle("your Agent Plugins 1.0 client", "uninstall", plugins),
    },
  },
  copilot: {
    displayName: "GitHub Copilot CLI",
    executable: "copilot",
    requiresWindowsBash: true,
    scopes: [],
    automation: { install: "copilot-marketplace", upgrade: null, uninstall: null },
    manual: {
      install: (plugins) => [
        `Register ${REPOSITORY_URL} in Copilot's plugin marketplace, then install:`,
        ...plugins.map((plugin) => `- ${plugin.name}@${MARKETPLACE_NAME}`),
      ],
      upgrade: (plugins) =>
        marketplaceLifecycle("GitHub Copilot CLI", "plugin manager", "upgrade", plugins),
      uninstall: (plugins) =>
        marketplaceLifecycle("GitHub Copilot CLI", "plugin manager", "uninstall", plugins),
    },
  },
};

export function isHarnessId(value) {
  return typeof value === "string" && HARNESS_IDS.includes(value);
}

export function getHarness(id) {
  return isHarnessId(id) ? HARNESSES[id] : undefined;
}

export function pluginsForHarness(id) {
  if (!isHarnessId(id)) return [];
  return PLUGINS.filter((plugin) => plugin.harnesses.includes(id));
}

export function excludedHarnesses(plugin) {
  return HARNESS_IDS.filter((id) => !plugin.harnesses.includes(id));
}

export function manualPlanForHarness(id, action) {
  const harness = getHarness(id);
  const render = harness?.manual[action];
  if (typeof render !== "function") return [];
  return render(pluginsForHarness(id));
}

export function harnessRegistryProblems(label, names) {
  const uniqueNames = [...new Set(names)];
  const missing = HARNESS_IDS.filter((id) => !uniqueNames.includes(id));
  const extra = uniqueNames.filter((id) => !HARNESS_IDS.includes(id));
  const problems = [];
  if (missing.length > 0)
    problems.push(`${label} is missing canonical harnesses: ${missing.join(", ")}`);
  if (extra.length > 0) {
    problems.push(
      `${label} contains harnesses absent from the canonical registry: ${extra.join(", ")}`,
    );
  }
  if (missing.length === 0 && extra.length === 0 && names.length !== uniqueNames.length) {
    problems.push(`${label} contains duplicate harness names`);
  }
  if (problems.length === 0 && names.some((name, index) => name !== HARNESS_IDS[index])) {
    problems.push(`${label} order differs from the canonical registry`);
  }
  return problems;
}

export function selectHarness({ explicit, configuredDefault, installed }) {
  const valid = `Valid harnesses: ${HARNESS_IDS.join(", ")}.`;
  if (explicit !== undefined) {
    if (!isHarnessId(explicit)) {
      return { error: `Unknown harness "${explicit}" from --harness. ${valid}` };
    }
    return { id: explicit, source: "--harness" };
  }
  if (configuredDefault !== undefined) {
    if (!isHarnessId(configuredDefault)) {
      return {
        error: `Unknown harness "${configuredDefault}" from MOE_DEFAULT_HARNESS. ${valid}`,
      };
    }
    return { id: configuredDefault, source: "MOE_DEFAULT_HARNESS" };
  }
  const detected = HARNESS_IDS.filter((id) => installed.includes(id));
  if (detected.length === 1) return { id: detected[0], source: "installed executable" };
  if (detected.length > 1) {
    return {
      error: `Cannot select a harness: multiple harness executables are installed (${detected.join(", ")}). ${valid} Use --harness or MOE_DEFAULT_HARNESS.`,
    };
  }
  return {
    error: `Cannot select a harness: no supported harness executable is installed. ${valid} Use --harness or MOE_DEFAULT_HARNESS; Agent Plugins 1.0 always requires explicit selection because it has no unique executable.`,
  };
}
