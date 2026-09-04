import type { InstalledPackageRoot } from "./installed-package-root.js";
export interface ModelFile {
    name: string;
    url: string;
    bytes: number;
    sha256: string;
}
export interface ModelManifest {
    schema: number;
    model: string;
    revision: string;
    variant: "q8";
    license: string;
    dimensions: number;
    maxTokens: number;
    maxInputChars: number;
    queryPrefix: string;
    files: readonly ModelFile[];
}
export declare function loadModelManifest(packageRoot: InstalledPackageRoot): ModelManifest;
