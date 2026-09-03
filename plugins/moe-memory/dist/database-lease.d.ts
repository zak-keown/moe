import type { MemoryDatabase } from "./db.js";
export declare class DatabaseBusyError extends Error {
    constructor(message: string);
}
export interface DatabaseLease {
    mode: "shared" | "exclusive";
    epoch: number;
    release(): void;
}
export interface DatabaseWriter {
    epoch: number;
    release(): void;
}
export interface LegacyUserDiagnostic {
    pid: number;
    alive: boolean;
}
export declare function readDatabaseEpoch(dbPath: string): number;
export declare function acquireSharedDatabaseLease(dbPath: string): DatabaseLease;
export declare function acquireDatabaseWriter(dbPath: string, shared: DatabaseLease): DatabaseWriter;
export declare function withDatabaseWriter<T>(db: MemoryDatabase, expectedEpoch: number, body: () => T): T;
export declare function inspectLegacyDatabaseUsers(dbPath: string): LegacyUserDiagnostic[];
export declare function acquireExclusiveMaintenanceLease(dbPath: string): DatabaseLease;
export declare function assertWritableEpoch(dbPath: string, expected: number): void;
