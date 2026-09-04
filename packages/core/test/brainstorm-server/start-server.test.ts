import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const MOD_PATH = path.resolve(
	__dirname,
	"../../skills/brainstorming/scripts/start-server.mjs",
);

const mod = await import(pathToFileURL(MOD_PATH).href);
const {
	parseArgs,
	resolveUrlHost,
	validateIdleTimeout,
	isWindowsLikeEnv,
	createSessionDirExclusive,
	generateServerId,
	generateSessionId,
	shouldAutoForeground,
	resolveOwnerPid,
} = mod;

const tmpDirs: string[] = [];

function makeTmp(): string {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "bs-start-test-"));
	tmpDirs.push(d);
	return d;
}

afterEach(() => {
	for (const d of tmpDirs) {
		fs.rmSync(d, { recursive: true, force: true });
	}
	tmpDirs.length = 0;
});

describe("parseArgs", () => {
	it("parses all supported flags", () => {
		const opts = parseArgs([
			"--project-dir",
			"/p",
			"--host",
			"0.0.0.0",
			"--url-host",
			"myhost",
			"--idle-timeout-minutes",
			"5",
			"--open",
			"--foreground",
		]);
		expect(opts.projectDir).toBe("/p");
		expect(opts.bindHost).toBe("0.0.0.0");
		expect(opts.urlHost).toBe("myhost");
		expect(opts.idleTimeoutMinutes).toBe("5");
		expect(opts.open).toBe(true);
		expect(opts.foreground).toBe(true);
	});

	it("returns defaults for empty argv", () => {
		const opts = parseArgs([]);
		expect(opts.bindHost).toBe("127.0.0.1");
		expect(opts.foreground).toBe(false);
		expect(opts.forceBackground).toBe(false);
		expect(opts.open).toBe(false);
	});

	it("accepts --background and --daemon aliases", () => {
		expect(parseArgs(["--background"]).forceBackground).toBe(true);
		expect(parseArgs(["--daemon"]).forceBackground).toBe(true);
	});

	it("accepts --no-daemon as foreground alias", () => {
		expect(parseArgs(["--no-daemon"]).foreground).toBe(true);
	});

	it("returns error for unknown arguments", () => {
		const opts = parseArgs(["--bogus"]);
		expect(opts.error).toContain("Unknown argument");
	});
});

describe("resolveUrlHost", () => {
	it("maps 127.0.0.1 to localhost", () => {
		expect(resolveUrlHost("127.0.0.1")).toBe("localhost");
	});

	it("maps localhost to localhost", () => {
		expect(resolveUrlHost("localhost")).toBe("localhost");
	});

	it("passes other hosts through", () => {
		expect(resolveUrlHost("0.0.0.0")).toBe("0.0.0.0");
		expect(resolveUrlHost("::1")).toBe("::1");
	});
});

describe("validateIdleTimeout", () => {
	it("accepts empty string as valid (default)", () => {
		const r = validateIdleTimeout("");
		expect(r.valid).toBe(true);
		expect(r.ms).toBeUndefined();
	});

	it("converts minutes to milliseconds", () => {
		const r = validateIdleTimeout("5");
		expect(r.valid).toBe(true);
		expect(r.ms).toBe(300000);
	});

	it("rejects zero", () => {
		expect(validateIdleTimeout("0").valid).toBe(false);
	});

	it("rejects negative numbers", () => {
		expect(validateIdleTimeout("-1").valid).toBe(false);
	});

	it("rejects non-integer strings", () => {
		expect(validateIdleTimeout("abc").valid).toBe(false);
		expect(validateIdleTimeout("1.5").valid).toBe(false);
	});
});

describe("isWindowsLikeEnv", () => {
	it("detects OSTYPE=msys", () => {
		expect(isWindowsLikeEnv({ OSTYPE: "msys" })).toBe(true);
	});

	it("detects OSTYPE=cygwin", () => {
		expect(isWindowsLikeEnv({ OSTYPE: "cygwin" })).toBe(true);
	});

	it("detects OSTYPE=mingw32", () => {
		expect(isWindowsLikeEnv({ OSTYPE: "mingw32" })).toBe(true);
	});

	it("detects MSYSTEM", () => {
		expect(isWindowsLikeEnv({ MSYSTEM: "MINGW64" })).toBe(true);
	});

	it("returns false for empty env", () => {
		expect(isWindowsLikeEnv({})).toBe(false);
	});

	it("returns false for darwin", () => {
		expect(isWindowsLikeEnv({ OSTYPE: "darwin24.0" })).toBe(false);
	});
});

