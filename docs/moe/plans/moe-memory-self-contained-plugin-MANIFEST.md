# Moe Memory Self-Contained Plugin Plan Set

This plan set implements the approved self-contained `moe-memory` design. It
consumes the registry, compositor, artifact-manifest, pack, provenance, and
release-catalog interfaces produced by
`docs/moe/plans/moe-artifact-registry-foundation-MANIFEST.md`; that entire plan
set is a hard prerequisite and must be `done` before this manifest is
dispatched. The cross-manifest plan DAG enforces that boundary. Foundation
`OD-R1` is resolved: Statusline may record a
registry-confirmed `NO_PREDECESSOR` result and remain preview while the five
predecessor-backed Claude/macOS tuples certify. The prerequisite still includes
publishing the stable composed Memory 0.1.5 predecessor; Memory's API diff and
recovery capsules intentionally bind to that version. `plan-set next` with or
without `--manifest` withholds Memory plans while the prerequisite manifest is
unfinished. Run one Memory plan at a time through `sequencing-plans`; do not
infer completion from generated files alone.

```yaml
plan_set_id: moe-memory-self-contained-plugin
depends_on_plan_sets: [moe-artifact-registry-foundation]
plans:
  - id: storage-native
    plan: docs/moe/plans/2026-09-02-moe-memory-01-storage-native.md
    depends_on: []
    status: pending
  - id: embeddings-migration
    plan: docs/moe/plans/2026-09-02-moe-memory-02-embeddings-migration.md
    depends_on: [storage-native]
    status: pending
  - id: process-mcp
    plan: docs/moe/plans/2026-09-02-moe-memory-03-process-mcp.md
    depends_on: [embeddings-migration]
    status: pending
  - id: artifact-integration
    plan: docs/moe/plans/2026-09-02-moe-memory-04-artifact-integration.md
    depends_on: [process-mcp]
    status: pending
  - id: harness-integration
    plan: docs/moe/plans/2026-09-02-moe-memory-05-harness-integration.md
    depends_on: [artifact-integration]
    status: pending
  - id: rollback-recovery
    plan: docs/moe/plans/2026-09-02-moe-memory-06-rollback-recovery.md
    depends_on: [harness-integration]
    status: pending
  - id: release-qualification
    plan: docs/moe/plans/2026-09-02-moe-memory-07-release-qualification.md
    depends_on: [rollback-recovery]
    status: pending
```

The linear order is intentional. Although some source work could be attempted
in parallel, every later plan consumes committed interfaces or artifact
evidence from its predecessor. The external foundation prerequisite prevents
Memory from creating a competing registry, compositor, or release system; this
manifest owns only Memory's runtime and its integration with those shared
interfaces.
