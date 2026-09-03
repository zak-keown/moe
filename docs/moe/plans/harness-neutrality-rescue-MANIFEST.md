# Harness-Neutrality Rescue Plan Set

This manifest sequences the harness-neutrality rescue into three independently
reviewable plans. The user-supplied rescue plan is the intent contract; these
files add executable task metadata without narrowing that contract.

The plans were written against repository SHA
`77a3d2180f482d522999ce55d946d060406ea97c` and supersede conflicting delivery
assumptions in `docs/moe/specs/2026-09-02-native-renderers-design.md`.

```yaml
plans:
  - id: renderer-and-adapter-correctness
    plan: docs/moe/plans/2026-09-03-harness-neutrality-01-renderer.md
    depends_on: []
    status: done
  - id: semantic-vocabulary-and-core-migration
    plan: docs/moe/plans/2026-09-03-harness-neutrality-02-semantics.md
    depends_on: [renderer-and-adapter-correctness]
    status: done
  - id: crew-installer-and-host-ux
    plan: docs/moe/plans/2026-09-03-harness-neutrality-03-host-ux.md
    depends_on: [semantic-vocabulary-and-core-migration]
    status: done
```

## Acceptance Boundary

The set is complete only when every active adapter discovers its actual rendered
skill tree, generated resource closure succeeds, generic output contains no
unapproved Claude runtime contracts, crew and installer selection are
deterministic, manual-only installers remain side-effect-free, and all gates in
the user-supplied Verification and Completion section pass.
