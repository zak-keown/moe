import { probe } from "../runtime/index.js";

if (process.argv[1] === new URL(import.meta.url).pathname) {
  process.stdout.write(`${JSON.stringify(probe())}\n`);
}

export { probe };
