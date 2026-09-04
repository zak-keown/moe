import type { MemoryDatabase } from "./db.js";
import { type VectorReadiness } from "./vector-readiness.js";
export interface EmbeddingCoordinator {
    ensureReady(): Promise<VectorReadiness>;
    runBatch(limit: number): Promise<VectorReadiness>;
}
export interface EmbeddingCoordinatorOptions {
    db: MemoryDatabase;
    dbPath: string;
    embedFn: (text: string) => Promise<Float32Array>;
    snapshotTaken?: boolean;
    capsuleVerified?: boolean;
}
export declare function createEmbeddingCoordinator(options: EmbeddingCoordinatorOptions): EmbeddingCoordinator;
