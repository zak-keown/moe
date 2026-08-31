# Parity inventory

The fork's ledger. Every upstream repository, the exact revision forked, its
license, and where it lands. With no reachable upstream author for this fork,
this file is how a pre-fork decision gets reconstructed: find the artifact, not
the person.

**Snapshots are the spec, not upstream HEAD.** The 19 repositories live in
`../.moe-references/` (gitignored). They are shallow clones — one commit each, so there
is no upstream history to preserve and no `git subtree` or `filter-repo` import
to attempt. Do not consult upstream `main`: parity against a moving target is
unfalsifiable.

Regenerate the pinned column with:

```sh
cd ../.moe-references && for r in */; do n=${r%/}
  printf '| `%s` | %s | %s |\n' "$n" "$(git -C $n rev-parse --short HEAD)" "$(git -C $n log -1 --format=%cs)"
done
```

## Map

| Upstream repo | Pinned | Date | License | → lands as |
|---|---|---|---|---|
| `superpowers` | `b36e082` | 2026-08-12 | MIT | `@bubstack/moe-core` |
| `superpowers-lab` | `51111f7` | 2026-06-01 | MIT | `@bubstack/moe-core` |
| `superpowers-developing-for-claude-code` | `74afe93` | 2025-12-03 | MIT | `@bubstack/moe-core` |
| `iterative-development` | `c05889a` | 2026-06-06 | Apache-2.0 | `@bubstack/moe-core` |
| `the-elements-of-style` | `05fc4f0` | 2026-08-12 | Public domain | `@bubstack/moe-core` |
| `double-shot-latte` | `dfe7567` | 2026-02-25 | MIT | `@bubstack/moe-core` (hooks) |
| `greenfield` | `6e6d4b4` | 2026-08-06 | Apache-2.0 | `@bubstack/moe-backstory` |
| `episodic-memory` | `1075769` | 2026-05-21 | MIT | `@bubstack/moe-memory` |
| `private-journal-mcp` | `016953f` | 2026-08-11 | MIT | `@bubstack/moe-memory` |
| `gauntlet` | `91b6f7e` | 2026-08-06 | Apache-2.0 | `@bubstack/moe-flight` |
| `superpowers-evals` | `114f725` | 2026-08-25 | **none — see below** | `@bubstack/moe-flight` |
| `everyharness` | `4f7c5e2` | 2026-08-15 | MIT | `@bubstack/moe-mint` |
| `everyharness-container` | `2467bd7` | 2026-08-11 | MIT | `infra/container` |
| `claude-session-driver` | `d97d1eb` | 2026-06-14 | MIT | `@bubstack/moe-crew` |
| `superpowers-chrome` | `782358e` | 2026-08-07 | MIT | `@bubstack/moe-glass` |
| `obol` | `28e3dba` | 2026-08-06 | Apache-2.0 | `@bubstack/moe-tab` |
| `smevals` | `0c28dc6` | 2026-08-11 | MIT | `py/proof` |
| `superpowers-marketplace` | `1ab7b8e` | 2026-08-12 | MIT | `.claude-plugin/marketplace.json` |
| `prime-radiant-marketplace` | `49a45ef` | 2026-06-06 | Apache-2.0 | `.claude-plugin/marketplace.json` |

### Excluded

| Upstream repo | Pinned | Why |
|---|---|---|
| `superpowers-autoresearch` | `6e6f33f` | 16 MB of research campaigns, logs, raw captures and reports. Data, not code, and no LICENSE. Kept as a reference snapshot only. |

## License exposure

Everything forked is MIT, Apache-2.0, or public domain, and all three require
retaining the notices — so upstream `LICENSE` files travel with the code they
cover, under each package, and `NOTICE` at the root carries attribution. Apache-2.0
also requires stating that files were changed; the rebrand does change them.

**One item, knowingly accepted.** `superpowers-evals` ships **no `LICENSE` file
and no `package.json` license field**. No grant of rights has been located, so the
default is all rights reserved. It is the single largest body of forked material —
796 files, 17 MB, roughly half the rebrand surface — and it lands in
`@bubstack/moe-flight` alongside Apache-2.0 `gauntlet`.

**Decision, 2026-08-31, Zak Keown: imported anyway, on internal-use grounds.** Moe
is an internal tool for roughly twenty people in one company, and `flight` is not
distributed. That is a low-magnitude risk the company accepts.

The risk is not uniform, and the boundary is distribution, not use. These are the
conditions under which the decision above stops holding:

| Condition | Effect |
|---|---|
| `@bubstack/moe-flight` published to any registry — npm, the GitLab Package Registry, anywhere | Decision void. Do not publish. |
| Moe open-sourced, or any part of `flight` shipped to a customer or contractor | Decision void. Revisit first. |
| Moe distributed outside the company by any other means | Decision void. |
| Prime Radiant states a license | Risk goes to zero. Update this section. |

Enforced in code, not only in prose: `@bubstack/moe-flight` and its two frontends
carry `"private": true`, and `flight` is absent from
`.claude-plugin/marketplace.json`. Anyone removing either should read this section
first.

**The cheap resolution is exhausted, not pending.** A license request was opened on
`prime-radiant-inc/superpowers-evals` around 2026-08-01 and is still unacknowledged
thirty days later. Do not open another; that path has been tried.

