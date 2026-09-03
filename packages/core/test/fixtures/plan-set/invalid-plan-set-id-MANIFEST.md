# Invalid plan-set id fixture

The slash makes aggregate `set/plan` output ambiguous and must be rejected.

```yaml
plan_set_id: bad/id
plans:
  - id: A
    plan: plans/A-plan.md
    depends_on: []
    status: pending
```
