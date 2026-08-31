# moe-proof

Evals against small (and large) models. Measures how strong a model is.

**Status:** scaffold. No code imported yet.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `smevals` | `0c28dc6` | MIT |

Copyright is held by Prime Radiant, Inc.; `pyproject.toml` credits Simon Willison
as author. Both are recorded in the root [NOTICE](../../NOTICE).

## Import notes

- PyPI has no scopes, so this is `moe-proof`, not `@bubstack/moe-proof`. `bin smevals -> moe-proof`.
- Stays Python and stays outside the pnpm workspace. Driven by root `pnpm proof:test`.
- Not merged into `moe-flight`. `proof` evaluates models; `flight` evaluates agent
  workflows and software under development. Three jobs sharing a syllable is not a
  merge argument.
- Candidate dependency on `moe-tab`'s Python binding for cost data — confirm before adding.
- **Blocked locally:** `uv` is not installed and system Python is 3.9.6, below the
  `>=3.10` floor. Both are needed before `pnpm proof:test` runs.
- Two upstream CI workflows here, one of which publishes to PyPI. Decide whether Moe
  publishes publicly before porting it.
- README badges point at PyPI, GitHub releases and GitHub Actions. All four are
  self-referential and get rewritten or dropped — see PARITY.md.
