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

const MANAGE_IN_HOST = {
  install: "Open the host's plugin manager and install the listed Moe plugins.",
  upgrade: "Open the host's plugin manager and update the listed Moe plugins.",
  uninstall: "Open the host's plugin manager and remove the listed Moe plugins.",
};

export const HARNESSES = {
  "claude-code": {
    displayName: "Claude Code",
    executable: "claude",
    requiresWindowsBash: true,
    scopes: ["user", "project", "local"],
    automation: {
      install: "claude-marketplace",
      upgrade: "claude-marketplace",
      uninstall: "claude-marketplace",
    },
    manual: MANAGE_IN_HOST,
  },
  cursor: {
    displayName: "Cursor",
    executable: "cursor-agent",
    requiresWindowsBash: true,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install:
        "In Cursor Agent chat, run `/add-plugin`, then point it at each listed plugin directory (or use marketplace search once listed).",
      upgrade: MANAGE_IN_HOST.upgrade,
      uninstall: MANAGE_IN_HOST.uninstall,
    },
  },
  codex: {
    displayName: "Codex",
    executable: "codex",
    requiresWindowsBash: false,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install:
        "Open `/plugins` in Codex CLI or use the Codex App plugin sidebar, then install the listed plugins.",
      upgrade: MANAGE_IN_HOST.upgrade,
      uninstall: MANAGE_IN_HOST.uninstall,
    },
  },
  kimi: {
    displayName: "Kimi Code",
    executable: "kimi",
    requiresWindowsBash: false,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install:
        "In Kimi Code, run `/plugins install https://github.com/zak-keown/moe`, then select the listed plugins.",
      upgrade: MANAGE_IN_HOST.upgrade,
      uninstall: MANAGE_IN_HOST.uninstall,
    },
  },
  opencode: {
    displayName: "OpenCode",
    executable: "opencode",
    requiresWindowsBash: false,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install:
        "Add the listed plugins to the `plugin` array in your OpenCode configuration using the generated `NAME@git+https://github.com/zak-keown/moe.git` form.",
      upgrade:
        "Update the listed git-backed entries through your OpenCode configuration/package workflow.",
      uninstall:
        "Remove the listed entries from the `plugin` array in your OpenCode configuration.",
    },
  },
  pi: {
    displayName: "Pi",
    executable: "pi",
    requiresWindowsBash: false,
    scopes: [],
    automation: { install: null, upgrade: null, uninstall: null },
    manual: {
      install:
        "Use Pi's package manager with the generated `pi install git:github.com/zak-keown/moe` target, then select the listed plugins.",
      upgrade: MANAGE_IN_HOST.upgrade,
      uninstall: MANAGE_IN_HOST.uninstall,
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
      install:
        "Clone https://github.com/zak-keown/moe.git and point your Agent Plugins 1.0 client at each listed `plugins/<name>` directory.",
      upgrade:
        "Update the clone and reload the listed plugin directories in your Agent Plugins 1.0 client.",
      uninstall:
        "Remove the listed plugin directories from your Agent Plugins 1.0 client's configuration.",
    },
  },
  copilot: {
    displayName: "GitHub Copilot CLI",
    executable: "copilot",
    requiresWindowsBash: true,
    scopes: [],
    automation: { install: "copilot-marketplace", upgrade: null, uninstall: null },
    manual: MANAGE_IN_HOST,
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
