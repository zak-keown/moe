import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { acquireFileLock, releaseFileLock } from "./file-lock.js";
import type { ModelFile, ModelManifest } from "./model-manifest.js";
import type { ModelSource } from "./model-source.js";
import { getModelCacheDir } from "./paths.js";

export interface VerifiedModelSet {
  root: string;
  revision: string;
  variant: "q8";
  files: ReadonlyMap<string, { path: string; sha256: string; bytes: number }>;
}

export interface ModelCacheStatus {
  state: "ready" | "missing" | "incomplete" | "corrupted";
  root?: string;
  detail?: string;
}

function cacheSlug(manifest: ModelManifest): string {
  return `${manifest.model.replace("/", "--")}--${manifest.variant}--${manifest.revision.slice(0, 12)}`;
}

function setDir(manifest: ModelManifest): string {
  return path.join(getModelCacheDir(), cacheSlug(manifest));
}

function stagingDir(manifest: ModelManifest): string {
  return path.join(getModelCacheDir(), `.staging-${cacheSlug(manifest)}`);
}

function lockPath(manifest: ModelManifest): string {
  return path.join(getModelCacheDir(), `.lock-${cacheSlug(manifest)}`);
}

function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  const content = fs.readFileSync(filePath);
  hash.update(content);
  return hash.digest("hex");
}

function verifyFile(filePath: string, file: ModelFile): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size !== file.bytes) return false;
    return sha256File(filePath) === file.sha256;
  } catch {
    return false;
  }
}

function buildVerifiedSet(root: string, manifest: ModelManifest): VerifiedModelSet {
  const files = new Map<string, { path: string; sha256: string; bytes: number }>();
  for (const f of manifest.files) {
    files.set(f.name, { path: path.join(root, f.name), sha256: f.sha256, bytes: f.bytes });
  }
  return { root, revision: manifest.revision, variant: manifest.variant, files };
}

function isCompleteSet(root: string, manifest: ModelManifest): boolean {
  const completePath = path.join(root, ".complete");
  if (!fs.existsSync(completePath)) return false;
  try {
    const marker = fs.readFileSync(completePath, "utf-8");
    if (!marker.includes(manifest.revision)) return false;
  } catch {
    return false;
  }
  for (const f of manifest.files) {
    if (!verifyFile(path.join(root, f.name), f)) return false;
  }
  return true;
}

export function inspectModelCache(manifest: ModelManifest): ModelCacheStatus {
  const root = setDir(manifest);
  if (!fs.existsSync(root)) return { state: "missing" };
  const completePath = path.join(root, ".complete");
  if (!fs.existsSync(completePath))
    return { state: "incomplete", root, detail: "no .complete marker" };
  try {
    const marker = fs.readFileSync(completePath, "utf-8");
    if (!marker.includes(manifest.revision)) {
      return { state: "corrupted", root, detail: `revision mismatch in .complete` };
    }
  } catch {
    return { state: "corrupted", root, detail: "unreadable .complete marker" };
  }
  for (const f of manifest.files) {
    const filePath = path.join(root, f.name);
    if (!fs.existsSync(filePath)) return { state: "incomplete", root, detail: `missing ${f.name}` };
    const stat = fs.statSync(filePath);
    if (stat.size !== f.bytes)
      return {
        state: "corrupted",
        root,
        detail: `${f.name}: size mismatch (${stat.size} != ${f.bytes})`,
      };
    if (sha256File(filePath) !== f.sha256)
      return { state: "corrupted", root, detail: `${f.name}: hash mismatch` };
  }
  return { state: "ready", root };
}

async function stageVerifyAndActivate(
  manifest: ModelManifest,
  source: ModelSource,
): Promise<VerifiedModelSet> {
  const target = setDir(manifest);

  if (isCompleteSet(target, manifest)) {
    return buildVerifiedSet(target, manifest);
  }

  const staging = stagingDir(manifest);
  cleanStaging(staging);
  fs.mkdirSync(staging, { recursive: true });

  const controller = new AbortController();
  try {
    for (const file of manifest.files) {
      const dest = path.join(staging, file.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await source.fetch(file, dest, controller.signal);

      const stat = fs.statSync(dest);
      if (stat.size !== file.bytes) {
        throw new Error(
          `model file "${file.name}": expected ${file.bytes} bytes, got ${stat.size}`,
        );
      }
      const actualHash = sha256File(dest);
      if (actualHash !== file.sha256) {
        throw new Error(
          `model file "${file.name}": hash mismatch (expected ${file.sha256}, got ${actualHash})`,
        );
      }
    }

    fs.writeFileSync(
      path.join(staging, ".complete"),
      `${manifest.revision}\n${new Date().toISOString()}\n`,
    );

    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    fs.renameSync(staging, target);
  } catch (err) {
    cleanStaging(staging);
    throw err;
  }

  return buildVerifiedSet(target, manifest);
}

function cleanStaging(staging: string): void {
  try {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  } catch {}
}

async function withModelLock<T>(manifest: ModelManifest, body: () => Promise<T>): Promise<T> {
  const lp = lockPath(manifest);
  const lock = acquireFileLock(lp);
  if (!lock) {
    const retryDelay = 500;
    const maxRetries = 600; // 5 minutes
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, retryDelay));
      const retry = acquireFileLock(lp);
      if (retry) {
        try {
          return await body();
        } finally {
          releaseFileLock(retry);
        }
      }
    }
    throw new Error("model cache lock contention: timed out waiting for another process");
  }
  try {
    return await body();
  } finally {
    releaseFileLock(lock);
  }
}

export async function ensureModelSet(
  manifest: ModelManifest,
  source: ModelSource,
): Promise<VerifiedModelSet> {
  return withModelLock(manifest, () => stageVerifyAndActivate(manifest, source));
}

export function adoptLegacyCache(manifest: ModelManifest, legacyRoot: string): boolean {
  const target = setDir(manifest);
  if (isCompleteSet(target, manifest)) return true;
  if (!fs.existsSync(legacyRoot)) return false;

  let allPresent = true;
  for (const f of manifest.files) {
    const legacyPath = path.join(legacyRoot, f.name);
    if (!fs.existsSync(legacyPath)) {
      allPresent = false;
      break;
    }
    if (!verifyFile(legacyPath, f)) {
      allPresent = false;
      break;
    }
  }
  if (!allPresent) return false;

  fs.mkdirSync(target, { recursive: true });
  for (const f of manifest.files) {
    fs.copyFileSync(path.join(legacyRoot, f.name), path.join(target, f.name));
  }
  fs.writeFileSync(
    path.join(target, ".complete"),
    `${manifest.revision}\n${new Date().toISOString()}\nadopted from ${legacyRoot}\n`,
  );

  for (const f of manifest.files) {
    if (!verifyFile(path.join(legacyRoot, f.name), f)) return false;
  }
  return true;
}
