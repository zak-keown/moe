# Skill Backend Runtime Standard Plan Set

This plan set implements the approved runtime standard at
`docs/moe/specs/2026-09-03-skill-backend-runtime-standard-design.md`. It was
written against repository SHA `bf36651d83530f524a94db35493ee860f9e3c9fb`.

Run one plan at a time through `sequencing-plans`. The order is deliberately
linear: the validator contract precedes migrations, later migrations consume
the same naming/layout rules, and enforcement activates only after every
source tree conforms. The complete sequence lands as one atomic repository
change; generated plugins are updated only by the final plan.

```yaml
plan_set_id: skill-backend-runtime-standard
depends_on_plan_sets: []
plans:
  - id: runtime-validator
    plan: docs/moe/plans/2026-09-03-skill-runtime-01-validator.md
    depends_on: []
    status: done
    commits: dee3ed9..6221ce1
  - id: core-data
    plan: docs/moe/plans/2026-09-03-skill-runtime-02-core-data.md
    depends_on: [runtime-validator]
    status: pending
  - id: core-process
    plan: docs/moe/plans/2026-09-03-skill-runtime-03-core-process.md
    depends_on: [core-data]
    status: pending
  - id: glass-esm
    plan: docs/moe/plans/2026-09-03-skill-runtime-04-glass.md
    depends_on: [core-process]
    status: pending
  - id: enforcement-activation
    plan: docs/moe/plans/2026-09-03-skill-runtime-05-activation.md
    depends_on: [glass-esm]
    status: pending
```

The plan set is complete only when the Mint assembly and live-repository gates
use the same validator, every in-scope production helper is dependency-free
Node 24 ESM beneath its owning `scripts/`, generated plugins are reproducible,
and all final qualification commands in `enforcement-activation` pass.
