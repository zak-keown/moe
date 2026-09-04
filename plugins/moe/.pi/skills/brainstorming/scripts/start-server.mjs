import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export function parseArgs(argv) {
	const opts = {
		projectDir: "",
		foreground: false,
		forceBackground: false,
		bindHost: "127.0.0.1",
		urlHost: "",
		idleTimeoutMinutes: "",
		open: false,
	};
	let i = 0;
	while (i < argv.length) {
		switch (argv[i]) {
			case "--project-dir":
				opts.projectDir = argv[++i] ?? "";
				break;
			case "--host":
				opts.bindHost = argv[++i] ?? "";
				break;
			case "--url-host":
				opts.urlHost = argv[++i] ?? "";
				break;
			case "--idle-timeout-minutes":
				opts.idleTimeoutMinutes = argv[++i] ?? "";
				break;
			case "--open":
				opts.open = true;
				break;
			case "--foreground":
			case "--no-daemon":
				opts.foreground = true;
				break;
			case "--background":
			case "--daemon":
				opts.forceBackground = true;
				break;
			default:
				return { error: `Unknown argument: ${argv[i]}` };
		}
		i++;
	}
	return opts;
}

export function resolveUrlHost(bindHost) {
	if (bindHost === "127.0.0.1" || bindHost === "localhost") return "localhost";
	return bindHost;
}

export function validateIdleTimeout(minutes) {
	if (minutes === "" || minutes === undefined) return { valid: true, ms: undefined };
	const n = Number(minutes);
	if (!Number.isInteger(n) || n < 1) {
		return { valid: false, error: "--idle-timeout-minutes must be a positive integer" };
	}
	return { valid: true, ms: n * 60 * 1000 };
}

export function isWindowsLikeEnv(env = process.env) {
	const ostype = (env.OSTYPE ?? "").toLowerCase();
	if (/^msys|^cygwin|^mingw/.test(ostype)) return true;
	if (env.MSYSTEM) return true;
	return false;
}

export function createSessionDirExclusive(sessionDir) {
	const parent = path.dirname(sessionDir);
	fs.mkdirSync(parent, { recursive: true });
	fs.mkdirSync(sessionDir);
}

export function generateServerId() {
	const buf = crypto.randomBytes(24);
	return buf.toString("hex");
}

export function generateSessionId() {
	return `${process.pid}-${Math.floor(Date.now() / 1000)}`;
}

export function shouldAutoForeground(opts, env = process.env) {
	if (opts.foreground) return true;
	if (opts.forceBackground) return false;
	if (env.CODEX_CI) return true;
	if (isWindowsLikeEnv(env)) return true;
	return false;
}

