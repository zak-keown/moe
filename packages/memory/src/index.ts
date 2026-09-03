import { resolveInstalledPackageRoot } from "./installed-package-root.js";
import { setDefaultPackageRoot } from "./db.js";

setDefaultPackageRoot(resolveInstalledPackageRoot(import.meta.url));

export * from "./constants.js";
export * from "./parser.js";
export * from "./paths.js";
export * from "./search.js";
export * from "./types.js";
