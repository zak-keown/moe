export interface CodexSummarizerCommand {
    command: string;
    args: string[];
    prompt: string;
    sessionId: string;
    model?: string | undefined;
    versionArgs?: string[] | undefined;
    skipVersionCheck?: boolean | undefined;
}
export declare function getApiEnv(): Record<string, string | undefined>;
export declare function runCodexCommand(command: CodexSummarizerCommand): Promise<string>;
export declare function buildCodexSummarizerCommand(args: {
    sessionId: string;
    prompt: string;
    model?: string | undefined;
    codexBin?: string | undefined;
}): CodexSummarizerCommand;
