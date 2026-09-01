# Missing-dep fixture

B depends on `nonexistent`, which is not a known id. `plan-set check` must
fail — an unresolved dep is a dead end that `next` would silently swallow.

```yaml
plans:
  - id: A
    plan: plans/A-plan.md
    depends_on: []
    status: pending
  - id: B
    plan: plans/B-plan.md
    depends_on: [nonexistent]
    status: pending
```
