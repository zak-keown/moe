export type RunResult = {
    stdout: string;
    stderr: string;
    code: number;
};
export type Runner = (cmd: string, args: string[]) => Promise<RunResult>;
/**
 * Thin execFile wrapper that always resolves (never rejects).
 * On process exit with non-zero code, resolves with that code.
 * On spawn failure (ENOENT etc.), resolves with code 1 and the error in stderr.
 * This lets callers branch on `code` just like checking `$?` in bash.
 *
 * IMPORTANT: execFile with an args array never invokes a shell, making
 * shell-quoting/injection bugs impossible by construction.
 */
export declare const run: Runner;
