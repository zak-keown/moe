/**
 * Branded type and resolver for the installed package root directory.
 *
 * Every native asset and vendored binary is resolved relative to this root.
 * The root is derived from a known public entrypoint URL (index.js or cli.js),
 * never from an internal chunk or a random import.meta.url.
 */
declare const installedPackageRootBrand: unique symbol;
export type InstalledPackageRoot = string & {
    readonly [installedPackageRootBrand]: true;
};
export declare function resolveInstalledPackageRoot(entrypointUrl: URL | string): InstalledPackageRoot;
export {};
