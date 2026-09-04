import { describe, it, expect } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";

const START_MOD_PATH = path.resolve(
	__dirname,
	"../../skills/brainstorming/scripts/start-server.mjs",
);

const startMod = await import(pathToFileURL(START_MOD_PATH).href);
const { isWindowsLikeEnv, shouldAutoForeground, resolveOwnerPid } = startMod;

describe("Windows lifecycle: foreground selection", () => {
	it("auto-foregrounds in Codex CI", () => {
		expect(
			shouldAutoForeground(
				{ foreground: false, forceBackground: false },
				{ CODEX_CI: "1" },
			),
		).toBe(true);
	});

	it("auto-foregrounds on MSYS2", () => {
		expect(
			shouldAutoForeground(
				{ foreground: false, forceBackground: false },
				{ OSTYPE: "msys" },
			),
		).toBe(true);
	});

	it("auto-foregrounds on MINGW", () => {
		expect(
			shouldAutoForeground(
				{ foreground: false, forceBackground: false },
				{ OSTYPE: "mingw64" },
			),
		).toBe(true);
	});

	it("--background overrides auto-foreground on Windows", () => {
		expect(
			shouldAutoForeground(
				{ foreground: false, forceBackground: true },
				{ OSTYPE: "msys" },
			),
		).toBe(false);
	});
});

describe("Windows lifecycle: OWNER_PID clearing", () => {
	it("returns empty string on Windows-like env", () => {
		expect(resolveOwnerPid({ OSTYPE: "msys" })).toBe("");
	});

	it("returns empty string when MSYSTEM is set", () => {
		expect(resolveOwnerPid({ MSYSTEM: "MINGW64" })).toBe("");
	});

	it("returns non-empty on darwin", () => {
		const pid = resolveOwnerPid({ OSTYPE: "darwin24.0" });
		expect(pid).not.toBe("");
	});
});

describe("Windows detection", () => {
	it("detects OSTYPE=msys variants", () => {
		expect(isWindowsLikeEnv({ OSTYPE: "msys" })).toBe(true);
		expect(isWindowsLikeEnv({ OSTYPE: "msys2" })).toBe(true);
	});

	it("detects OSTYPE=cygwin", () => {
		expect(isWindowsLikeEnv({ OSTYPE: "cygwin" })).toBe(true);
	});

	it("detects OSTYPE=mingw variants", () => {
		expect(isWindowsLikeEnv({ OSTYPE: "mingw32" })).toBe(true);
		expect(isWindowsLikeEnv({ OSTYPE: "mingw64" })).toBe(true);
	});

	it("detects MSYSTEM without OSTYPE", () => {
		expect(isWindowsLikeEnv({ MSYSTEM: "MINGW64" })).toBe(true);
	});

	it("returns false for linux", () => {
		expect(isWindowsLikeEnv({ OSTYPE: "linux-gnu" })).toBe(false);
	});

	it("returns false for darwin", () => {
		expect(isWindowsLikeEnv({ OSTYPE: "darwin24.0" })).toBe(false);
	});
});
