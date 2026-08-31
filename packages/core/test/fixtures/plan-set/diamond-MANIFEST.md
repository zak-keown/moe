# Diamond fixture

```
        A
       / \
      B   C
       \ /
        D
```

`next` starts at [A]. After `plan-set done A`, `next` returns both B and C
(same line each). After both are done, `next` returns [D].

```yaml
plans:
  - id: A
    plan: plans/A-plan.md
    depends_on: []
    status: done
    commits: aaaaaaa..aaaaaab
  - id: B
    plan: plans/B-plan.md
    depends_on: [A]
    status: pending
  - id: C
    plan: plans/C-plan.md
    depends_on: [A]
    status: pending
  - id: D
    plan: plans/D-plan.md
    depends_on: [B, C]
    status: pending
```
