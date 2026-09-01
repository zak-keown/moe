#!/usr/bin/env node
/** Copy a canonical root license into a generated distribution artifact. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [license, destination] = process.argv.slice(2);
const source = license === "MIT" ? "LICENSE-MIT" : license === "Apache-2.0" ? "LICENSE" : null;

if (!source || !destination) {
  console.error("usage: copy-license.mjs <MIT|Apache-2.0> <destination>");
  process.exit(2);
}

const output = resolve(process.cwd(), destination);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, readFileSync(resolve(ROOT, source)));
