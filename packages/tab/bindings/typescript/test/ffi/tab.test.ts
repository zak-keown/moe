import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import * as tab from "../../src/index.js";
// Imported from the public surface so the test also proves the export ships.
import { clearPricingDir, setPricingDir } from "../../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTDATA = join(HERE, "..", "..", "..", "testdata"); // test/ffi -> test -> typescript -> bindings, then /testdata
const TAB_USAGE = join(TESTDATA, "tab-usage-mini.jsonl");
const ATIF_TRAJECTORY = join(TESTDATA, "atif-mini.json");

async function seed(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "moe-tab-ts-"));
  copyFileSync(join(TESTDATA, "prices.json"), join(dir, "current.json"));
  await setPricingDir(dir);
  return dir;
}

test("version", async () => {
  // The binding reports the native lib's crate version; derive the
  // expectation from the workspace manifest so a release bump can't strand
  // a stale literal here (v0.7.0 broke CI exactly that way).
  const manifest = readFileSync(join(HERE, "..", "..", "..", "..", "Cargo.toml"), "utf8");
  const expected = /^version\s*=\s*"([^"]+)"/m.exec(manifest)?.[1];
  assert.ok(expected, "workspace Cargo.toml must declare a version");
  assert.equal(await tab.version(), expected);
});

test("estimatePath success", async () => {
  const dir = await seed();
  try {
    const est = await tab.estimatePath(TAB_USAGE, "tab");
    assert.ok(est.total_usd > 0, `total_usd=${est.total_usd}`);
    assert.equal(est.pricing_as_of, "2026-06-05");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await clearPricingDir();
  }
});

test("estimatePath atif dialect prices the trajectory", async () => {
  const dir = await seed();
  try {
    const est = await tab.estimatePath(ATIF_TRAJECTORY, "atif");
    // opus by rates (36.75) + gpt-5.5 embedded cost (0.5) + unpriced model (0) = 37.25
    assert.ok(Math.abs(est.total_usd - 37.25) < 1e-9, `total_usd=${est.total_usd}`);
    // the unpriced model is surfaced, never a silent $0
    assert.ok(
      est.unpriced_models.includes("made-up-model-zzz"),
      JSON.stringify(est.unpriced_models),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await clearPricingDir();
  }
});

test("missing tables -> TabError code 1", async () => {
  await setPricingDir("/nonexistent/moe-tab-ts-xyz");
  try {
    await assert.rejects(
      () => tab.estimatePath(TAB_USAGE, "tab"),
      (e: unknown) =>
        e instanceof tab.TabError && e.code === 1 && e.kind === "PricingTablesMissing",
    );
  } finally {
    await clearPricingDir();
  }
});

test("refresh rejects garbage as_of -> TabError code 7", async () => {
  const dir = await seed();
  try {
    await assert.rejects(
      () => tab.refresh("Apr-2027"),
      (e: unknown) => e instanceof tab.TabError && e.code === 7 && e.kind === "InvalidArgument",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await clearPricingDir();
  }
});

test("unknown dialect -> TabError code 7", async () => {
  const dir = await seed();
  try {
    await assert.rejects(
      () => tab.estimatePath(TAB_USAGE, "banana" as tab.Dialect),
      (e: unknown) => e instanceof tab.TabError && e.code === 7,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await clearPricingDir();
  }
});