describe("createSessionDirExclusive", () => {
	it("creates the session directory and its parent", () => {
		const base = makeTmp();
		const sessionDir = path.join(base, "parent", "session");
		createSessionDirExclusive(sessionDir);
		expect(fs.existsSync(sessionDir)).toBe(true);
		expect(fs.statSync(sessionDir).isDirectory()).toBe(true);
	});

	it("throws if the session directory already exists", () => {
		const base = makeTmp();
		const sessionDir = path.join(base, "session");
		fs.mkdirSync(sessionDir);
		expect(() => createSessionDirExclusive(sessionDir)).toThrow();
	});

	it("rejects a symlink planted ahead of us", () => {
		const base = makeTmp();
		const target = path.join(base, "attacker");
		fs.mkdirSync(target);
		const sessionDir = path.join(base, "session");
		fs.symlinkSync(target, sessionDir);
		expect(() => createSessionDirExclusive(sessionDir)).toThrow();
	});
});

describe("generateServerId", () => {
	it("produces a 48-character hex string", () => {
		const id = generateServerId();
		expect(id).toMatch(/^[0-9a-f]{48}$/);
	});

	it("produces unique IDs", () => {
		const a = generateServerId();
		const b = generateServerId();
		expect(a).not.toBe(b);
	});

	it("matches the 32-64 character validation range", () => {
		const id = generateServerId();
		expect(id.length).toBeGreaterThanOrEqual(32);
		expect(id.length).toBeLessThanOrEqual(64);
	});
});

describe("generateSessionId", () => {
	it("contains the process PID", () => {
		const id = generateSessionId();
		expect(id).toContain(String(process.pid));
	});

	it("contains an epoch timestamp", () => {
		const now = Math.floor(Date.now() / 1000);
		const id = generateSessionId();
		const parts = id.split("-");
		const ts = Number(parts[parts.length - 1]);
		expect(Math.abs(ts - now)).toBeLessThanOrEqual(2);
	});
});

describe("shouldAutoForeground", () => {
	it("returns true when opts.foreground is true", () => {
		expect(shouldAutoForeground({ foreground: true }, {})).toBe(true);
	});

	it("returns false when opts.forceBackground overrides auto-detect", () => {
		expect(
			shouldAutoForeground(
				{ foreground: false, forceBackground: true },
				{ CODEX_CI: "1" },
			),
		).toBe(false);
	});

	it("returns true in CODEX_CI environment", () => {
		expect(
			shouldAutoForeground(
				{ foreground: false, forceBackground: false },
				{ CODEX_CI: "1" },
			),
		).toBe(true);
	});

	it("returns true on Windows-like env", () => {
		expect(
			shouldAutoForeground(
				{ foreground: false, forceBackground: false },
				{ OSTYPE: "msys" },
			),
		).toBe(true);
	});

	it("returns false on normal unix without flags", () => {
		expect(
			shouldAutoForeground(
				{ foreground: false, forceBackground: false },
				{ OSTYPE: "darwin24.0" },
			),
		).toBe(false);
	});
});

describe("resolveOwnerPid", () => {
	it("returns empty string on Windows-like env", () => {
		expect(resolveOwnerPid({ OSTYPE: "msys" })).toBe("");
	});

	it("uses BRAINSTORM_OWNER_PID if set", () => {
		expect(resolveOwnerPid({ BRAINSTORM_OWNER_PID: "12345" })).toBe("12345");
	});

	it("falls back to process.ppid on unix", () => {
		const pid = resolveOwnerPid({});
		expect(Number(pid)).toBeGreaterThan(0);
	});
});

describe("session directory permissions", () => {
	it("creates state and content subdirectories", () => {
		const base = makeTmp();
		const sessionDir = path.join(base, "session");
		createSessionDirExclusive(sessionDir);
		fs.mkdirSync(path.join(sessionDir, "state"), { recursive: true });
		fs.mkdirSync(path.join(sessionDir, "content"), { recursive: true });
		expect(fs.existsSync(path.join(sessionDir, "state"))).toBe(true);
		expect(fs.existsSync(path.join(sessionDir, "content"))).toBe(true);
	});
});
