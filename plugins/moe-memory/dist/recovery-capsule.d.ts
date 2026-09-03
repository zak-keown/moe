/**
 * Recovery capsule schema and verification for offline rollback.
 *
 * A recovery capsule captures the exact 0.1.5 memory runtime — package tarball,
 * installed files, dependency closure, lifecycle policy, and legal files — so
 * Plan 06's rollback can restore the predecessor without network access.
 */
export interface IntegrityFile {
    path: string;
    sha256: string;
    bytes: number;
}
export interface RecoveryCapsuleManifest {
    schema: 1;
    memoryVersion: "0.1.5";
    nodeRange: ">=24";
    target: string;
    packageTarball: IntegrityFile;
    installedFiles: readonly IntegrityFile[];
    dependencies: readonly {
        name: string;
        version: string;
        integrity: string;
    }[];
    lifecyclePolicy: readonly {
        package: string;
        script: string;
        executed: boolean;
    }[];
    legalFiles: readonly IntegrityFile[];
}
export interface VerifiedRecoveryCapsule {
    manifest: RecoveryCapsuleManifest;
    root: string;
    target: string;
    verified: true;
}
export interface RecoveryCatalog {
    schema: 1;
    memoryVersion: "0.1.5";
    targets: readonly RecoveryCatalogEntry[];
}
export interface RecoveryCatalogEntry {
    target: string;
    platform: string;
    arch: string;
    manifestSha256: string;
    assetKey: string;
}
export declare class RecoveryCapsuleError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
declare function sha256Buffer(data: Buffer | string): string;
export declare function validateManifest(manifest: unknown): manifest is RecoveryCapsuleManifest;
export declare function verifyRecoveryCapsule(capsuleRoot: string, options: {
    platform: string;
    arch: string;
}): VerifiedRecoveryCapsule;
export declare function loadCatalog(catalogPath: string): RecoveryCatalog;
export declare function ensureRecoveryCapsule(options: {
    fromVersion: string;
    platform: string;
    arch: string;
    catalogPath?: string;
    capsuleDir?: string;
}): VerifiedRecoveryCapsule;
export { sha256Buffer as sha256ForTest };
