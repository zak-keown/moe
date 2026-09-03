import type { HarnessId } from "../harness/driver.js";
/**
 * A single worker definition inside a pack. Harness-agnostic data: the YAML
 * carries the role prompt and an optional harness override; the CLI maps each
 * entry to a `cmdLaunch` + `cmdSend` pair.
 */
export interface PackWorker {
    /** Prefix for the worker's tmux session name (suffixed with `-<index>`). */
    namePrefix: string;
    /** Harness override for this worker; it outranks every default source. */
    harness?: HarnessId | undefined;
    /** Extra CLI args forwarded to the harness binary (the tokens after `--`). */
    harnessArgs?: string[] | undefined;
    /** The initial prompt sent to the worker after launch. */
    rolePrompt: string;
}
/**
 * A pack definition: a named set of workers launched together as a unit.
 * Packs are harness-agnostic YAML — the HarnessDriver abstraction already
 * supports per-worker harness selection via --harness.
 */
export interface PackDefinition {
    name: string;
    description?: string | undefined;
    /** Pack-local default, below `--harness` and above the environment default. */
    defaultHarness?: HarnessId | undefined;
    workers: PackWorker[];
}
/**
 * Minimal YAML subset parser for pack files. Handles the flat key/value
 * scalars, block sequences of mappings, and YAML block-scalar (`|`) multiline
 * strings that pack files use. Does NOT handle the full YAML spec — pack files
 * are intentionally simple. Falls back to JSON when the file extension is
 * `.json`.
 */
export declare function parsePackYaml(text: string): unknown;
/**
 * Load and validate a pack definition from a YAML (or JSON) file.
 * Throws on missing file, parse errors, or validation failures.
 */
export declare function loadPack(path: string): PackDefinition;
