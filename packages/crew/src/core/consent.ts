import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureOwnedDir } from "./worker-store.js";

/** Durable, harness-neutral consent state owned by Moe. */
export function consentPath(home: string, environment: NodeJS.ProcessEnv = {}): string {
  const stateHome = environment.XDG_STATE_HOME || join(home, ".local", "state");
  return join(stateHome, "moe", "crew", "consent");
}

export function hasConsent(home: string, environment: NodeJS.ProcessEnv = {}): boolean {
  return existsSync(consentPath(home, environment));
}

export function grantConsent(home: string, environment: NodeJS.ProcessEnv = {}): void {
  const p = consentPath(home, environment);
  ensureOwnedDir(dirname(dirname(p)));
  ensureOwnedDir(dirname(p));
  writeFileSync(p, "", { mode: 0o600 });
}
