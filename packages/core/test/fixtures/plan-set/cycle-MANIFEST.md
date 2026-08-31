# Cycle fixture

A → B → C → A. `plan-set check` must exit non-zero and name the cycle nodes on
stderr.

```yaml
plans:
  - id: A
    plan: plans/A-plan.md
    depends_on: [C]
    status: pending
  - id: B
    plan: plans/B-plan.md
    depends_on: [A]
    status: pending
  - id: C
    plan: plans/C-plan.md
    depends_on: [B]
    status: pending
```
