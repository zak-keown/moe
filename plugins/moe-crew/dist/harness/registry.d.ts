/**
 * The harness-driver registry: resolve a harness id to its driver. Pi (Phase C)
 * registers here as it lands.
 */
import type { HarnessDriver, HarnessId } from "./driver.js";
export declare const HARNESS_IDS: readonly ["claude", "codex", "pi"];
export declare function isHarnessId(value: unknown): value is HarnessId;
export declare function getDriver(id: string): HarnessDriver;
export interface HarnessDetectionOptions {
    environment?: NodeJS.ProcessEnv;
    isExecutable?: (executable: string, environment: NodeJS.ProcessEnv) => boolean;
}
/**
 * Detect installed crew harnesses by probing the executable each real driver
 * would launch. Both the environment and filesystem probe are injectable so
 * selection tests never depend on the developer machine's PATH.
 */
export declare function detectInstalledHarnesses(options?: HarnessDetectionOptions): HarnessId[];
