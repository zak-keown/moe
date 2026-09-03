# Partially blocked fixture

A is blocked and B depends on it, but C is an independent branch and remains
runnable within this plan set.

```yaml
plans:
  - id: A
    plan: plans/A-plan.md
    depends_on: []
    status: blocked
  - id: B
    plan: plans/B-plan.md
    depends_on: [A]
    status: pending
  - id: C
    plan: plans/C-plan.md
    depends_on: []
    status: pending
```
