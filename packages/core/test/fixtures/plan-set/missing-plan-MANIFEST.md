# Missing-plan fixture

B's `plan:` path names a file that does not exist. `plan-set check` must fail
— a plan file that never existed is not one this project actually plans to
run.

```yaml
plans:
  - id: A
    plan: plans/A-plan.md
    depends_on: []
    status: pending
  - id: B
    plan: plans/does-not-exist.md
    depends_on: [A]
    status: pending
```
