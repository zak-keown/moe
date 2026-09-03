import type { CommandContext, CommandResult } from "./context.js";
export interface GrantConsentOpts {
    /**
     * Emit the risk warning to the user. Called BEFORE `confirm` so the user sees
     * the full warning before being asked to type 'yes' (bash prints the heredoc,
     * THEN reads). Defaults to a no-op for callers that do not surface it.
     */
    warn?: (text: string) => void;
    /** Called after the warning is displayed. Return true if the user typed 'yes'. */
    confirm: () => Promise<boolean>;
}
export declare function cmdGrantConsent(ctx: CommandContext, opts: GrantConsentOpts): Promise<CommandResult>;
