import { HARNESS_IDS, isHarnessId } from "./registry.js";
const SOURCE_LABELS = {
    worker: "worker harness",
    command: "harness",
    pack: "pack default harness",
    environment: "MOE_CREW_DEFAULT_HARNESS",
};
/**
 * Resolve one crew harness through the complete, deterministic precedence
 * chain. A present but invalid higher-precedence value is an error: corrupt
 * worker state must never disappear behind a valid lower default.
 */
export function resolveHarness(input) {
    for (const source of ["worker", "command", "pack", "environment"]) {
        const value = input[source];
        if (value === undefined || value === null)
            continue;
        if (!isHarnessId(value)) {
            const rendered = typeof value === "string" ? `'${value}'` : JSON.stringify(value);
            const prefix = source === "command" ? "Unknown harness" : `Unknown ${SOURCE_LABELS[source]}`;
            const suffix = source === "command" ? " from command" : "";
            return {
                ok: false,
                code: 2,
                diagnostic: `${prefix} ${rendered}${suffix}. Valid harnesses: ${HARNESS_IDS.join(", ")}`,
            };
        }
        return { ok: true, harness: value, source };
    }
    const installed = HARNESS_IDS.filter((id) => input.installed.includes(id));
    if (installed.length === 1) {
        const harness = installed[0];
        if (harness !== undefined)
            return { ok: true, harness, source: "installed" };
    }
    if (installed.length > 1) {
        return {
            ok: false,
            code: 2,
            diagnostic: `Cannot select a crew harness: multiple crew harnesses are installed (${installed.join(", ")}). Use --harness, a pack defaultHarness, or MOE_CREW_DEFAULT_HARNESS.`,
        };
    }
    return {
        ok: false,
        code: 2,
        diagnostic: `Cannot select a crew harness: no supported crew harness is installed. Valid harnesses: ${HARNESS_IDS.join(", ")}. Use --harness or MOE_CREW_DEFAULT_HARNESS after installing its executable.`,
    };
}