export function resolveOwnerPid(env = process.env) {
	if (isWindowsLikeEnv(env)) return "";
	if (env.BRAINSTORM_OWNER_PID) return env.BRAINSTORM_OWNER_PID;
	return String(process.ppid || "");
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
	const argv = process.argv.slice(2);
	const opts = parseArgs(argv);

	if (opts.error) {
		process.stdout.write(JSON.stringify({ error: opts.error }) + "\n");
		process.exit(1);
	}

	if (!opts.urlHost) {
		opts.urlHost = resolveUrlHost(opts.bindHost);
	}

	const timeout = validateIdleTimeout(opts.idleTimeoutMinutes);
	if (!timeout.valid) {
		process.stdout.write(JSON.stringify({ error: timeout.error }) + "\n");
		process.exit(1);
	}

	const useForeground = shouldAutoForeground(opts);

	const oldMask = process.umask(0o077);

	const sessionId = generateSessionId();
	let sessionDir;
	let portFile;
	let tokenFile;

	if (opts.projectDir) {
		sessionDir = path.join(opts.projectDir, ".moe", "brainstorm", sessionId);
		portFile = path.join(opts.projectDir, ".moe", "brainstorm", ".last-port");
		tokenFile = path.join(opts.projectDir, ".moe", "brainstorm", ".last-token");
	} else {
		sessionDir = path.join("/tmp", `brainstorm-${sessionId}`);
		portFile = "";
		tokenFile = "";
	}

	try {
		createSessionDirExclusive(sessionDir);
	} catch {
		process.stdout.write(JSON.stringify({ error: `Session directory already exists: ${sessionDir}` }) + "\n");
		process.exit(1);
	}

	const stateDir = path.join(sessionDir, "state");
	const contentDir = path.join(sessionDir, "content");
	fs.mkdirSync(stateDir, { recursive: true });
	fs.mkdirSync(contentDir, { recursive: true });

	const serverId = generateServerId();
	const serverIdFile = path.join(stateDir, "server-instance-id");
	fs.writeFileSync(serverIdFile, serverId + "\n", { mode: 0o600 });

	const pidFile = path.join(stateDir, "server.pid");
	if (fs.existsSync(pidFile)) {
		try {
			const oldPid = Number(fs.readFileSync(pidFile, "utf8").trim());
			if (oldPid) process.kill(oldPid);
		} catch {}
		fs.unlinkSync(pidFile);
	}

	const ownerPid = resolveOwnerPid();
	const serverScript = path.join(__dirname, "server.mjs");

	const env = {
		...process.env,
		BRAINSTORM_DIR: sessionDir,
		BRAINSTORM_HOST: opts.bindHost,
		BRAINSTORM_URL_HOST: opts.urlHost,
		BRAINSTORM_OWNER_PID: ownerPid,
	};

	if (portFile) env.BRAINSTORM_PORT_FILE = portFile;
	if (tokenFile) env.BRAINSTORM_TOKEN_FILE = tokenFile;
	if (opts.open) env.BRAINSTORM_OPEN = "1";
	if (timeout.ms !== undefined) env.BRAINSTORM_IDLE_TIMEOUT_MS = String(timeout.ms);

	if (useForeground) {
		const child = spawn("node", [serverScript, `--brainstorm-server-id=${serverId}`], {
			env,
			stdio: ["ignore", "pipe", "pipe"],
			cwd: __dirname,
		});
		const serverPid = child.pid;
		fs.writeFileSync(pidFile, String(serverPid) + "\n");

		child.stdout.on("data", (d) => {
			process.stdout.write(d);
		});
		child.stderr.on("data", (d) => {
			process.stderr.write(d);
		});

		child.on("exit", (code) => {
			process.exit(code ?? 1);
		});
	} else {
		const logFile = path.join(stateDir, "server.log");
		const logFd = fs.openSync(logFile, "w");

		const child = spawn("node", [serverScript, `--brainstorm-server-id=${serverId}`], {
			env,
			stdio: ["ignore", logFd, logFd],
			cwd: __dirname,
			detached: true,
		});
		const serverPid = child.pid;
		fs.writeFileSync(pidFile, String(serverPid) + "\n");
		child.unref();
		fs.closeSync(logFd);

		const deadline = Date.now() + 5000;
		let started = false;
		while (Date.now() < deadline) {
			try {
				const log = fs.readFileSync(logFile, "utf8");
				if (log.includes("server-started")) {
					const startedLine = log.split("\n").find((l) => l.includes("server-started"));
					if (startedLine) {
						let stillAlive = true;
						for (let i = 0; i < 20; i++) {
							try {
								process.kill(serverPid, 0);
							} catch {
								stillAlive = false;
								break;
							}
							await sleep(100);
						}
						if (!stillAlive) {
							const retryCmd = `${process.argv[1]}${opts.projectDir ? ` --project-dir ${opts.projectDir}` : ""} --host ${opts.bindHost} --url-host ${opts.urlHost} --foreground`;
							process.stdout.write(JSON.stringify({ error: `Server started but was killed. Retry in a persistent terminal with: ${retryCmd}` }) + "\n");
							process.exit(1);
						}
						process.stdout.write(startedLine + "\n");
						started = true;
						break;
					}
				}
			} catch {}
			await sleep(100);
		}

		if (!started) {
			process.stdout.write('{"error": "Server failed to start within 5 seconds"}\n');
			process.exit(1);
		}
	}

	process.umask(oldMask);
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}
