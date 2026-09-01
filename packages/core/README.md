# Moe Core

Moe's shared coding-agent skills, focused agents, and session hooks. The package
covers planning, context retrieval, implementation, debugging, review,
collaboration, writing, and plugin authoring.

## Layout

- `skills/` — source skills, including shared references.
- `agents/` — focused retrieval and review agents.
- `hooks/` — session bootstrap and guard hooks.
- `mint/` — plugin generation configuration.
- `test/` — metadata, content, hook, and behavior tests.

Skills are assigned to exactly one tier in `skill-tiers.yaml`. Add or remove a
skill there whenever its directory changes.

## AI governance mapping

TC's AI Governance policy is mandatory and is intentionally not vendored as a
skill. Install it at the user-instruction layer as directed by
`ai/aigovernance`; `hooks/tc-governance-check` provides a non-blocking
SessionStart reminder when it is absent. Set
`MOE_TC_GOVERNANCE_DISABLED=1` on non-TC checkouts.

| § | Requirement | Moe surface |
|---|---|---|
| §1 | Credential and secret protection | The policy text; Moe stores no credentials. |
| §2 | Data protection and PII | The policy text; completion evidence stays under `$HOME`. |
| §3 | Destructive actions | The policy text and the worktree/branch-finishing skills. |
| §4 | Least privilege | Retrieval agents declare explicit tool allowlists. |
| §5 | SQL safety | The policy text; core has no database. |
| §6 | Dependency safety | `PARITY.md` records imported licenses and risk decisions. |
| §7 | Escalation | Verification and systematic-debugging skills. |
| §8 | Auditability | Branch-finishing guidance requires agent-authored MR labels. |
| §9 | Transparency | Verification-before-completion requires evidence-backed claims. |
| §10 | `.ai-privacy.yml` | The root policy declaration; enforcement remains separate work. |
| §11 | Enforcement | The policy remains above skills in the instruction hierarchy. |

## Generated plugin

The installable output is generated under `/plugins` from `mint/*.yaml`.
Never hand-edit the generated manifest.

## Development

```sh
pnpm --filter @tc/moe-core typecheck
pnpm --filter @tc/moe-core test
pnpm --filter @tc/moe-core test:python
pnpm --filter @tc/moe-core test:shell
pnpm mint
```

Some optional suites require Python, Graphviz, or a browser runtime; see the
root `AGENTS.md` for the supported gate matrix.
