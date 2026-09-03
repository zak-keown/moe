#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const dtsPath = join(ROOT, "dist/index.d.ts");
let dts;
try {
  dts = readFileSync(dtsPath, "utf-8");
} catch {
  console.error("dist/index.d.ts not found — run `pnpm build` first");
  process.exit(1);
}

const problems = [];

if (dts.includes("better-sqlite3")) {
  problems.push("dist/index.d.ts references better-sqlite3");
}
if (dts.includes("DatabaseSync")) {
  problems.push("dist/index.d.ts exposes raw DatabaseSync type");
}

const dtsFiles = readdirSync(join(ROOT, "dist"), { recursive: true })
  .filter((f) => f.endsWith(".d.ts") && f !== "index.d.ts");

for (const f of dtsFiles) {
  const content = readFileSync(join(ROOT, "dist", f), "utf-8");
  if (f === "index.d.ts") continue;
  // Only check re-exported .d.ts files referenced from index
  if (dts.includes(f.replace(/\.d\.ts$/, ".js"))) {
    if (content.includes("better-sqlite3")) {
      problems.push(`dist/${f} references better-sqlite3 (reachable from index)`);
    }
  }
}

if (problems.length > 0) {
  console.error("Public API check failed:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log("public-api: no raw database types in public declarations");
if (check) process.exit(0);
