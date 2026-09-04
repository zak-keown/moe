import { type ReconciliationPlan } from "./reconcile.js";
import { type RollbackState } from "./state.js";
export interface PrepareRollbackOptions {
    to: string;
    dataDir?: string;
    dbPath?: string;
    capsuleDir?: string;
    catalogPath?: string;
    skipCapsuleExecution?: boolean;
}
export interface PrepareRollbackResult {
    phase: RollbackState["phase"];
    activeDatabase: string;
    retainedV3Database: string;
    reconciliation: ReconciliationPlan;
}
export declare function prepareRollback(options: PrepareRollbackOptions): PrepareRollbackResult;
