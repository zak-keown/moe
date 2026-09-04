import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  eventsPath,
  harnessMarkerPath,
  metaPath,
  shimPath,
  workerHomePath,
} from "../src/core/paths.js";
import {
  ensureOwnedDir,
  listWorkers,
  readHarnessMarker,
  readMeta,
  removeWorker,
  resolveSession,
  stageCredentialFile,
  writeHarnessMarker,
  writeMeta,
  writeShim,
} from "../src/core/worker-store.js";

// mkdirSync is wrapped (default behavior unchanged) so the CR-028 TOCTOU test
// below can override its behavior for exactly one call to model an attacker
// winning the create-path race, without touching every other test's use of
// the real filesystem.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, mkdirSync: vi.fn(actual.mkdirSync) };
});

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "moe-crew-store-"));
}

const FAKE_MOE_CREW = "/usr/local/bin/moe-crew.cjs";

const baseMeta = {
  tmux_name: "my-worker",
  session_id: "sid-abc",
  cwd: "/home/user/project",
  harness: "claude",
};

describe("writeMeta / readMeta", () => {
  it("round-trips the four required fields", () => {
    const dir = tmpDir();
    writeMeta(dir, baseMeta);
    const meta = readMeta(dir, "sid-abc");
    expect(meta).not.toBeNull();
    expect(meta!.tmux_name).toBe("my-worker");
    expect(meta!.session_id).toBe("sid-abc");
    expect(meta!.cwd).toBe("/home/user/project");
    expect(meta!.harness).toBe("claude");
  });

  it("round-trips extra fields via index signature", () => {
    const dir = tmpDir();
    const withExtra = { ...baseMeta, plugin_dir: "/some/dir", extra_num: 42 };
    writeMeta(dir, withExtra);
    const meta = readMeta(dir, "sid-abc");
    expect(meta!.plugin_dir).toBe("/some/dir");
    expect(meta!.extra_num).toBe(42);
  });

  it("returns null for a missing sid", () => {
    const dir = tmpDir();
    expect(readMeta(dir, "no-such-sid")).toBeNull();
  });

  it("returns null for a non-existent dir", () => {
    expect(readMeta("/does/not/exist", "sid")).toBeNull();
  });
});

describe("listWorkers", () => {
  it("returns all metas written to the dir", () => {
    const dir = tmpDir();
    writeMeta(dir, baseMeta);
    writeMeta(dir, { ...baseMeta, tmux_name: "second", session_id: "sid-def" });
    const workers = listWorkers(dir);
    expect(workers).toHaveLength(2);
    const sids = workers.map((w) => w.session_id).sort();
    expect(sids).toEqual(["sid-abc", "sid-def"]);
  });

  it("returns [] for a non-existent dir", () => {
    expect(listWorkers("/does/not/exist")).toEqual([]);
  });

  it("skips malformed .meta files", () => {
    const dir = tmpDir();
    writeMeta(dir, baseMeta);
    // write garbage into another .meta file
    writeFileSync(join(dir, "bad-sid.meta"), "not json at all");
    const workers = listWorkers(dir);
    expect(workers).toHaveLength(1);
    expect(workers[0]!.session_id).toBe("sid-abc");
  });
});

describe("resolveSession", () => {
  it("returns the arg unchanged when a .meta file for that sid exists", () => {
    const dir = tmpDir();
    writeMeta(dir, baseMeta);
    expect(resolveSession(dir, "sid-abc")).toBe("sid-abc");
  });

  it("returns the arg unchanged when a .events.jsonl file for that sid exists", () => {
    const dir = tmpDir();
    // write only the events file, no meta
    writeFileSync(eventsPath(dir, "sid-only-events"), "");
    expect(resolveSession(dir, "sid-only-events")).toBe("sid-only-events");
  });

  it("returns the session_id when given a tmux_name", () => {
    const dir = tmpDir();
    writeMeta(dir, baseMeta);
    expect(resolveSession(dir, "my-worker")).toBe("sid-abc");
  });

  it("returns null for an unknown arg", () => {
    const dir = tmpDir();
    writeMeta(dir, baseMeta);
    expect(resolveSession(dir, "does-not-exist")).toBeNull();
  });
});

