import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  defaultResolver,
  findMissingDeps,
  REQUIRED_PACKAGES,
  reportMissingDeps,
} from "../src/install-check.js";

/**
 * REWRITTEN ON IMPORT, because what it was testing is wrong here.
 *
 * Upstream `findMissingDeps(pluginRoot)` probed
 * `<pluginRoot>/node_modules/<pkg>/package.json` and the six tests staged fake
 * `node_modules` trees. Under pnpm that probe is broken by construction: the
 * store is not flat, and a transitive dependency is not present at the package
 * root at all — so it reported missing packages that resolve perfectly, and the
 * wrapper then ran `npm install` inside a pnpm workspace on every MCP start.
 *
 * The invariant worth keeping is "report exactly which required runtime packages
 * are unavailable, in one line, before handing off to the server". That is what
 * these tests assert, against an injected resolver.
 */
describe("findMissingDeps — runtime dependency health probe", () => {
  const nothingResolves = () => false;
  const everythingResolves = () => true;

  it("returns the full required-packages list when nothing resolves", () => {
    expect(findMissingDeps(nothingResolves)).toEqual([...REQUIRED_PACKAGES]);
  });

  it("returns an empty list when every required package resolves", () => {
    expect(findMissingDeps(everythingResolves)).toEqual([]);
  });

  it("returns multiple missing packages so the operator sees the full scope of damage in one log line", () => {
    const resolver = (pkg: string) => pkg === "sqlite-vec" || pkg === "zod";
    const missing = findMissingDeps(resolver);
    expect(missing).toContain("better-sqlite3");
    expect(missing).toContain("@huggingface/transformers");
    expect(missing).toContain("@anthropic-ai/claude-agent-sdk");
    expect(missing).not.toContain("sqlite-vec");
    expect(missing).not.toContain("zod");
  });

  it("does not require the transitive, optional, platform-specific backends", () => {
    // onnxruntime-node and sharp arrive through @huggingface/transformers and are
    // resolved from ITS tree, not ours. onnxruntime-node was on the upstream
    // required list and is not a declared dependency, so probing for it returned
    // a false positive on every single server start.
    expect(REQUIRED_PACKAGES).not.toContain("onnxruntime-node");
    expect(REQUIRED_PACKAGES).not.toContain("sharp");
    expect(REQUIRED_PACKAGES).not.toContain("fsevents");
  });

  it("lists only declared dependencies of this package", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
      dependencies: Record<string, string>;
    };
    for (const name of REQUIRED_PACKAGES) {
      expect(Object.keys(pkg.dependencies)).toContain(name);
    }
  });

  it("reportMissingDeps returns true when the install is healthy and false when it is not", () => {
    expect(reportMissingDeps(everythingResolves)).toBe(true);
    expect(reportMissingDeps(nothingResolves)).toBe(false);
  });

  it("the default resolver finds every required package in this workspace", () => {
    // This is the test that would actually have caught the pnpm problem: it runs
    // the real resolver against the real install.
    expect(findMissingDeps(defaultResolver)).toEqual([]);
  });
});
