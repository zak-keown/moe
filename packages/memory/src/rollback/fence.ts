import { getMemoryDataDir } from "../paths.js";
import { readRollbackState, RollbackStateError } from "./state.js";

export class RollbackFencedError extends Error {
  constructor() {
    super("rollback is prepared — all writes are blocked until rollback completes or is aborted");
    this.name = "RollbackFencedError";
  }
}

export function assertWritesAllowed(dataDir?: string): void {
  const dir = dataDir ?? getMemoryDataDir();
  const state = readRollbackState(dir);
  if (state && state.phase === "fenced") {
    throw new RollbackFencedError();
  }
}
