# Post-Port Plans

## Decision nodes in the plan-set manifest

Follow-up from the `writing-plans` decision-ledger work (2026-09-01). That
change put decisions and tasks in separate ledgers *inside* one plan document,
where the frontier is computed by reading. It stopped at the plan boundary on
purpose.

`sequencing-plans` already has wayfinder's blocking machinery for the
cross-plan case — `depends_on`, `status`, and `plan-set next` as a Kahn
ready-set — but every node in a manifest is a slice of a build. There is no
node whose resolution is an answer, so a decision cannot block a whole plan and
`plan-set next` will hand back a plan whose premise nobody settled.

Teaching the manifest a `kind: decision` node would close that. It is code, not
prose: `packages/core/hooks/plan-set` plus its test block in
`packages/core/test/metadata.test.ts`, and `sequencing-plans` prose to match.
Worth doing only if the intra-plan ledger proves itself in use first.
