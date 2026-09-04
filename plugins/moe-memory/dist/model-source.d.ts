import type { ModelFile } from "./model-manifest.js";
export interface ModelSource {
    fetch(file: ModelFile, destination: string, signal: AbortSignal): Promise<void>;
}
