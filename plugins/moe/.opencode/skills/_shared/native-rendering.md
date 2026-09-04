# Native Rendering Ladder

When a skill has something to SHOW — a mockup, a report, a plan, a
duplicate-function analysis table — it walks this ladder from top to
bottom and uses the first rung that actually works in the current
runtime. It NEVER stalls when a rung is unavailable: it drops one and
keeps going.

The ladder is the reason the three skills that name it
(`brainstorming`, `writing-plans`, `finding-duplicate-functions`) can
render on Claude Code AND on runtimes without a native artifact tool
without carrying two branches of prose per skill.

## The four rungs

1. **Claude Code Artifact tool** — publish an artifact via the host's
   Artifact tool. The user sees it inline in their client; the URL is
   private-by-default (see [Sharing default](#sharing-default) below).
2. **Browser companion** — the in-repo brainstorm server
   (`${CLAUDE_PLUGIN_ROOT}/skills/brainstorming/scripts/start-server.mjs`)
   watches a session directory and serves HTML to the user's browser.
   Available whenever `node` is on PATH and the sandbox lets us bind a
   port.
3. **Local HTML file** — write a self-contained HTML file to disk and
   tell the user its absolute path. They open it themselves. Works
   whenever the sandbox is writable and the user has local filesystem
   access.
4. **Markdown file** — write to disk as a plain `.md`. Every harness
   can read markdown; this rung always works, and every skill that
   depends on the ladder MUST be able to fall through to it.

## Degrade cleanly

If installed and configured, use the higher rung. Otherwise, drop.

- Rung 1 fails when the harness exposes no Artifact tool (Codex,
  Gemini CLI, Kimi Code, OpenCode, Pi, most non-Claude Code
  runtimes). If the tool is present but the publish itself errors,
  fall to rung 2 — do not surface the raw error at the user.
- Rung 2 fails when `node` isn't on PATH, when the sandbox blocks port
  binding, or when there is no browser to point at (headless CI,
  detached tmux). See the platform reference under
  `${CLAUDE_PLUGIN_ROOT}/skills/using-moe/references/` for per-harness
  notes.
- Rung 3 fails when the sandbox is read-only, or when the user has no
  local filesystem access (remote-only or in-container sessions where
  they cannot open a file path).
- Rung 4 is the floor. If it fails, the rendering itself is broken and
  the failure is reportable — never silent.

Announce which rung you took, one line, before the render lands:
"Rendering the plan as a Claude artifact" / "Opening the brainstorm
companion in your browser" / "Wrote the report to `<path>`". This lets
your human partner override a rung that reads correctly but suits them
poorly today (e.g. "just give me the markdown, I'm on a plane").

## Sharing default

Rung 1's Artifact tool creates artifacts your human partner CAN share,
but they start PRIVATE. Skills MUST NOT announce a shareable URL by
default — present the artifact, leave the sharing decision with them.

The opt-in override is `MOE_ARTIFACT_SHARING`, modeled on
`MOE_LATTE_ENABLED`:

- Unset, `0`, `false`, `no`, `off`: **default off.** Skills keep
  artifacts private and don't proactively hand out a shareable link.
- Any other value: skills may present the shareable link inline.

Default is off because handing out a shareable URL is a distribution
decision the user owns, not the agent's. The env var lets a team turn
it on once at the shell level rather than re-consent every
conversation.
