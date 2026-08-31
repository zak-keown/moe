# infra/container

Container image used for install checks and eval runs.

**Status:** scaffold. No code imported yet.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `everyharness-container` | `2467bd7` | MIT |

## Import notes

- Five files upstream: a `Dockerfile` and a `bin/` entrypoint. It is the runtime for
  `@bubstack/moe-mint`'s install checks, which is why it is not a separate package.
- Lands in `infra/`, not `packages/` — it is not a pnpm workspace member.
- Upstream `build.yml` builds and pushes the image. Port it to `.gitlab-ci.yml` with a
  GitLab container registry target.
