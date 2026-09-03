export type RollbackPhase = "staging" | "fenced" | "swapped";
export interface RollbackState {
    schema: 1;
    phase: RollbackPhase;
    databaseId: string;
    snapshotSha256: string;
    capsuleSha256: string;
    stagedDatabase: string;
    retainedV3Database: string;
}
export declare class RollbackStateError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
export declare function readRollbackState(dataDir: string): RollbackState | null;
export declare function createRollbackState(dataDir: string, init: Omit<RollbackState, "schema">): RollbackState;
export declare function advanceRollbackState(dataDir: string, expected: RollbackPhase, next: RollbackPhase): RollbackState;
export declare function clearRollbackState(dataDir: string): void;