Two things follow, and they point in opposite directions:

- **It strengthens the position.** There is a documented, public, good-faith attempt
  to clarify, made before the fork and left unanswered.
- **It grants nothing.** Silence is not permission. Thirty days of no response is
  evidence that the repository is inattentive or abandoned — not evidence of a
  grant. Anyone reading this later should not round "we asked and they did not
  answer" up to "they said it was fine."

So the *Prime Radiant states a license* row above is now unlikely to ever fire. The
distribution boundary is not a stopgap until an answer arrives; it is the permanent
control. Treat it that way.

This is also the second independent signal that the upstream is unreachable — the
first being that every snapshot in `../.moe-references/` is a shallow, single-commit
clone with no history to consult. Which is exactly why this file exists: when there
is no author to ask, the written record is the only way a decision survives.

## Rebrand footprint

19 in-scope repositories, 2964 files. **1632 of them (55%) contain at least one
brand token** — `superpowers`, `gauntlet`, `quorum`, `obol`, `greenfield`,
`everyharness`, `elements-of-style`, `episodic-memory`, `private-journal`,
`double-shot-latte`, `claude-session-driver`, `smevals`, `obra`, `prime-radiant`.

| Upstream repo | Files to touch |
|---|---|
| `superpowers-evals` | 796 |
| `gauntlet` | 276 |
| `superpowers` | 125 |
| `obol` | 95 |
| `everyharness` | 75 |
| `episodic-memory` | 59 |
| `superpowers-chrome` | 50 |
| `the-elements-of-style` | 31 |
| `smevals` | 23 |
| `iterative-development` | 22 |
| `claude-session-driver` | 22 |
| `greenfield` | 15 |
| `private-journal-mcp` | 14 |
| `superpowers-developing-for-claude-code` | 9 |
| `double-shot-latte` | 7 |
| `prime-radiant-marketplace` | 5 |
| `superpowers-marketplace` | 3 |
| `everyharness-container` | 3 |
| `superpowers-lab` | 2 |

Half the work is one package. Import `flight` last, once the license question is
settled and the rename conventions have been proven on smaller packages.

### Identifiers that change

Not text substitutions — each is a breaking interface change, and each needs a
deliberate mapping rather than a regex:

| Kind | Upstream | Moe |
|---|---|---|
| MCP server key | `episodic-memory` | `moe-memory` |
| MCP server key | `chrome` | `moe-glass` |
| bin | `episodic-memory`, `-index`, `-search`, `-mcp-server` | `moe-memory` + subcommands |
| bin | `private-journal-mcp` | folded into `moe-memory` |
| bin | `gauntlet` | `moe-flight` |
| bin | `quorum`, `evals-appliance` | `moe-flight` subcommands |
| bin | `everyharness` | `moe-mint` |
| bin | `obol` | `moe-tab` |
| bin | `superpowers-chrome-mcp` | `moe-glass` |
| npm package | `@primeradianthq/obol` | `@bubstack/moe-tab` (`workspace:*`) |
| PyPI package | `smevals` | `moe-proof` |

Watch for these beyond source: `${CLAUDE_PLUGIN_ROOT}` paths in plugin manifests,
skill frontmatter `name:` fields, hook script paths, and `catalog-info.yaml`
service identifiers.

## GitHub → GitLab

Origin is GitLab, self-hosted at `gitlab.tcdevops.com`. Upstream stays on
GitHub. **Two kinds of URL, opposite treatment** — a blanket
find-and-replace gets this wrong:

| URL kind | Example | Treatment |
|---|---|---|
| Provenance | "derived from `github.com/obra/superpowers`" | **Keep.** Rewriting it destroys attribution the licenses require. |
| Self-referential | `homepage`, `repository`, `bugs`, badges, issue links, clone instructions | **Rewrite** to GitLab. |

`README.md` badge rows are the densest offenders — `smevals` alone carries four
pointing at PyPI, GitHub releases, and GitHub Actions.

### CI to port

11 workflows across 7 repos, all of which are replaced by one root
`.gitlab-ci.yml`:

| Upstream repo | Workflows |
|---|---|
| `obol` | `ci.yml`, `release.yml`, `crates-release.yml`, `pypi-release.yml` |
| `smevals` | `test.yml`, `publish.yml` |
| `claude-session-driver` | `ci.yml` |
| `everyharness` | `ci.yml` |
| `everyharness-container` | `build.yml` |
| `gauntlet` | `check.yml` |
| `superpowers-evals` | `test.yml` |

The four release workflows publish to crates.io and PyPI. **Decided 2026-08-31:
deleted, not ported.** Moe publishes nothing publicly; anything that must be
consumable outside the repo goes to the GitLab instance registry under
`@bubstack`. Same boundary as the License exposure decision above.

### Not ported

| Path | Why |
|---|---|
| `superpowers/.github/FUNDING.yml` | Solicits sponsorship for the upstream author. Delete. |
| `superpowers/.github/ISSUE_TEMPLATE/` | Rebuild as GitLab issue templates rather than translate. |
| `superpowers-evals/.github/CODEOWNERS` | Becomes root `CODEOWNERS` with Moe owners. |
| `*/.github/PULL_REQUEST_TEMPLATE.md` | Becomes `.gitlab/merge_request_templates/`. |
