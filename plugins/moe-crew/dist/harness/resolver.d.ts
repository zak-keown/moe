import type { HarnessId } from "./driver.js";
export type HarnessResolutionSource = "worker" | "command" | "pack" | "environment" | "installed";
export interface HarnessResolutionInput {
    /** Persisted worker metadata or a pack worker's explicit override. */
    worker?: unknown;
    /** `--harness`, used as the command-wide default. */
    command?: unknown;
    /** A pack's `defaultHarness`. */
    pack?: unknown;
    /** `MOE_CREW_DEFAULT_HARNESS`. */
    environment?: unknown;
    /** Harnesses whose configured executables were detected as installed. */
    installed: readonly HarnessId[];
}
export interface HarnessResolutionSuccess {
    ok: true;
    harness: HarnessId;
    source: HarnessResolutionSource;
}
export interface HarnessResolutionFailure {
    ok: false;
    code: 2;
    diagnostic: string;
}
export type HarnessResolution = HarnessResolutionSuccess | HarnessResolutionFailure;
/**
 * Resolve one crew harness through the complete, deterministic precedence
 * chain. A present but invalid higher-precedence value is an error: corrupt
 * worker state must never disappear behind a valid lower default.
 */
export declare function resolveHarness(input: HarnessResolutionInput): HarnessResolution;
