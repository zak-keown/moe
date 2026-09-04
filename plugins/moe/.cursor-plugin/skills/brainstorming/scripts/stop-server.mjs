import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

export function markStopped(stateDir, reason) {
	const infoFile = path.join(stateDir, "server-info");
	try {
		fs.unlinkSync(infoFile);
	} catch {}
	const stoppedFile = path.join(stateDir, "server-stopped");
	const data = JSON.stringify({ reason, timestamp: Math.floor(Date.now() / 1000) });
	fs.writeFileSync(stoppedFile, data + "\n");
}

export function readExpectedServerId(serverIdFile) {
	if (!fs.existsSync(serverIdFile)) return null;
	try {
		const id = fs.readFileSync(serverIdFile, "utf8").replace(/[\r\n]/g, "");
		if (/^[A-Za-z0-9_-]{32,64}$/.test(id)) return id;
		return null;
	} catch {
		return null;
	}
}

export function commandLineForPid(pid) {
	const procFile = `/proc/${pid}/cmdline`;
	try {
		if (fs.existsSync(procFile)) {
			const data = fs.readFileSync(procFile);
			return data.toString().split("\0");
		}
	} catch {}
	try {
		const out = execFileSync("ps", ["-ww", "-p", String(pid), "-o", "command="], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		return out.trim().split(/\s+/);
	} catch {}
	return [];
}

export function commandHasServerId(pid, expectedId) {
	const expectedArg = `--brainstorm-server-id=${expectedId}`;
	const procFile = `/proc/${pid}/cmdline`;
	try {
		if (fs.existsSync(procFile)) {
			const data = fs.readFileSync(procFile);
			const args = data.toString().split("\0");
			return args.includes(expectedArg);
		}
	} catch {}
	const cmdParts = commandLineForPid(pid);
	return cmdParts.includes(expectedArg);
}

export function processIsAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function isBrainstormServer(pid, serverIdFile) {
	if (!processIsAlive(pid)) return false;
	const expectedId = readExpectedServerId(serverIdFile);
	if (!expectedId) return false;
	return commandHasServerId(pid, expectedId);
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

export async function stopServer(sessionDir) {
	if (!sessionDir) {
		return { status: "error", error: "Usage: stop-server.mjs <session_dir>" };
	}

	const stateDir = path.join(sessionDir, "state");
	const pidFile = path.join(stateDir, "server.pid");
	const serverIdFile = path.join(stateDir, "server-instance-id");

	if (!fs.existsSync(pidFile)) {
		return { status: "not_running" };
	}

	const pid = Number(fs.readFileSync(pidFile, "utf8").trim());

	if (!isBrainstormServer(pid, serverIdFile)) {
		try { fs.unlinkSync(pidFile); } catch {}
		try { fs.unlinkSync(serverIdFile); } catch {}
		markStopped(stateDir, "stale_pid");
		return { status: "stale_pid" };
	}

	try { process.kill(pid); } catch {}

	for (let i = 0; i < 20; i++) {
		if (!processIsAlive(pid)) break;
		await sleep(100);
	}

	if (processIsAlive(pid)) {
		try { process.kill(pid, "SIGKILL"); } catch {}
		await sleep(100);
	}

	if (processIsAlive(pid)) {
		return { status: "failed", error: "process still running" };
	}

	try { fs.unlinkSync(pidFile); } catch {}
	try { fs.unlinkSync(serverIdFile); } catch {}
	const logFile = path.join(stateDir, "server.log");
	try { fs.unlinkSync(logFile); } catch {}
	markStopped(stateDir, "stop-server.mjs");

	if (sessionDir.startsWith("/tmp/")) {
		fs.rmSync(sessionDir, { recursive: true, force: true });
	}

	return { status: "stopped" };
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
	const sessionDir = process.argv[2];
	const result = await stopServer(sessionDir);
	process.stdout.write(JSON.stringify(result) + "\n");
	if (result.status === "error" || result.status === "failed") {
		process.exit(1);
	}
}
