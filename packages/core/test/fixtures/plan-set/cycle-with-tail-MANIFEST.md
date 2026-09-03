# Cycle-with-tail fixture

A and B form the cycle. C depends on A but is not itself cyclic.

```yaml
plans:
  - id: A
    plan: plans/A-plan.md
    depends_on: [B]
    status: pending
  - id: B
    plan: plans/B-plan.md
    depends_on: [A]
    status: pending
  - id: C
    plan: plans/C-plan.md
    depends_on: [A]
    status: pending
```
