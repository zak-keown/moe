# Duplicate-id fixture

Two entries share the id `A`. `plan-set check` must fail — a duplicate id
makes every reference ambiguous, which is exactly the case-folded plan-id
collision moe-core hit in production and left a comment about.

```yaml
plans:
  - id: A
    plan: plans/A-plan.md
    depends_on: []
    status: pending
  - id: A
    plan: plans/B-plan.md
    depends_on: []
    status: pending
```
