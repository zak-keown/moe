// The `unit` project: everything here runs with no Rust toolchain and no cdylib.
// `resolveLibPath` is the one piece of this binding that decides something on its
// own rather than delegating to the core, and upstream had no test for it — its
// only suite dlopened the library, so a wrong resolution order looked identical to
// a missing build.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { resolveLibPath } from "../../src/lib-path.js";

const dirs: string[] = [];
function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "moe-tab-libpath-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  delete process.env.MOE_TAB_LIB;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("MOE_TAB_LIB wins when it points at an existing file", () => {
  const dir = scratch();
  const lib = join(dir, "libmoe_tab_ffi.dylib");
  writeFileSync(lib, "");
  process.env.MOE_TAB_LIB = lib;
  expect(resolveLibPath()).toBe(lib);
});

// Whether the later candidates exist depends on whether the cdylib has been built,
// so this asserts the invariant that holds either way: a MOE_TAB_LIB that is not
// on disk is never handed back as if it were, and if nothing else resolves, the
// failure names every path it tried — including the bogus override.
test("a MOE_TAB_LIB that does not exist is never returned", () => {
  const missing = join(scratch(), "nope.dylib");
  process.env.MOE_TAB_LIB = missing;
  let resolved: string;
  try {
    resolved = resolveLibPath();
  } catch (e) {
    const msg = (e as Error).message;
    expect(msg).toContain("moe_tab_ffi");
    expect(msg).toContain("MOE_TAB_LIB");
    expect(msg).toContain(missing);
    return;
  }
  expect(resolved).not.toBe(missing);
  expect(existsSync(resolved)).toBe(true);
});
