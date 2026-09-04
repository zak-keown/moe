// Extension discovery for jig's CLI.
//
// jig probes for known extension packages at startup (e.g.
// @bubstack/moe-jig-graph/jig-extension) and merges any commands they
// expose into existing command groups (`plan`, `spec`, etc). Discovery
// failure — package not installed, resolution error, anything — is
// silent: jig continues with its built-in commands only. A command NAME
// collision between an extension and a built-in is not silent: it throws,
// since a silently shadowed built-in is a worse failure mode than a loud
// one.
//
// jig is ESM ("type": "module"), so this does NOT use require/
// require.resolve. Real discovery (discoverExtensionCommands below) uses
// import.meta.resolve — synchronous, throws when a specifier can't be
// resolved, the ESM analog of require.resolve's throw-on-miss — followed by
// a dynamic import() of the resolved module. Dynamic import() has no
// synchronous form, so discovery is async, while loadExtensions itself
// (the part that mutates the commander program) stays synchronous so it
// can be unit-tested with a plain injected resolver. Production wiring
// (cli.ts) awaits discoverExtensionCommands() once at startup — ESM module
// top level supports top-level await — and passes the result into
// loadExtensions via a resolver closure.

import { Option } from "commander";
import type { Command } from "commander";
import type { computeWaves, PlanTask, parsePlan, validatePlan } from "./parser.js";

// Re-exported for extension authors: JigContext.parsePlan resolves to
// { tasks: PlanTask[] }, so anything consuming JigContext at
// "@bubstack/moe-jig/extension" needs this type reachable from the same
// module without a second import from "@bubstack/moe-jig/parser".
export type { PlanTask };

export interface JigContext {
  parsePlan: typeof parsePlan;
  validatePlan: typeof validatePlan;
  computeWaves: typeof computeWaves;
}

export interface JigExtensionCommand {
  namespace: string;
  name: string;
  description: string;
  options?: { flags: string; description: string }[];
  run(args: string[], ctx: JigContext): Promise<number>;
}

type ExtensionResolver = () => JigExtensionCommand[];

const EXTENSION_PACKAGES = ["@bubstack/moe-jig-graph/jig-extension"];

interface ExtensionModule {
  commands?: JigExtensionCommand[];
  default?: { commands?: JigExtensionCommand[] };
}

/**
 * Probes {@link EXTENSION_PACKAGES} for an installed extension package and
 * returns the commands it exports. Never throws — a missing, unresolvable,
 * or failing-to-import extension package is treated the same as "no
 * extension installed" and discovery moves on to the next candidate (or
 * returns an empty array once candidates are exhausted).
 */
export async function discoverExtensionCommands(): Promise<JigExtensionCommand[]> {
  for (const pkg of EXTENSION_PACKAGES) {
    try {
      const resolvedUrl = import.meta.resolve(pkg);
      const mod = (await import(resolvedUrl)) as ExtensionModule;
      return mod.commands ?? mod.default?.commands ?? [];
    } catch {
      // Extension not installed, or failed to resolve/import — try the
      // next candidate package, if any.
    }
  }
  return [];
}

// The synchronous default used when loadExtensions is called without an
// explicit resolver. Real discovery is async under ESM (see
// discoverExtensionCommands above), so this default is a no-op: production
// callers should await discoverExtensionCommands() once at startup and pass
// a resolver that closes over its result (see cli.ts).
function defaultResolver(): JigExtensionCommand[] {
  return [];
}

export function loadExtensions(
  program: Command,
  ctx: JigContext,
  resolve: ExtensionResolver = defaultResolver,
): void {
  let commands: JigExtensionCommand[];
  try {
    commands = resolve();
  } catch {
    // Resolver failed — treat exactly like "no extension found."
    return;
  }

  for (const ext of commands) {
    const group = program.commands.find((c) => c.name() === ext.namespace);
    if (!group) continue;

    const existing = group.commands.find((c) => c.name() === ext.name);
    if (existing) {
      throw new Error(
        `Extension collision: "${ext.namespace} ${ext.name}" shadows a built-in command`,
      );
    }

    const sub = group.command(ext.name).description(ext.description);

    // Commander stores parsed options under a camelCased property derived
    // from the flag's long name (e.g. `--dry-run` -> opts.dryRun). Track
    // each declared flag's original spelling by that same derived key so
    // forwarding can reconstruct the literal flag string the user typed
    // (and the extension's own run() checks for), instead of re-deriving
    // `--${key}` — which is wrong for any flag with more than one word.
    const flagByAttribute = new Map<string, string>();
    if (ext.options) {
      for (const opt of ext.options) {
        sub.option(opt.flags, opt.description);
        const parsed = new Option(opt.flags, opt.description);
        if (parsed.long) flagByAttribute.set(parsed.attributeName(), parsed.long);
      }
    }

    sub
      .argument("[args...]", "command arguments")
      .action(async (args: string[], opts: Record<string, unknown>) => {
        const flatArgs = [...args];
        for (const [k, v] of Object.entries(opts)) {
          const flag = flagByAttribute.get(k) ?? `--${k}`;
          if (v === true) flatArgs.push(flag);
          else if (typeof v === "string") flatArgs.push(flag, v);
        }
        const code = await ext.run(flatArgs, ctx);
        if (code !== 0) process.exitCode = code;
      });
  }
}
