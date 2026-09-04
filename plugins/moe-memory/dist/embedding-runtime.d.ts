import type { VerifiedModelSet } from "./model-cache.js";
export interface EmbeddingBackend {
    embed(text: string): Promise<Float32Array>;
    embedQuery(text: string): Promise<Float32Array>;
    close(): Promise<void>;
    debugInputTypes?(): string[];
}
export interface VerifiedRuntimeAsset {
    path: string;
    sha256: string;
    bytes: number;
}
export declare function createEmbeddingBackend(model: VerifiedModelSet, wasm: VerifiedRuntimeAsset): Promise<EmbeddingBackend>;
