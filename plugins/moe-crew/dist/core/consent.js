import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
export function consentPath(home) {
    return `${home}/.claude/.moe-crew-consent`;
}
export function hasConsent(home) {
    return existsSync(consentPath(home));
}
export function grantConsent(home) {
    const p = consentPath(home);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, "");
}
