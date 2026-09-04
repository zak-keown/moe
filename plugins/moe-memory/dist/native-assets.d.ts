import type { InstalledPackageRoot } from "./installed-package-root.js";
export type NativeTarget = "darwin-arm64" | "darwin-x64" | "linux-arm64" | "linux-x64" | "win32-x64";
export interface NativeAssetRecord {
    target: NativeTarget;
    path: string;
    bytes: number;
    sha256: string;
    minimumPlatform: string;
    source: {
        package?: string;
        integrity?: string;
        revision?: string;
    };
}
export interface NativeAssetManifest {
    name: string;
    version: string;
    targets: Record<NativeTarget, NativeAssetRecord>;
}
export interface ResolvedNativeAsset {
    record: NativeAssetRecord;
    absolutePath: string;
}
export declare function loadNativeAssetManifest(root: InstalledPackageRoot): NativeAssetManifest;
export declare function verifyNativeAsset(root: InstalledPackageRoot, record: NativeAssetRecord): string;
export declare function resolveNativeAsset(root: InstalledPackageRoot, platform?: NodeJS.Platform, arch?: string): ResolvedNativeAsset;
