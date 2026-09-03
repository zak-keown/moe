/**
 * The harness-driver registry: resolve a harness id to its driver. Pi (Phase C)
 * registers here as it lands.
 */
import { claude } from "./claude.js";
import { codex } from "./codex.js";
import { pi } from "./pi.js";
const DRIVERS = {
    claude,
    codex,
    pi,
};
export function getDriver(id) {
    const driver = DRIVERS[id];
    if (!driver) {
        throw new Error(`Unknown harness '${id}'. Available: ${Object.keys(DRIVERS).join(", ")}`);
    }
    return driver;
}
