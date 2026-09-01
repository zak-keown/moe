# Moe CI variables

This is the complete secret-variable inventory for the TC downstream pipeline.
Do not put the values themselves in this file.

Configure these under **GitLab → Zak/moe → Settings → CI/CD → Variables**.

## Required variables

| Variable | Purpose | GitLab protection | Environment scope |
| --- | --- | --- | --- |
| `PROGET_NPM_AUTH` | Read, publish, verify, and update dist-tags in the internal `tcnpm` feed | Masked, hidden if available, protected, variable expansion disabled | `proget-publish` |
| `TC_GITLAB_TOKEN` | Daily read-only drift comparison against three TC source repositories | Masked, hidden if available, protected, variable expansion disabled | `*` |

### `PROGET_NPM_AUTH`

The registry is committed as:

```text
https://proget.tcdevops.com/npm/tcnpm/
```

The current publisher writes this value to a private, temporary npm config as:

```ini
//proget.tcdevops.com/npm/tcnpm/:_auth=<PROGET_NPM_AUTH>
```

The value must therefore be a single-line npm `_auth` value, normally base64
of `username:password` or `username:ProGet-API-key`. It must not contain a
carriage return or newline.

The ProGet identity needs only these feed permissions:

- read package metadata and exact-version integrity;
- publish packages to `tcnpm`;
- read and update npm dist-tags.

It does not need package deletion, feed administration, or ProGet
administration.

If the available credential is specifically a bearer `_authToken`, do not put
it in this variable yet. The publisher currently uses npm `_auth`; align the
publisher first.

The GitLab deployment environment `proget-publish` is already protected and
restricted to Maintainers. Only the protected default-branch release job is
allowed to receive and use this variable.

### `TC_GITLAB_TOKEN`

Use a least-privilege service, group, project-bot, or personal token with
`read_api` and enough membership to read the `main` commit endpoint for:

- `ai/skills`
- `ai/aigovernance`
- `ai/tc-guide`

Reporter access is sufficient. The token does not need write, repository push,
registry, runner, or administrative scopes.

The variable must use environment scope `*` because the scheduled
`tc-conventions-drift` job is not a deployment job. It is still protected: the
daily schedule targets protected `main`, and the job's safe-environment wrapper
passes only this one intentional secret.

## Not required

No CI variable is needed for:

- the ProGet registry URL or `@tc` scope;
- release version, native targets, or the `docker-image` runner tag;
- npm installation from the public lockfile;
- CodeGraph tooling;
- optional Moedex integration;
- OpenAI, Anthropic, or other model credentials.

CodeGraph and Moedex are consumer-runtime agent/tool connections, not build or
release credentials.

## Failure behavior

- Feature and merge-request pipelines never publish, even if a credential is
  present.
- A protected `main` release without `PROGET_NPM_AUTH` fails before inspecting
  or contacting the registry.
- A scheduled drift run without `TC_GITLAB_TOKEN` reports a soft skip; once the
  variable is configured, a missing project, malformed response, or SHA drift
  fails the job.
