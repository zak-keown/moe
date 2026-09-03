import {
  access,
  mkdtemp,
  open as openFile,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
// biome-ignore format: TypeScript's next-line suppression must cover this import.
// @ts-expect-error — plain ESM production helper.
import { applyBoundPlan, createBoundPlan, formatUnifiedDiff, readBoundPlan } from "../skills/smoothing-the-experience/scripts/lib/mutation.mjs";

const ORIGINAL = '{"untouched":true}\n';
const REPLACEMENT = '{"permissions":{"allow":["Bash(git status:*)"]}}\n';

describe("bound smoothing plans", () => {
  it("writes a closed mode-0600 plan containing only selected rule material", async () => {
    const planDir = await mkdtemp(join(tmpdir(), "moe-smoothing-plan-"));
    const destination = join(planDir, "settings.json");
    const plan = await createBoundPlan({
      harness: "claude",
      selected: [
        {
          id: "claude-shell-a",
          rule: "Bash(git status:*)",
          rootSessionId: "must-not-survive",
          evidence: { prompt: "must-not-survive" },
        },
      ],
      destination,
      sourceBytes: Buffer.from("{}\n"),
      replacement: REPLACEMENT,
      now: () => "2026-09-03T00:00:00.000Z",
      planDir,
    });

    expect((await stat(plan.path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(plan.path, "utf8"))).toEqual({
      version: 1,
      harness: "claude",
      createdAt: "2026-09-03T00:00:00.000Z",
      destination,
      source: {
        exists: true,
        sha256: "ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356",
      },
      replacement: REPLACEMENT,
      replacementSha256: "6da14282e3d8df59a15464f99d89369a0980de702070493cc69723fffaf6b0d1",
      selected: [{ id: "claude-shell-a", rule: "Bash(git status:*)" }],
      restartRequired: false,
    });
    expect(JSON.stringify(plan)).not.toMatch(/rootSessionId|evidence|prompt|must-not-survive/);
    await expect(readBoundPlan(plan.path)).resolves.toEqual(plan);
  });

  it("formats a deterministic full-replacement unified diff", () => {
    expect(
      formatUnifiedDiff({
        destination: "/fixture/settings.json",
        sourceBytes: Buffer.from("{}\n"),
        replacement: REPLACEMENT,
      }),
    ).toBe(`--- /fixture/settings.json
+++ /fixture/settings.json
@@ -1 +1 @@
-{}
+{"permissions":{"allow":["Bash(git status:*)"]}}
`);
  });

  it("marks a missing source as /dev/null without inventing old content", () => {
    expect(
      formatUnifiedDiff({
        destination: "/fixture/rules/default.rules",
        sourceBytes: null,
        replacement: "allow()",
      }),
    ).toBe(`--- /dev/null
+++ /fixture/rules/default.rules
@@ -0,0 +1 @@
+allow()
\\ No newline at end of file
`);
  });

  it.each([
    ["an unknown root field", (value: Record<string, unknown>) => ({ ...value, evidence: [] })],
    [
      "an unknown source field",
      (value: Record<string, unknown>) => ({
        ...value,
        source: { ...(value.source as object), bytes: "private" },
      }),
    ],
    [
      "an unknown selection field",
      (value: Record<string, unknown>) => ({
        ...value,
        selected: [{ ...(value.selected as object[])[0], rootSessionId: "private" }],
      }),
    ],
    [
      "duplicate selected IDs",
      (value: Record<string, unknown>) => ({
        ...value,
        selected: [(value.selected as object[])[0], { ...(value.selected as object[])[0] }],
      }),
    ],
    [
      "a relative destination",
      (value: Record<string, unknown>) => ({ ...value, destination: "settings.json" }),
    ],
    [
      "a selected ID from another harness",
      (value: Record<string, unknown>) => ({
        ...value,
        selected: [{ ...(value.selected as object[])[0], id: "codex-shell-a" }],
      }),
    ],
    [
      "a replacement hash that does not bind its bytes",
      (value: Record<string, unknown>) => ({ ...value, replacementSha256: "0".repeat(64) }),
    ],
  ])("rejects a stored plan containing %s", async (_label, mutate) => {
    const planDir = await mkdtemp(join(tmpdir(), "moe-smoothing-plan-invalid-"));
    const valid = await createBoundPlan({
      harness: "claude",
      selected: [{ id: "claude-shell-a", rule: "Bash(git status:*)" }],
      destination: join(planDir, "settings.json"),
      sourceBytes: Buffer.from("{}\n"),
      replacement: REPLACEMENT,
      now: () => "2026-09-03T00:00:00.000Z",
      planDir,
    });
    const stored = JSON.parse(await readFile(valid.path, "utf8"));
    await writeFile(valid.path, `${JSON.stringify(mutate(stored))}\n`);

    await expect(readBoundPlan(valid.path)).rejects.toThrow(/invalid bound plan/);
  });

  it("rejects empty, duplicated, and mixed-harness selections before writing a plan", async () => {
    const planDir = await mkdtemp(join(tmpdir(), "moe-smoothing-plan-selection-"));
    const common = {
      harness: "claude",
      destination: join(planDir, "settings.json"),
      sourceBytes: Buffer.from("{}\n"),
      replacement: REPLACEMENT,
      planDir,
    };

    await expect(createBoundPlan({ ...common, selected: [] })).rejects.toThrow(
      /selected permission IDs are required/,
    );
    await expect(
      createBoundPlan({
        ...common,
        selected: [
          { id: "claude-shell-a", rule: "Bash(git status:*)" },
          { id: "claude-shell-a", rule: "Bash(git diff:*)" },
        ],
      }),
    ).rejects.toThrow(/duplicate selected permission ID/);
    await expect(
      createBoundPlan({
        ...common,
        selected: [{ id: "codex-shell-a", rule: "Bash(git status:*)" }],
      }),
    ).rejects.toThrow(/selected permissions must belong to one harness/);
    expect(await readdir(planDir)).toEqual([]);
  });
});

describe("atomic smoothing mutation", () => {
  it.each(["stale-source", "lock-held", "validator-failure", "rename-failure"] as const)(
    "leaves the original byte-identical on %s",
    async (failure) => {
      const fixture = await mutationFixture(failure);
      const before = await readFile(fixture.destination);

      await expect(applyBoundPlan(fixture.input)).rejects.toThrow();

      expect(await readFile(fixture.destination)).toEqual(before);
      await expect(access(fixture.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
      for (const path of fixture.temporaryPaths) {
        await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
      }
    },
  );

  it.each(["write-failure", "sync-failure", "rename-failure"] as const)(
    "cleans only the known temporary on pre-rename %s",
    async (failure) => {
      const fixture = await mutationFixture(failure);
      const unrelated = join(dirname(fixture.destination), ".unrelated.tmp");
      await writeFile(unrelated, "keep\n");

      await expect(applyBoundPlan(fixture.input)).rejects.toThrow();

      expect(fixture.temporaryPaths).toHaveLength(1);
      await expect(access(firstPath(fixture.temporaryPaths))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(readFile(unrelated, "utf8")).resolves.toBe("keep\n");
      await expect(readFile(fixture.destination, "utf8")).resolves.toBe(ORIGINAL);
    },
  );

  it("does not unlink a temporary pathname it failed to create exclusively", async () => {
    const fixture = await mutationFixture("open-failure");

    await expect(applyBoundPlan(fixture.input)).rejects.toThrow(/fixture open failure/);

    const temporaryPath = firstPath(fixture.temporaryPaths);
    expect(fixture.spies.remove).not.toHaveBeenCalledWith(temporaryPath);
    await expect(readFile(fixture.destination, "utf8")).resolves.toBe(ORIGINAL);
  });

  it("uses a flushed exclusive mode-0600 same-directory temporary before atomic rename", async () => {
    const fixture = await mutationFixture("none");

    await expect(applyBoundPlan(fixture.input)).resolves.toEqual({
      status: "applied",
      destination: fixture.destination,
    });

    const temporaryPath = firstPath(fixture.temporaryPaths);
    expect(dirname(temporaryPath)).toBe(dirname(fixture.destination));
    expect(fixture.spies.open).toHaveBeenCalledWith(fixture.lockPath, "wx", 0o600);
    expect(fixture.spies.open).toHaveBeenCalledWith(temporaryPath, "wx", 0o600);
    expect(fixture.spies.write.mock.calls[0]?.slice(1)).toEqual([REPLACEMENT, "utf8"]);
    expect(fixture.spies.sync).toHaveBeenCalledOnce();
    expect(fixture.spies.rename).toHaveBeenCalledWith(temporaryPath, fixture.destination);
    expect(fixture.events.indexOf("temp:sync")).toBeLessThan(fixture.events.indexOf("temp:close"));
    expect(fixture.events.indexOf("temp:close")).toBeLessThan(fixture.events.indexOf("rename"));
    expect(fixture.events.indexOf("rename")).toBeLessThan(
      fixture.events.lastIndexOf("read:destination"),
    );
    await expect(readFile(fixture.destination, "utf8")).resolves.toBe(REPLACEMENT);
  });

  it("rechecks the source under the exclusive config lock", async () => {
    const fixture = await mutationFixture("stale-under-lock");

    await expect(applyBoundPlan(fixture.input)).rejects.toThrow(/stale source config/);

    expect(fixture.spies.validator).toHaveBeenCalledOnce();
    expect(fixture.events).toContain("open:lock");
    expect(fixture.temporaryPaths).toEqual([]);
    await expect(access(fixture.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(fixture.destination, "utf8")).resolves.toBe(ORIGINAL);
  });

  it("requires exact harness-bound confirmation before validation or locking", async () => {
    const fixture = await mutationFixture("none");

    await expect(
      applyBoundPlan({ ...fixture.input, confirmToken: "apply:claude:not-the-hash" }),
    ).rejects.toThrow(/explicit harness confirmation does not match plan/);

    expect(fixture.spies.validator).not.toHaveBeenCalled();
    expect(fixture.events).not.toContain("open:lock");
    await expect(readFile(fixture.destination, "utf8")).resolves.toBe(ORIGINAL);
  });

  it("is idempotent after a successful application without revalidating or relocking", async () => {
    const fixture = await mutationFixture("none");
    expect(await applyBoundPlan(fixture.input)).toEqual({
      status: "applied",
      destination: fixture.destination,
    });
    fixture.spies.validator.mockClear();
    fixture.events.length = 0;

    expect(await applyBoundPlan(fixture.input)).toEqual({
      status: "already-applied",
      destination: fixture.destination,
    });

    expect(fixture.spies.validator).not.toHaveBeenCalled();
    expect(fixture.events).not.toContain("open:lock");
  });

  it("atomically creates a previously absent destination and is idempotent", async () => {
    const fixture = await mutationFixture("none", { sourceMissing: true });

    await expect(applyBoundPlan(fixture.input)).resolves.toMatchObject({ status: "applied" });
    await expect(readFile(fixture.destination, "utf8")).resolves.toBe(REPLACEMENT);
    await expect(applyBoundPlan(fixture.input)).resolves.toMatchObject({
      status: "already-applied",
    });
  });
});

type Failure =
  | "none"
  | "stale-source"
  | "stale-under-lock"
  | "lock-held"
  | "validator-failure"
  | "open-failure"
  | "write-failure"
  | "sync-failure"
  | "rename-failure";

async function mutationFixture(failure: Failure, { sourceMissing = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "moe-smoothing-mutation-"));
  const planDir = join(directory, "plans");
  const destination = join(directory, "settings.json");
  await (await import("node:fs/promises")).mkdir(planDir);
  if (!sourceMissing) await writeFile(destination, ORIGINAL);
  const sourceBytes = sourceMissing ? null : Buffer.from(ORIGINAL);
  const plan = await createBoundPlan({
    harness: "claude",
    selected: [{ id: "claude-shell-a", rule: "Bash(git status:*)" }],
    destination,
    sourceBytes,
    replacement: REPLACEMENT,
    now: () => "2026-09-03T00:00:00.000Z",
    planDir,
  });
  if (failure === "stale-source") await writeFile(destination, '{"changed":true}\n');

  const events: string[] = [];
  const temporaryPaths: string[] = [];
  let destinationReads = 0;
  const write = vi.fn(async (handle: Awaited<ReturnType<typeof openFile>>, contents, encoding) => {
    events.push("temp:write");
    if (failure === "write-failure") throw new Error("fixture write failure");
    return handle.writeFile(contents, encoding);
  });
  const sync = vi.fn(async (handle: Awaited<ReturnType<typeof openFile>>) => {
    events.push("temp:sync");
    if (failure === "sync-failure") throw new Error("fixture sync failure");
    return handle.sync();
  });
  const open = vi.fn(async (path: string, flags: string, mode: number) => {
    if (path.endsWith(".moe-smoothing.lock")) {
      events.push("open:lock");
      if (failure === "lock-held") {
        const error = Object.assign(new Error("fixture lock held"), { code: "EEXIST" });
        throw error;
      }
    } else {
      events.push("open:temporary");
      temporaryPaths.push(path);
      if (failure === "open-failure") {
        const error = Object.assign(new Error("fixture open failure"), { code: "EEXIST" });
        throw error;
      }
    }
    const handle = await openFile(path, flags, mode);
    const temporary = !path.endsWith(".moe-smoothing.lock");
    return {
      writeFile: (contents: unknown, encoding: unknown) => write(handle, contents, encoding),
      sync: () => sync(handle),
      close: async () => {
        if (temporary) events.push("temp:close");
        else events.push("lock:close");
        return handle.close();
      },
    };
  });
  const read = vi.fn(async (path: string, options?: unknown) => {
    if (path === destination) {
      events.push("read:destination");
      destinationReads += 1;
      if (failure === "stale-under-lock" && destinationReads === 2) {
        return Buffer.from('{"raced":true}\n');
      }
    } else if (path === plan.path) {
      events.push("read:plan");
    }
    return readFile(path, options as never);
  });
  const rename = vi.fn(async (from: string, to: string) => {
    events.push("rename");
    if (failure === "rename-failure") throw new Error("fixture rename failure");
    return (await import("node:fs/promises")).rename(from, to);
  });
  const remove = vi.fn(async (path: string) => {
    events.push(path.endsWith(".lock") ? "unlink:lock" : "unlink:temporary");
    return unlink(path);
  });
  const planWrite = vi.fn(writeFile);
  const validator = vi.fn(async () => {
    events.push("validate");
    if (failure === "validator-failure") throw new Error("fixture validator failure");
  });
  const fsOps = { open, readFile: read, rename, unlink: remove, writeFile: planWrite };

  return {
    destination,
    events,
    input: {
      planPath: plan.path,
      expectedHarness: "claude",
      confirmToken: `apply:claude:${plan.replacementSha256}`,
      validateReplacement: validator,
      fsOps,
    },
    lockPath: `${destination}.moe-smoothing.lock`,
    plan,
    spies: { open, read, rename, remove, sync, validator, write, planWrite },
    temporaryPaths,
  };
}

function firstPath(paths: string[]) {
  const path = paths[0];
  if (path === undefined) throw new Error("fixture did not observe a temporary path");
  return path;
}
