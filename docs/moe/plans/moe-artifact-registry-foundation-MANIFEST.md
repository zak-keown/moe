# Moe Artifact and Registry Foundation Plan Set

This manifest sequences the approved artifact-and-registry foundation design into four independently reviewable implementation plans. Execute them in order: each plan consumes tested contracts from its predecessor, and no release or certification work begins before the local artifact gates are green.

The plans were written against repository SHA `8bd3d7432fdf57cc5f82a353fd33109ea81ae317` and the approved specification at `docs/moe/specs/2026-09-02-moe-artifact-registry-foundation-design.md`.

All four plans are runnable in sequence. `OD-R1` is resolved in the design and Plan 4: Statusline's registry-confirmed first publication records `NO_PREDECESSOR` and remains preview, while the five predecessor-backed Claude/macOS tuples may certify. The plan-set dispatcher can therefore release Plan 4 after artifact verification completes.

```yaml
plans:
  - id: platform-registry
    plan: docs/moe/plans/2026-09-02-moe-platform-registry.md
    depends_on: []
    status: done
  - id: artifact-composition
    plan: docs/moe/plans/2026-09-02-moe-artifact-composition.md
    depends_on: [platform-registry]
    status: done
  - id: artifact-verification
    plan: docs/moe/plans/2026-09-02-moe-artifact-verification.md
    depends_on: [artifact-composition]
    status: done
  - id: release-catalog-and-promotion
    plan: docs/moe/plans/2026-09-02-moe-release-catalog-and-promotion.md
    depends_on: [artifact-verification]
    status: pending
```

## Acceptance Boundary

The plan set is complete only when all four plans' completion evidence is satisfied, the stable composed-artifact `0.1.x` catalog exists, the five predecessor-backed Claude/macOS tuples are evidence-certified, first-publish Statusline is evidence-bound but remains preview, and `pnpm mint:check`, `pnpm artifact:check`, `pnpm provenance`, and `pnpm check` all pass from a clean checkout.
