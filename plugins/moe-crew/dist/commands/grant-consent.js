import { consentPath, grantConsent, hasConsent } from "../core/consent.js";
const PREAMBLE = `moe-crew runs workers with --dangerously-skip-permissions.
Workers execute tool calls without prompting. By granting consent, you
acknowledge this risk and accept responsibility for any actions the
worker takes.`;
export async function cmdGrantConsent(ctx, opts) {
    const path = consentPath(ctx.home);
    if (hasConsent(ctx.home)) {
        return { stdout: `Consent already granted at ${path}`, code: 0 };
    }
    // Show the risk warning BEFORE prompting, matching bash (heredoc, then read).
    opts.warn?.(PREAMBLE);
    const confirmed = await opts.confirm();
    if (!confirmed) {
        return {
            stderr: "Consent not granted.",
            code: 1,
        };
    }
    grantConsent(ctx.home);
    return {
        stdout: `Consent granted. Written: ${path}`,
        code: 0,
    };
}
