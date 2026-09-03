import { spawn } from "node:child_process";

export interface ProcessSpec {
  command: string;
  args: readonly string[];
  cwd?: string;
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

export function createChildProcessAdapter(): ProcessAdapter {
  return {
    async run(spec: ProcessSpec): Promise<ProcessResult> {
      return new Promise((resolve, reject) => {
        const child = spawn(spec.command, spec.args as string[], {
          cwd: spec.cwd,
          env: { ...spec.env, NODE_OPTIONS: undefined },
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let stderrBytes = 0;
        let finished = false;

        const timeout = setTimeout(() => {
          if (!finished) {
            finished = true;
            child.kill("SIGTERM");
            reject(new Error(`Process timed out after ${spec.timeoutMs}ms`));
          }
        }, spec.timeoutMs);

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          if (stderrBytes < spec.maxStderrBytes) {
            stderr += text.slice(0, spec.maxStderrBytes - stderrBytes);
          }
          stderrBytes += Buffer.byteLength(text);
        });

        child.on("error", (error) => {
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            reject(error);
          }
        });

        child.on("exit", (code, signal) => {
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            resolve({
              code: code ?? 1,
              signal: signal ?? null,
              stdout,
              stderr,
            });
          }
        });

        if (spec.stdin) {
          child.stdin.write(spec.stdin);
        }
        child.stdin.end();
      });
    },
  };
}
