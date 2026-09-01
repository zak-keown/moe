# Blocked-propagation fixture

A is `blocked` by design. B depends on A. C depends on B. `plan-set next` must
return nothing — the blocked-closure walk transitively covers B and C so
neither shows up as ready, even though B's own status is `pending`.

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
    depends_on: [B]
    status: pending
```
