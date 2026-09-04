import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const MOD_PATH = path.resolve(
	__dirname,
	"../../skills/brainstorming/scripts/stop-server.mjs",
);

const mod = await import(pathToFileURL(MOD_PATH).href);
const {
	markStopped,
	readExpectedServerId,
	processIsAlive,
	stopServer,
} = mod;

const SERVER_PATH = path.resolve(
	__dirname,
	"../../skills/brainstorming/scripts/server.mjs",
);

const tmpDirs: string[] = [];
const childPids: number[] = [];

function makeTmp(): string {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "bs-stop-test-"));
	tmpDirs.push(d);
	return d;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

afterEach(async () => {
	for (const pid of childPids) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}
	childPids.length = 0;
	for (const d of tmpDirs) {
		fs.rmSync(d, { recursive: true, force: true });
	}
	tmpDirs.length = 0;
});

describe("markStopped", () => {
	it("removes server-info and writes server-stopped", () => {
		const dir = makeTmp();
		const stateDir = path.join(dir, "state");
		fs.mkdirSync(stateDir, { recursive: true });
		fs.writeFileSync(path.join(stateDir, "server-info"), "{}");
		markStopped(stateDir, "test-reason");
		expect(fs.existsSync(path.join(stateDir, "server-info"))).toBe(false);
		const stopped = JSON.parse(
			fs.readFileSync(path.join(stateDir, "server-stopped"), "utf8"),
		);
		expect(stopped.reason).toBe("test-reason");
		expect(stopped.timestamp).toBeGreaterThan(0);
	});
});

describe("readExpectedServerId", () => {
	it("returns the id from a valid file", () => {
		const dir = makeTmp();
		const file = path.join(dir, "server-instance-id");
		fs.writeFileSync(file, "abcdef0123456789abcdef0123456789\n");
		expect(readExpectedServerId(file)).toBe(
			"abcdef0123456789abcdef0123456789",
		);
	});

	it("returns null for missing file", () => {
		expect(readExpectedServerId("/nonexistent/file")).toBeNull();
	});

	it("returns null for malformed id (too short)", () => {
		const dir = makeTmp();
		const file = path.join(dir, "server-instance-id");
		fs.writeFileSync(file, "tooshort\n");
		expect(readExpectedServerId(file)).toBeNull();
	});

	it("returns null for id with spaces", () => {
		const dir = makeTmp();
		const file = path.join(dir, "server-instance-id");
		fs.writeFileSync(file, "bad id with spaces 01234567890123\n");
		expect(readExpectedServerId(file)).toBeNull();
	});

	it("strips trailing newline and CR", () => {
		const dir = makeTmp();
		const file = path.join(dir, "server-instance-id");
		fs.writeFileSync(file, "abcdef0123456789abcdef0123456789\r\n");
		expect(readExpectedServerId(file)).toBe(
			"abcdef0123456789abcdef0123456789",
		);
	});
});

describe("processIsAlive", () => {
	it("returns true for a live process", () => {
		expect(processIsAlive(process.pid)).toBe(true);
	});

	it("returns false for a nonexistent PID", () => {
		expect(processIsAlive(99999999)).toBe(false);
	});
});

