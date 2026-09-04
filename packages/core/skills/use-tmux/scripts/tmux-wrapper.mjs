import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function tmuxRun(action, sessionName, extraArgs = []) {
	switch (action) {
		case "start": {
			const command = extraArgs[0] || "bash";
			const commandArgs = extraArgs.slice(1);
			const tmuxArgs = [
				"new-session",
				"-d",
				"-s",
				sessionName,
				command,
				...commandArgs,
			];
			const r = spawnSync("tmux", tmuxArgs, { stdio: "pipe", encoding: "utf8" });
			if (r.status !== 0) {
				return {
					status: r.status ?? 1,
					stdout: "",
					stderr: r.stderr || `tmux exited ${r.status}`,
				};
			}
			const cap = spawnSync(
				"tmux",
				["capture-pane", "-t", sessionName, "-p"],
				{ stdio: "pipe", encoding: "utf8" },
			);
			return {
				status: 0,
				stdout: `Session: ${sessionName}\n---\n${cap.stdout}`,
				stderr: "",
			};
		}

		case "send": {
			if (extraArgs.length === 0) {
				return {
					status: 1,
					stdout: "",
					stderr: "Error: No input provided\n",
				};
			}
			const r = spawnSync(
				"tmux",
				["send-keys", "-t", sessionName, ...extraArgs],
				{ stdio: "pipe", encoding: "utf8" },
			);
			if (r.status !== 0) {
				return {
					status: r.status ?? 1,
					stdout: "",
					stderr: r.stderr || `tmux exited ${r.status}`,
				};
			}
			const cap = spawnSync(
				"tmux",
				["capture-pane", "-t", sessionName, "-p"],
				{ stdio: "pipe", encoding: "utf8" },
			);
			return {
				status: 0,
				stdout: `Session: ${sessionName}\n---\n${cap.stdout}`,
				stderr: "",
			};
		}

		case "capture": {
			const r = spawnSync(
				"tmux",
				["capture-pane", "-t", sessionName, "-p"],
				{ stdio: "pipe", encoding: "utf8" },
			);
			if (r.status !== 0) {
				return {
					status: r.status ?? 1,
					stdout: "",
					stderr: r.stderr || `tmux exited ${r.status}`,
				};
			}
			return {
				status: 0,
				stdout: `Session: ${sessionName}\n---\n${r.stdout}`,
				stderr: "",
			};
		}

		case "stop": {
			const r = spawnSync("tmux", ["kill-session", "-t", sessionName], {
				stdio: "pipe",
				encoding: "utf8",
			});
			if (r.status !== 0) {
				return {
					status: r.status ?? 1,
					stdout: "",
					stderr: r.stderr || `tmux exited ${r.status}`,
				};
			}
			return {
				status: 0,
				stdout: `Session ${sessionName} terminated\n`,
				stderr: "",
			};
		}

		case "list": {
			const r = spawnSync("tmux", ["list-sessions"], {
				stdio: "pipe",
				encoding: "utf8",
			});
			return {
				status: r.status ?? 0,
				stdout: r.stdout,
				stderr: r.stderr,
			};
		}

		default:
			return { status: 1, stdout: "", stderr: usage() };
	}
}

function usage() {
	return `Usage: node tmux-wrapper.mjs <action> <session-name> [args...]

Actions:
  start <session-name> <command> [args...]  - Start a new interactive session
  send <session-name> <input>               - Send input to session (use Enter for newline)
  capture <session-name>                    - Capture current pane output
  stop <session-name>                       - Terminate session
  list                                      - List all sessions

Examples:
  node tmux-wrapper.mjs start python_session python3 -i
  node tmux-wrapper.mjs send python_session 'print("hello")' Enter
  node tmux-wrapper.mjs capture python_session
  node tmux-wrapper.mjs stop python_session
`;
}

function isDirectEntry() {
	try {
		const thisFile = new URL(import.meta.url).pathname;
		const realArgv = realpathSync(process.argv[1] ?? "");
		const realThis = realpathSync(thisFile);
		return realArgv === realThis;
	} catch {
		return false;
	}
}

if (isDirectEntry()) {
	const args = process.argv.slice(2);
	const action = args[0] || "";
	const sessionName = args[1] || "";

	if (!action || (action !== "list" && !sessionName)) {
		process.stderr.write(usage());
		process.exit(1);
	}

	const result = tmuxRun(action, sessionName, args.slice(2));
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	process.exit(result.status);
}
