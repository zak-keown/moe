# infra/container

Container image used for install checks and eval runs. A single Ubuntu 26.04
image preinstalled with 22 coding-agent CLIs plus the base toolchains they need
(Node, bun, uv, Rust, mise, Python, Go, Ruby). It is the runtime `moe-mint test`
mounts a generated plugin into.

Not a pnpm workspace member — it lives in `infra/`, is built by CI, and is
consumed by `@bubstack/moe-mint` over the docker CLI, not by import.

**Status:** imported. Two files of code (`Dockerfile`, `bin/harness-versions`),
never built here.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `everyharness-container` | `2467bd7` | MIT |

Upstream in turn extracted these files, 2026-08-11, from
`github.com/prime-radiant-inc/superpowers-evals`' `container/` directory —
dropping the evals-only pieces (serf, gauntlet, quorum, the evals workdir) and
keeping the harness-CLI install layer verbatim, version pins and `TARGETARCH`
plumbing included. That matters for Moe: `superpowers-evals` becomes
`@bubstack/moe-flight`, so this image and flight's container are the same
image twice over, and flight should consume this one rather than rebuild it.

## Layout

```
Dockerfile           169 lines. ubuntu:26.04, every harness CLI pinned to an exact version.
bin/harness-versions On PATH in the image. Prints the resolved version of every
                     baked-in tool, or `missing`. The inventory of record.
LICENSE              Upstream MIT (Copyright © 2026 Prime Radiant, Inc.), verbatim.
```

## What changed on import

**Nothing in the code.** Both files are byte-identical to upstream `2467bd7`.
Neither contains a brand token — no `everyharness`, no `superpowers`, no
`prime-radiant` — so there was nothing in Zone A to rewrite. The rebrand
footprint upstream reported for this repo (3 files) was entirely in `README.md`,
`LICENSE`, and `.github/workflows/build.yml`.

**`.github/workflows/build.yml` is not ported.** It built and pushed the image
to GHCR on every push to main. Its Moe replacement is a rule in the root
`.gitlab-ci.yml` targeting the GitLab container registry — see Follow-ups.

**The upstream `README.md` is superseded, not relocated.** It is a technical
reference doc, not a planning artifact, and every fact in it that is still true
here has been carried into this file with attribution. What was dropped was
false for us: the GHCR pull commands, the `latest`/sha tagging scheme, the first
published build's digest, and the "bump pins one CLI per PR" workflow.

## Image reference

`@bubstack/moe-mint`'s `DEFAULT_IMAGE` (`src/test-command.ts`) points at:

```
registry.gitlab.tcdevops.com/bubstack/moe/moe-container:latest
```

**This reference is an assumption, not a confirmed fact.** ARCHITECTURE.md §8
flags the project path `bubstack/moe` as unconfirmed, and the registry hostname
for a self-hosted GitLab is a per-instance setting (`registry.<host>` vs
`<host>:5050`). Nothing has been pushed there. `moe-mint test --image <ref>`
overrides it, so this is a default to correct, not a dependency to unblock.

## Version-pin policy

Every harness CLI is pinned to an exact version — npm `@scope/pkg@x.y.z`,
`GOOSE_VERSION`, `HERMES_COMMIT` — rather than tracking `latest`. The pins
reproduce a known-working configuration and keep an image rebuild from silently
picking up a breaking upstream release. Inherited from upstream, and worth
keeping: the whole value of the image is that `moe-mint test`'s per-harness
install checks fail for a reason you caused.

## Follow-ups

- Port `build.yml` into the root `.gitlab-ci.yml`: build on changes under
  `infra/container/**`, push to the GitLab container registry, tag with the
  commit SHA as well as `latest`. Confirm the registry hostname while doing it,
  and correct `DEFAULT_IMAGE` to match.
- The image is ~15 GB uncompressed and `linux/amd64` only; on Apple silicon it
  runs under emulation. Nobody has measured what that does to `moe-mint test`
  wall time on the team's actual machines.
- Once `@bubstack/moe-flight` lands, reconcile its container with this one.
  They descend from the same Dockerfile; two copies is the duplication this
  fork exists to remove.
