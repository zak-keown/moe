import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// CR-029: Flight's state directory is `.moe-flight` (DEFAULT_STATE_DIR_NAME
// in src/qa/paths.ts), but both example trees shipped their stories and
// context under the pre-rename upstream name `.gauntlet/`, while every
// README/docs surface that points at them already says `.moe-flight/` —
// so every documented command and link resolved to nothing. Nothing in
// src/qa/** mentions `.gauntlet`, so the fix is a pure directory rename.
const PKG_ROOT = join(import.meta.dirname, "..", "..", "..");

const TUTORIAL_STORIES = [
  "01-npm-init.md",
  "02-bun-init.md",
  "03-vim-split.md",
  "04-login-credentials.md",
  "05-login-cookies.md",
  "06-post-and-verify.md",
  "07-login-rejects-unknown-user.md",
];

const TODO_STORIES = [
  "01-add-one.md",
  "02-add-three.md",
  "03-toggle-one.md",
  "04-toggle-selectively.md",
  "05-delete-one.md",
  "06-filter-active.md",
  "07-clear-completed.md",
  "08-count-readback.md",
];

describe("CR-029: example trees live under .moe-flight/, matching every documented path", () => {
  test("examples/tutorial has no leftover .gauntlet/ directory", () => {
    expect(existsSync(join(PKG_ROOT, "examples", "tutorial", ".gauntlet"))).toBe(false);
  });

  test("examples/todo has no leftover .gauntlet/ directory", () => {
    expect(existsSync(join(PKG_ROOT, "examples", "todo", ".gauntlet"))).toBe(false);
  });

  test("every tutorial story the README/docs link to resolves under .moe-flight/stories", () => {
    for (const name of TUTORIAL_STORIES) {
      const p = join(PKG_ROOT, "examples", "tutorial", ".moe-flight", "stories", name);
      expect(existsSync(p), p).toBe(true);
    }
  });

  test("every todo story the README documents resolves under .moe-flight/stories", () => {
    for (const name of TODO_STORIES) {
      const p = join(PKG_ROOT, "examples", "todo", ".moe-flight", "stories", name);
      expect(existsSync(p), p).toBe(true);
    }
  });

  test("the tutorial's context tree (fred/deborah/quinn) resolves under .moe-flight/context", () => {
    const ctx = join(PKG_ROOT, "examples", "tutorial", ".moe-flight", "context");
    expect(existsSync(join(ctx, "README.md"))).toBe(true);
    expect(existsSync(join(ctx, "notes.md"))).toBe(true);
    expect(existsSync(join(ctx, "setup.ts"))).toBe(true);
    expect(existsSync(join(ctx, "vimrc"))).toBe(true);
    expect(existsSync(join(ctx, "profiles", "fred", "cookies.yaml"))).toBe(true);
    expect(existsSync(join(ctx, "profiles", "fred", "profile.md"))).toBe(true);
    expect(existsSync(join(ctx, "profiles", "deborah", "profile.md"))).toBe(true);
    expect(existsSync(join(ctx, "profiles", "quinn", "profile.md"))).toBe(true);
  });

  test("the todo example's context README resolves under .moe-flight/context", () => {
    const p = join(PKG_ROOT, "examples", "todo", ".moe-flight", "context", "README.md");
    expect(existsSync(p)).toBe(true);
  });
});