describe("writeShim", () => {
  it("creates the shim at the expected shimPath", () => {
    const dir = tmpDir();
    const returned = writeShim(dir, "my-worker", FAKE_MOE_CREW);
    expect(returned).toBe(shimPath(dir, "my-worker"));
    // file must exist — statSync will throw if not
    expect(() => statSync(returned)).not.toThrow();
  });

  it("makes the shim executable", () => {
    const dir = tmpDir();
    const p = writeShim(dir, "my-worker", FAKE_MOE_CREW);
    const mode = statSync(p).mode;
    // at least one execute bit set
    expect(mode & 0o111).toBeGreaterThan(0);
  });

  it("shim content execs node with the moeCrewEntry and worker name", () => {
    const dir = tmpDir();
    const p = writeShim(dir, "my-worker", FAKE_MOE_CREW);
    const content = readFileSync(p, "utf8");
    expect(content).toContain("#!/usr/bin/env bash");
    expect(content).toContain(`exec node "${FAKE_MOE_CREW}" --worker "my-worker"`);
  });
});

describe("removeWorker", () => {
  it("deletes meta, events, shim, and harness-marker files", () => {
    const dir = tmpDir();
    writeMeta(dir, baseMeta);
    writeFileSync(eventsPath(dir, "sid-abc"), "");
    writeShim(dir, "my-worker", FAKE_MOE_CREW);
    writeHarnessMarker(dir, "my-worker", "codex");

    removeWorker(dir, "sid-abc", "my-worker");

    expect(() => statSync(metaPath(dir, "sid-abc"))).toThrow();
    expect(() => statSync(eventsPath(dir, "sid-abc"))).toThrow();
    expect(() => statSync(shimPath(dir, "my-worker"))).toThrow();
    expect(() => statSync(harnessMarkerPath(dir, "my-worker"))).toThrow();
  });

  it("does not throw when files are already gone", () => {
    const dir = tmpDir();
    expect(() => removeWorker(dir, "ghost-sid", "ghost-worker")).not.toThrow();
  });

  it("removes the per-worker home dir (staged operator credentials)", () => {
    const dir = tmpDir();
    writeMeta(dir, baseMeta);
    // Simulate codex/pi prepare(): a per-worker home holding the operator's auth.
    const home = workerHomePath(dir, "my-worker");
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "auth.json"), '{"token":"operator-secret"}');

    removeWorker(dir, "sid-abc", "my-worker");

    expect(() => statSync(home)).toThrow();
  });

  it("does not throw when the per-worker home dir is absent", () => {
    const dir = tmpDir();
    writeMeta(dir, baseMeta);
    expect(() => removeWorker(dir, "sid-abc", "my-worker")).not.toThrow();
  });

  it("refuses a tmux_name that path-traverses out of the worker dir", () => {
    const parent = mkdtempSync(join(tmpdir(), "moe-crew-parent-"));
    const dir = join(parent, "workers");
    // homes/ must pre-exist for the traversal to reach outside dir at all —
    // rmSync's force:true otherwise swallows the ENOENT on the missing component.
    mkdirSync(join(dir, "homes"), { recursive: true });
    const victim = join(parent, "victim");
    mkdirSync(victim, { recursive: true });
    writeFileSync(join(victim, "secret.txt"), "do not delete me");

    expect(() => removeWorker(dir, "sid-abc", "../../victim")).toThrow();

    expect(() => statSync(join(victim, "secret.txt"))).not.toThrow();
  });
});

describe("writeHarnessMarker / readHarnessMarker", () => {
  it("round-trips the harness string", () => {
    const dir = tmpDir();
    writeHarnessMarker(dir, "my-worker", "codex");
    expect(readHarnessMarker(dir, "my-worker")).toBe("codex");
  });

  it("returns null when the marker file does not exist", () => {
    const dir = tmpDir();
    expect(readHarnessMarker(dir, "no-such-worker")).toBeNull();
  });

  it("returns null for an empty marker file (trim() || null)", () => {
    // The implementation does readFileSync(...).trim() || null, so an empty
    // or whitespace-only file returns null rather than an empty string.
    const dir = tmpDir();
    writeFileSync(harnessMarkerPath(dir, "my-worker"), "   ");
    expect(readHarnessMarker(dir, "my-worker")).toBeNull();
  });
});

