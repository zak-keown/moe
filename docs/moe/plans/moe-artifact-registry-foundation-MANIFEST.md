# Moe Artifact and Registry Foundation Plan Set

This manifest sequences the approved artifact-and-registry foundation design into four independently reviewable implementation plans. Execute them in order: each plan consumes tested contracts from its predecessor, and no release or certification work begins before the local artifact gates are green.

The plans were written against repository SHA `8bd3d7432fdf57cc5f82a353fd33109ea81ae317` and the approved specification at `docs/moe/specs/2026-09-02-moe-artifact-registry-foundation-design.md`.

Plans 1–3 are runnable in sequence. Plan 4 contains decision-independent machinery in Tasks 1–7, but the manifest deliberately holds the whole plan at `blocked`: the plan-set dispatcher operates at plan granularity and must not report a partially runnable plan. Resolve `OD-R1`, amend Plan 4 to the chosen maintenance contract, and change its manifest status to `pending` before dispatch. The blocker exists because `@bubstack/moe-statusline` has no npm predecessor from which to prove a real update, and any predecessor must exist before npm state is snapshotted and the candidate lock is sealed.

```yaml
plans:
  - id: platform-registry
    plan: docs/moe/plans/2026-09-02-moe-platform-registry.md
    depends_on: []
    status: pending
  - id: artifact-composition
    plan: docs/moe/plans/2026-09-02-moe-artifact-composition.md
    depends_on: [platform-registry]
    status: pending
  - id: artifact-verification
    plan: docs/moe/plans/2026-09-02-moe-artifact-verification.md
    depends_on: [artifact-composition]
    status: pending
  - id: release-catalog-and-promotion
    plan: docs/moe/plans/2026-09-02-moe-release-catalog-and-promotion.md
    depends_on: [artifact-verification]
    status: blocked
```

## Acceptance Boundary

The plan set is complete only when all four plans' completion evidence is satisfied, the stable composed-artifact `0.1.x` catalog exists, only evidence-backed Claude/macOS tuples are certified, and `pnpm mint:check`, `pnpm artifact:check`, `pnpm provenance`, and `pnpm check` all pass from a clean checkout.
