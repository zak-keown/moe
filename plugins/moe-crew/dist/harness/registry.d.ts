/**
 * The harness-driver registry: resolve a harness id to its driver. Pi (Phase C)
 * registers here as it lands.
 */
import type { HarnessDriver } from "./driver.js";
export declare function getDriver(id: string): HarnessDriver;
