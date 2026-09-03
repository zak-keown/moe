import fs from "node:fs";
import path from "node:path";
import { getMemoryDataDir } from "../paths.js";
import {
  clearRollbackState,
  readRollbackState,
  RollbackStateError,
} from "./state.js";

export interface AbortRollbackOptions {
  dataDir?: string;
}

export interface AbortRollbackResult {
  aborted: boolean;
  message: string;
}

export function abortRollback(options: AbortRollbackOptions = {}): AbortRollbackResult {
  const dataDir = options.dataDir ?? getMemoryDataDir();
  const state = readRollbackState(dataDir);

  if (!state) {
    return { aborted: false, message: "no rollback in progress" };
  }

  if (state.phase === "swapped") {
    throw new RollbackStateError(
      "cannot abort after swap — the v3 database has already been replaced",
      "CANNOT_ABORT_AFTER_SWAP",
    );
  }

  // Clean up staged database if it exists
  const stagedPath = path.join(dataDir, state.stagedDatabase);
  try {
    if (fs.existsSync(stagedPath)) {
      fs.unlinkSync(stagedPath);
    }
  } catch {
    // Best-effort cleanup
  }

  clearRollbackState(dataDir);

  return {
    aborted: true,
    message: `rollback aborted from phase "${state.phase}"`,
  };
}
