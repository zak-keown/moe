import type { MintConfig } from '../config.js'

// The name/version/description/author/homepage/repository/license/keywords
// subset that every adapter's root manifest starts from — present-only (a
// key appears only when set in moe-mint.yaml). Field order here is
// name, version, description, author, homepage, repository, license,
// keywords; claude-code and cursor reconstruct a different on-disk order
// from the returned object to keep their existing generated output
// byte-identical (see the comments at their call sites).
export function baseManifestFields(config: MintConfig): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    name: config.name,
    version: config.version,
    description: config.description,
  }
  if (config.author) fields.author = config.author
  if (config.homepage) fields.homepage = config.homepage
  if (config.repository) fields.repository = config.repository
  if (config.license) fields.license = config.license
  if (config.keywords) fields.keywords = config.keywords
  return fields
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

// Whether a harness's shell-hook tier (session-start / run-hook.cmd / merged
// hooks.json, and the manifest's `hooks` pointer at that merged file) should
// be emitted for an active bootstrap. False when bootstrap is inactive
// ('none'), or when the plugin author set `harnesses.<name>.hooks: own` to keep
// their own hand-written hooks wiring instead. A harness with no settings entry
// defaults to 'generated'. Shared by claude-code and cursor, the only two
// adapters with a shell-hook tier (see HOOK_EMITTING_HARNESSES in config.ts) —
// each passes its own adapter name.
export function bootstrapEmitsHooks(config: MintConfig, harness: string): boolean {
  return config.bootstrap.kind !== 'none' && (config.harnesses.settings[harness]?.hooks ?? 'generated') === 'generated'
}

// The marketplace listing name an install id addresses the plugin by:
// `config.marketplace.name` when set, otherwise the local-dev default
// `<name>-dev`. Shared so every place that must agree on this name stays in
// lockstep: the claude-code adapter writes it into
// `.claude-plugin/marketplace.json` and its install doc, and the
// copilot adapter's install line reuses it — because
// Copilot resolves plugins through that same `.claude-plugin/marketplace.json`
// (see copilot.ts), so a copilot install id keyed on anything else
// would not resolve.
export function marketplaceName(config: MintConfig): string {
  return config.marketplace?.name ?? `${config.name}-dev`
}

// Any http(s) URL of the shape `https://<host>/<owner>/<repo>[.git]`.
// The three git-hosting shapes moe currently supports — github.com,
// gitlab.com, gitlab.tcdevops.com — all match this. ssh syntax
// (`git@host:owner/repo.git`) and file paths are deliberately NOT matched;
// callers fall back to a `<your-repo>` placeholder in those cases, because
// no install command reliably accepts them across harnesses.
const REPO_URL = /^https?:\/\/([^/\s]+)\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/

// A parsed http(s) repository URL, split into the pieces every install-doc
// path needs: the host (so pi's `git:HOST/OWNER/REPO` shape and non-github
// harness commands can be built), `owner/repo` (used verbatim in
// github-shorthand commands and after `git:HOST/`), and the normalized URL
// (used verbatim by harnesses that want a full URL). `url` preserves a
// trailing `.git` when the input had one — a bare `https://gitlab.…/owner/repo`
// resolves against non-`.git` git remotes and Claude Code accepts both.
export type RepoRef = {
  host: string
  ownerRepo: string
  url: string
}

// Parses config.repository. Returns undefined for missing input or any
// non-http(s) form (ssh, file path) — callers substitute their own placeholder
// rather than guess a shape that might not resolve.
export function parseRepo(repository: string | undefined): RepoRef | undefined {
  if (!repository) return undefined
  const trimmed = repository.trim()
  const match = REPO_URL.exec(trimmed)
  if (!match) return undefined
  const [, host, owner, repo] = match
  return { host: host!, ownerRepo: `${owner}/${repo}`, url: trimmed.replace(/\/$/, '') }
}

// The claude-code marketplace-add target: `owner/repo` shorthand on
// github.com (what `claude /plugin marketplace add` accepts natively), and
// the full URL otherwise. Returns undefined when parseRepo fails so callers
// keep their `<your-repo>` fallback.
export function claudeMarketplaceTarget(repository: string | undefined): string | undefined {
  const ref = parseRepo(repository)
  if (!ref) return undefined
  return ref.host === 'github.com' ? ref.ownerRepo : ref.url
}
