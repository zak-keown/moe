import fs from "node:fs";
import path from "node:path";
import type { InstalledPackageRoot } from "./installed-package-root.js";

export interface ModelFile {
  name: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface ModelManifest {
  schema: number;
  model: string;
  revision: string;
  variant: "q8";
  license: string;
  dimensions: number;
  maxTokens: number;
  maxInputChars: number;
  queryPrefix: string;
  files: readonly ModelFile[];
}

export function loadModelManifest(packageRoot: InstalledPackageRoot): ModelManifest {
  const manifestPath = path.join(packageRoot, "runtime", "model-manifest.json");
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  validateManifest(raw);
  return raw as ModelManifest;
}

function validateManifest(raw: unknown): asserts raw is ModelManifest {
  if (!raw || typeof raw !== "object") throw new Error("model manifest must be an object");
  const m = raw as Record<string, unknown>;
  if (m.schema !== 1) throw new Error(`unsupported model manifest schema: ${m.schema}`);
  if (typeof m.model !== "string" || !m.model) throw new Error("model manifest: missing model");
  if (typeof m.revision !== "string" || !m.revision) throw new Error("model manifest: missing revision");
  if (m.variant !== "q8") throw new Error(`model manifest: unsupported variant "${m.variant}"`);
  if (!Array.isArray(m.files) || m.files.length === 0) throw new Error("model manifest: no files");
  for (const f of m.files) {
    if (typeof f.name !== "string") throw new Error("model manifest: file missing name");
    if (typeof f.url !== "string") throw new Error(`model manifest: file "${f.name}" missing url`);
    if (typeof f.bytes !== "number" || f.bytes <= 0) throw new Error(`model manifest: file "${f.name}" has invalid bytes`);
    if (typeof f.sha256 !== "string" || f.sha256.length !== 64) throw new Error(`model manifest: file "${f.name}" has invalid sha256`);
  }
}
