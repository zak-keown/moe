/**
 * SessionStart hook: gives a fresh Claude Code install a working statusline
 * with zero user action, by pointing settings.json's `statusLine` at the
 * vendored ccstatusline bundle — but only when the user has not already set
 * one. Claude Code plugins cannot declare `statusLine` themselves (unlike
 * hooks or MCP servers), so this is the only automatic path available; never
 * overwriting an existing value is what keeps that automation safe.
 */
export interface EnsureStatusLineOptions {
    settingsPath: string;
    vendoredScriptPath: string;
}
export interface EnsureStatusLineResult {
    wrote: boolean;
    reason: "written" | "already-set" | "unreadable-settings";
}
export declare function ensureStatusLine(opts: EnsureStatusLineOptions): EnsureStatusLineResult;
export declare function defaultSettingsPath(env?: NodeJS.ProcessEnv, homeDir?: string): string;
