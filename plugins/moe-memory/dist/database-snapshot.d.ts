import { type DatabaseLease } from "./database-lease.js";
import type { MemoryDatabase } from "./db.js";
export interface SnapshotSourceRecord {
    family: "transcript" | "journal";
    identity: string;
    canonicalPath: string;
    sha256: string;
}
export interface SnapshotSidecar {
    schema: 1;
    dbIdentity: string;
    dbSha256: string;
    dbBytes: number;
    fromVersion: number;
    toVersion: number;
    sourceArtifactIntegrity: string;
    sources: SnapshotSourceRecord[];
    createdAt: string;
}
export interface SnapshotResult {
    snapshotPath: string;
    sidecarPath: string;
    sidecar: SnapshotSidecar;
    lease: DatabaseLease;
}
export declare function validateSnapshotSources(sources: SnapshotSourceRecord[]): void;
export declare function collectSnapshotSources(db: MemoryDatabase): SnapshotSourceRecord[];
export declare function createDatabaseSnapshot(db: MemoryDatabase, dbPath: string, options: {
    fromVersion: number;
    toVersion: number;
    sourceArtifactIntegrity?: string;
    callerLease?: DatabaseLease;
}): SnapshotResult;
export declare function verifySnapshot(sidecarPath: string): SnapshotSidecar;
