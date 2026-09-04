import type { ModelManifest } from "./model-manifest.js";
import type { ModelSource } from "./model-source.js";
export interface VerifiedModelSet {
    root: string;
    revision: string;
    variant: "q8";
    files: ReadonlyMap<string, {
        path: string;
        sha256: string;
        bytes: number;
    }>;
}
export interface ModelCacheStatus {
    state: "ready" | "missing" | "incomplete" | "corrupted";
    root?: string;
    detail?: string;
}
export declare function inspectModelCache(manifest: ModelManifest): ModelCacheStatus;
export declare function ensureModelSet(manifest: ModelManifest, source: ModelSource): Promise<VerifiedModelSet>;
export declare function adoptLegacyCache(manifest: ModelManifest, legacyRoot: string): boolean;
