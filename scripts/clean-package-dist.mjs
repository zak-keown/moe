import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const packageRoot = resolve(process.cwd());
await rm(resolve(packageRoot, "dist"), { recursive: true, force: true });
