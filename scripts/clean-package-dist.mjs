import { rm } from "node:fs/promises";
import path, { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Remove one package's complete compiler-output root before a build/cache restore. */
export async function cleanPackageDist(packageRoot, { remove = rm } = {}) {
  await remove(resolve(packageRoot, "dist"), { recursive: true, force: true });
}

const invokedUrl =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedUrl === import.meta.url) {
  await cleanPackageDist(resolve(process.cwd()));
}
