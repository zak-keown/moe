/**
 * The harness-driver registry: resolve a harness id to its driver. Pi (Phase C)
 * registers here as it lands.
 */

import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { claude } from "./claude.js";
import { codex } from "./codex.js";
import type { HarnessDriver, HarnessId } from "./driver.js";
import { pi } from "./pi.js";

export const HARNESS_IDS = ["claude", "codex", "pi"] as const satisfies readonly HarnessId[];

const DRIVERS: Record<HarnessId, HarnessDriver> = {
  claude,
  codex,
  pi,
};

export function isHarnessId(value: unknown): value is HarnessId {
  return typeof value === "string" && HARNESS_IDS.includes(value as HarnessId);
}

export function getDriver(id: string): HarnessDriver {
  const driver = DRIVERS[id as HarnessId];
  if (!driver) {
    throw new Error(`Unknown harness '${id}'. Available: ${Object.keys(DRIVERS).join(", ")}`);
  }
  return driver;
}

export interface HarnessDetectionOptions {
  environment?: NodeJS.ProcessEnv;
  isExecutable?: (executable: string, environment: NodeJS.ProcessEnv) => boolean;
}

/** Resolve a binary name through PATH, or check an explicit path directly. */
function isExecutableOnPath(executable: string, environment: NodeJS.ProcessEnv): boolean {
  const candidates = executable.includes("/")
    ? [executable]
    : (environment.PATH ?? "")
        .split(delimiter)
        .filter(Boolean)
        .map((dir) => join(dir, executable));
  return candidates.some((candidate) => {
    try {
      if (!statSync(candidate).isFile()) return false;
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Detect installed crew harnesses by probing the executable each real driver
 * would launch. Both the environment and filesystem probe are injectable so
 * selection tests never depend on the developer machine's PATH.
 */
export function detectInstalledHarnesses(options: HarnessDetectionOptions = {}): HarnessId[] {
  const environment = options.environment ?? process.env;
  const probe = options.isExecutable ?? isExecutableOnPath;
  return HARNESS_IDS.filter((id) => probe(getDriver(id).bin(environment), environment));
}
