import { Hono } from "hono";
import { buildConfigOutput } from "../../cli/config-command.js";
import type { AppConfig } from "../../config.js";

// CR-039: buildConfigOutput's sdkEnv block passes ANTHROPIC_BASE_URL,
// ANTHROPIC_LOG, OPENAI_BASE_URL, OPENAI_ORG_ID, OPENAI_PROJECT,
// HTTPS_PROXY, HTTP_PROXY and NO_PROXY through verbatim. That is fine for
// the local `moe-flight qa config` CLI output buildConfigOutput also
// feeds (kept as-is, for an operator debugging their own machine), but
// this route serves the same payload over an unauthenticated HTTP GET —
// no Origin/CSRF gate, and serveViaNode binds every interface (no
// `hostname` passed to @hono/node-server). Proxy URLs routinely embed
// `user:password` and an LLM-gateway base URL routinely embeds a token,
// so anything that can reach the daemon's port could read them verbatim.
// Report presence only here, the same way the two API keys already are.
const CREDENTIAL_CAPABLE_SDK_ENV_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_LOG",
  "OPENAI_BASE_URL",
  "OPENAI_ORG_ID",
  "OPENAI_PROJECT",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
] as const;

export function configEffectiveRoutes(config: AppConfig) {
  const router = new Hono();

  router.get("/", (c) => {
    // process.env is read at request time so the sdkEnv section
    // reflects the live process state rather than load-time values.
    const output = buildConfigOutput(config, process.env);
    const sdkEnv = { ...output.sdkEnv };
    for (const key of CREDENTIAL_CAPABLE_SDK_ENV_KEYS) {
      sdkEnv[key] = sdkEnv[key] === null ? "unset" : "set";
    }
    return c.json({ ...output, sdkEnv });
  });

  return router;
}
