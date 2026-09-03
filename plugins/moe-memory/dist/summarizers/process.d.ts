export interface ProcessSpec {
    command: string;
    args: readonly string[];
    cwd?: string | undefined;
    env: NodeJS.ProcessEnv;
    stdin: string;
    timeoutMs: number;
    maxStderrBytes: number;
}
export interface ProcessResult {
    code: number;
    signal: string | null;
    stdout: string;
    stderr: string;
}
export interface ProcessAdapter {
    run(spec: ProcessSpec): Promise<ProcessResult>;
}
export declare function createChildProcessAdapter(): ProcessAdapter;
