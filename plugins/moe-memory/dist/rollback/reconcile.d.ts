import type { DatabaseSync } from "node:sqlite";
import type { SnapshotSidecar } from "../database-snapshot.js";
export interface SourceChange {
    family: "transcript" | "journal";
    identity: string;
    canonicalPath: string;
}
export interface ReconciliationPlan {
    created: readonly SourceChange[];
    modified: readonly SourceChange[];
    deleted: readonly SourceChange[];
    unchanged: readonly SourceChange[];
}
export declare function planSourceReconciliation(sidecar: SnapshotSidecar, currentSourcePaths: Map<string, {
    family: "transcript" | "journal";
    canonicalPath: string;
}>): ReconciliationPlan;
export declare function applySourceReconciliation(stagedDb: DatabaseSync, plan: ReconciliationPlan): void;
