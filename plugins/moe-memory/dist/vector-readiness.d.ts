import type { MemoryDatabase } from "./db.js";
export type VectorReadiness = {
    state: "ready";
    total: number;
    remaining: 0;
    fromVersion: 2;
    toVersion: 3;
} | {
    state: "upgrading";
    total: number;
    remaining: number;
    fromVersion: 2;
    toVersion: 3;
} | {
    state: "blocked";
    reason: string;
    total: number;
    remaining: number;
    fromVersion: 2;
    toVersion: 3;
};
export declare function assessVectorReadiness(db: MemoryDatabase): VectorReadiness;
export declare function isVectorQueryAuthorized(db: MemoryDatabase): boolean;
export declare function vectorReadinessMessage(readiness: VectorReadiness): string;