describe("stopServer", () => {
	it("returns error for empty session dir", async () => {
		const result = await stopServer("");
		expect(result.status).toBe("error");
	});

	it("returns not_running when no pid file exists", async () => {
		const dir = makeTmp();
		fs.mkdirSync(path.join(dir, "state"), { recursive: true });
		const result = await stopServer(dir);
		expect(result.status).toBe("not_running");
	});

	it("returns stale_pid for an unrelated process", async () => {
		const dir = makeTmp();
		const stateDir = path.join(dir, "state");
		fs.mkdirSync(stateDir, { recursive: true });

		const child = spawn("sleep", ["600"], { detached: true, stdio: "ignore" });
		child.unref();
		childPids.push(child.pid!);

		fs.writeFileSync(path.join(stateDir, "server.pid"), String(child.pid));
		const result = await stopServer(dir);
		expect(result.status).toBe("stale_pid");
		expect(processIsAlive(child.pid!)).toBe(true);
	});

	it("stops a real brainstorm server with matching instance id", async () => {
		const dir = makeTmp();
		const stateDir = path.join(dir, "state");
		const contentDir = path.join(dir, "content");
		fs.mkdirSync(stateDir, { recursive: true });
		fs.mkdirSync(contentDir, { recursive: true });

		const serverId = `testid${String(Date.now()).padStart(26, "0")}`.slice(
			0,
			32,
		);
		fs.writeFileSync(
			path.join(stateDir, "server-instance-id"),
			serverId + "\n",
		);

		const child = spawn(
			"node",
			[SERVER_PATH, `--brainstorm-server-id=${serverId}`],
			{
				env: {
					...process.env,
					BRAINSTORM_DIR: dir,
					BRAINSTORM_PORT: "0",
				},
				stdio: "ignore",
				detached: true,
			},
		);
		child.unref();
		childPids.push(child.pid!);
		fs.writeFileSync(path.join(stateDir, "server.pid"), String(child.pid));

		for (let i = 0; i < 50; i++) {
			if (fs.existsSync(path.join(stateDir, "server-info"))) break;
			await sleep(100);
		}

		const result = await stopServer(dir);
		await sleep(300);
		expect(result.status).toBe("stopped");
		expect(processIsAlive(child.pid!)).toBe(false);
	});

	it("writes server-stopped metadata for persistent sessions", async () => {
		const dir = makeTmp();
		const stateDir = path.join(dir, "state");
		const contentDir = path.join(dir, "content");
		fs.mkdirSync(stateDir, { recursive: true });
		fs.mkdirSync(contentDir, { recursive: true });

		const serverId = `testid${String(Date.now()).padStart(26, "0")}`.slice(
			0,
			32,
		);
		fs.writeFileSync(
			path.join(stateDir, "server-instance-id"),
			serverId + "\n",
		);

		const child = spawn(
			"node",
			[SERVER_PATH, `--brainstorm-server-id=${serverId}`],
			{
				env: {
					...process.env,
					BRAINSTORM_DIR: dir,
					BRAINSTORM_PORT: "0",
				},
				stdio: "ignore",
				detached: true,
			},
		);
		child.unref();
		childPids.push(child.pid!);
		fs.writeFileSync(path.join(stateDir, "server.pid"), String(child.pid));

		for (let i = 0; i < 50; i++) {
			if (fs.existsSync(path.join(stateDir, "server-info"))) break;
			await sleep(100);
		}

		await stopServer(dir);
		await sleep(300);

		expect(fs.existsSync(path.join(stateDir, "server-info"))).toBe(false);
		expect(fs.existsSync(path.join(stateDir, "server-stopped"))).toBe(true);
		const stopped = JSON.parse(
			fs.readFileSync(path.join(stateDir, "server-stopped"), "utf8"),
		);
		expect(stopped.reason).toBe("stop-server.mjs");
	});

	it("returns stale_pid for impostor with missing instance id", async () => {
		const dir = makeTmp();
		const stateDir = path.join(dir, "state");
		fs.mkdirSync(stateDir, { recursive: true });

		const child = spawn("sleep", ["600"], { detached: true, stdio: "ignore" });
		child.unref();
		childPids.push(child.pid!);

		fs.writeFileSync(path.join(stateDir, "server.pid"), String(child.pid));

		const result = await stopServer(dir);
		expect(result.status).toBe("stale_pid");
		expect(processIsAlive(child.pid!)).toBe(true);
	});

	it("returns stale_pid for impostor with wrong instance id", async () => {
		const dir = makeTmp();
		const stateDir = path.join(dir, "state");
		fs.mkdirSync(stateDir, { recursive: true });

		const expectedId = `expected${String(Date.now()).padStart(24, "0")}`.slice(
			0,
			32,
		);
		fs.writeFileSync(
			path.join(stateDir, "server-instance-id"),
			expectedId + "\n",
		);

		const child = spawn("sleep", ["600"], { detached: true, stdio: "ignore" });
		child.unref();
		childPids.push(child.pid!);

		fs.writeFileSync(path.join(stateDir, "server.pid"), String(child.pid));

		const result = await stopServer(dir);
		expect(result.status).toBe("stale_pid");
		expect(processIsAlive(child.pid!)).toBe(true);
	});
});