describe("ensureOwnedDir (CR-019/CR-021)", () => {
  it("creates a fresh directory privately (mode 0700)", () => {
    const parent = tmpDir();
    const dir = join(parent, "workers");
    ensureOwnedDir(dir);
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("accepts an existing directory already owned by the current user", () => {
    const dir = tmpDir(); // mkdtempSync — already exists, owned by us
    expect(() => ensureOwnedDir(dir)).not.toThrow();
  });

  it("refuses when a symlink is planted at the path instead of a real directory", () => {
    const parent = tmpDir();
    const elsewhere = tmpDir();
    const dir = join(parent, "workers");
    symlinkSync(elsewhere, dir);
    expect(() => ensureOwnedDir(dir)).toThrow(/not a real directory/);
  });

  it("refuses when a plain file sits at the path instead of a directory", () => {
    const parent = tmpDir();
    const dir = join(parent, "workers");
    writeFileSync(dir, "not a directory");
    expect(() => ensureOwnedDir(dir)).toThrow(/not a real directory/);
  });

  it("refuses a symlink planted between the ENOENT check and mkdirSync (CR-028 TOCTOU)", () => {
    // ensureOwnedDir's create-path only re-verifies the pre-existing-path
    // branch; when `dir` does not exist yet, it calls mkdirSync(dir,
    // {recursive:true}) and trusts it unconditionally. mkdirSync's recursive
    // mode does not throw when the target already resolves to a directory
    // (a symlink included), so an attacker who plants a symlink to their own
    // directory in the window between the lstatSync ENOENT and this
    // mkdirSync call would make it return normally without ever creating a
    // fresh, private, owned directory. Two real OS processes can't be raced
    // deterministically in a unit test, so model the outcome directly: make
    // mkdirSync itself plant the attacker's symlink, exactly what it would
    // observe if the race had already been won by the time it ran.
    const parent = tmpDir();
    const attackerOwned = tmpDir();
    const dir = join(parent, "workers");

    vi.mocked(mkdirSync).mockImplementationOnce(((target: unknown) => {
      symlinkSync(attackerOwned, target as string);
      return undefined;
    }) as typeof mkdirSync);

    expect(() => ensureOwnedDir(dir)).toThrow(/not a real directory|not owned/);
  });
});

describe("stageCredentialFile (CR-021)", () => {
  it("copies the source content to a fresh destination", () => {
    const dir = tmpDir();
    const src = join(dir, "auth.json");
    writeFileSync(src, '{"token":"operator-secret"}');
    const dest = join(dir, "staged-auth.json");
    stageCredentialFile(src, dest);
    expect(readFileSync(dest, "utf8")).toBe('{"token":"operator-secret"}');
    expect(statSync(dest).mode & 0o777).toBe(0o600);
  });

  it("does nothing when the source is absent (best effort)", () => {
    const dir = tmpDir();
    const dest = join(dir, "staged-auth.json");
    expect(() => stageCredentialFile(join(dir, "no-such-src.json"), dest)).not.toThrow();
    expect(() => statSync(dest)).toThrow();
  });

  it("does not follow a symlink planted at the destination, and the mode still takes effect", () => {
    const dir = tmpDir();
    const src = join(dir, "auth.json");
    writeFileSync(src, '{"token":"operator-secret"}');
    const victim = join(dir, "victim.txt");
    writeFileSync(victim, "do not overwrite me", { mode: 0o644 });
    const dest = join(dir, "staged-auth.json");
    symlinkSync(victim, dest);

    stageCredentialFile(src, dest);

    // The victim is untouched...
    expect(readFileSync(victim, "utf8")).toBe("do not overwrite me");
    expect(statSync(victim).mode & 0o777).toBe(0o644);
    // ...and dest is now a real file (the symlink was replaced) holding the
    // staged content with the correct mode.
    expect(lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(readFileSync(dest, "utf8")).toBe('{"token":"operator-secret"}');
    expect(statSync(dest).mode & 0o777).toBe(0o600);
  });

  it("overwrites a stale plain file from a prior run reusing the same worker name", () => {
    const dir = tmpDir();
    const src = join(dir, "auth.json");
    writeFileSync(src, "new-token");
    const dest = join(dir, "staged-auth.json");
    writeFileSync(dest, "old-token", { mode: 0o644 });

    stageCredentialFile(src, dest);

    expect(readFileSync(dest, "utf8")).toBe("new-token");
    expect(statSync(dest).mode & 0o777).toBe(0o600);
  });
});
