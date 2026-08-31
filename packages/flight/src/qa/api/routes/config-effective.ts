import { Hono } from "hono";
import type { AppConfig } from "../../config.js";
import { buildConfigOutput } from "../../cli/config-command.js";

export function configEffectiveRoutes(config: AppConfig) {
  const router = new Hono();

  router.get("/", (c) => {
    // process.env is read at request time so the sdkEnv section
    // reflects the live process state rather than load-time values.
    return c.json(buildConfigOutput(config, process.env));
  });

  return router;
}
