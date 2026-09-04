import fs from 'node:fs';
import path from 'node:path';
import { getChromeProfileDir } from './chrome-launcher-helpers.mjs';

const LOCK_FORMAT_VERSION = 1;
const MAX_PROFILE_SLOTS = 100;

function getProfileLockPath(profileName) {
  return path.join(path.dirname(getChromeProfileDir(profileName)), `${profileName}.mcp.lock`);
}

function isPidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

function readLockFile(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLockFile(lockPath, { atomic = true } = {}) {
  const payload = {
    pid: process.pid,
    mcpPid: process.pid,
    startedAt: new Date().toISOString(),
    version: LOCK_FORMAT_VERSION,
  };
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const flag = atomic ? 'wx' : 'w';
  fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), { flag });
}

function tryAtomicClaim(lockPath) {
  try {
    writeLockFile(lockPath);
    return true;
  } catch (e) {
    if (e && e.code === 'EEXIST') return false;
    throw e;
  }
}

function acquire(profileName) {
  const lockPath = getProfileLockPath(profileName);

  if (tryAtomicClaim(lockPath)) return lockPath;

  const existing = readLockFile(lockPath);
  if (existing && isPidAlive(existing.pid)) {
    return null;
  }

  try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
  if (tryAtomicClaim(lockPath)) return lockPath;

  const racer = readLockFile(lockPath);
  if (racer && isPidAlive(racer.pid)) return null;
  return null;
}

function acquireWithFallback(baseProfileName) {
  for (let slot = 1; slot <= MAX_PROFILE_SLOTS; slot++) {
    const candidate = slot === 1 ? baseProfileName : `${baseProfileName}-${slot}`;
    const lockPath = acquire(candidate);
    if (lockPath) {
      return { profileName: candidate, lockPath, slot };
    }
  }
  throw new Error(
    `Could not acquire a profile lock — ${MAX_PROFILE_SLOTS} live MCP instances ` +
    `for base '${baseProfileName}'? Use CHROME_WS_PROFILE to set a unique name.`
  );
}

function release(lockPath) {
  if (!lockPath) return;
  try {
    const existing = readLockFile(lockPath);
    if (existing && existing.pid !== process.pid) return;
    fs.unlinkSync(lockPath);
  } catch {
    // Already gone or unwritable
  }
}

export {
  acquire,
  acquireWithFallback,
  release,
  getProfileLockPath,
  isPidAlive,
  readLockFile,
  LOCK_FORMAT_VERSION,
};
