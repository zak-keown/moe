# Emerging harnesses: Apache Maka and OpenClaude

Date: 2026-09-03
Status: Research needed -- skeleton adapters exist but are NOT wired into the
live pipeline.

## Overview

Two coding-agent harnesses have reached enough visibility to warrant skeleton
adapter files in `packages/mint/src/adapters/`. Neither adapter is registered
in `adapters/index.ts` or `ADAPTER_NAMES` in `config.ts`; they exist only as
TypeScript source that compiles against the `HarnessAdapter` interface. They
will not run during `pnpm mint` and will not appear in the support matrix or
install docs until they are promoted.

## Apache Maka (harness #9 candidate)

### What we know

- Entered the Apache Incubator on 2026-08-13.
- Local-first architecture: Desktop (Electron), TUI, and CLI share one
  "Runtime Host."
- Plugin surface exists -- the incubator proposal mentions "Runtime Host
  extensions" as the mechanism.
- MCP is listed as a supported protocol.
- Apache-2.0 licensed.

### What the adapter assumes

- The adapter pattern is closest to **opencode/pi**: a JS/TS module loaded
  by the Runtime Host that registers a skills directory and optionally
  injects bootstrap content.
- Directory-based skill loading is likely (every modern harness does this),
  so `skills` is marked `partial` in the support matrix.
- Everything else is marked `none`.

### What needs verification

| Question | Impact |
|---|---|
| Manifest filename and schema | Determines what `emit()` writes |
| Plugin discovery path (`.maka/`, `maka-plugin/`, `package.json` field?) | Determines output directory structure |
| Install CLI command | Required for `installDoc()` |
| Whether Desktop/TUI/CLI need separate wiring or share one loader | May need multiple output targets |
| Skill loading mechanism (directory registration? frontmatter format?) | Determines whether `skills: 'full'` is achievable |
| Command / agent translation surface | Determines `commands` and `agents` support levels |
| Hook system (if any) | Determines `hooks` support level |
| MCP integration shape | Determines `mcp` support level |
| Bootstrap injection point (system prompt? first-message? lifecycle hook?) | Determines `bootstrap` support level |

### Where to look

- Apache Incubator: `https://incubator.apache.org/projects/maka.html`
- GitHub: `https://github.com/apache/incubator-maka` (or `apache/maka`)
- Look for: `docs/`, `CONTRIBUTING.md`, any `plugin-loader` or
  `extension-loader` source, `RuntimeHost` class definition.

## OpenClaude (harness #10 candidate)

### What we know

- Multi-provider CLI coding agent.
- Substantial community traction (~32k GitHub stars as of 2026-09).
- MIT licensed.
- Supports multiple LLM providers ("open" in the name).

### What the adapter assumes

- The adapter pattern is closest to **codex**: CLI-only, no desktop surface.
- Directory-based skill loading is likely, so `skills` is marked `partial`.
- A CLI likely has slash-commands, but this is unverified.
- Everything else is marked `none`.

### What needs verification

| Question | Impact |
|---|---|
| Manifest filename and schema (`.openclaude/`? `openclaude.json`? `.oc/`?) | Determines what `emit()` writes |
| Plugin discovery mechanism | Determines output directory structure |
| Install CLI command | Required for `installDoc()` |
| Whether it uses its own marketplace or piggybacks on another | Determines marketplace integration |
| Skill loading mechanism (markdown with frontmatter? directory-based?) | Determines `skills` support level |
| Command / slash-command translation surface | Determines `commands` support level |
| Agent definition format (if multi-agent is supported) | Determines `agents` support level |
| Hook system shape | Determines `hooks` support level |
| MCP integration shape | Determines `mcp` support level |
| Bootstrap injection mechanism | Determines `bootstrap` support level |

### Where to look

- GitHub: search for "openclaude" -- identify the canonical repo.
- Look for: plugin docs, extension points, manifest schema, `CONTRIBUTING.md`.

## Promotion checklist

Before wiring either adapter into the live pipeline:

1. Confirm the plugin API by reading primary sources (docs, source code).
2. Fill in the `emit()` body with real manifest generation.
3. Update the support matrix to reflect verified capabilities.
4. Write a real `installDoc()` with actual install commands.
5. Add the adapter name to `ADAPTER_NAMES` in `config.ts` (at the END,
   after `copilot`).
6. Import and append the adapter in `adapters/index.ts` (same position).
7. Update the `docs-emit.test.ts` exact-content test to expect the new
   rows in the support matrix table.
8. Update `CLAUDE.md` line referencing "8 harnesses" to the new count.
9. Decide whether to add to `harnesses.exclude` in `packages/core/mint/moe.yaml`
   (recommended until the adapter is battle-tested).
10. Run `pnpm check` and `pnpm mint:check`.
