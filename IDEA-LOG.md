# Post-Port Plans

- Full repo review/fix pair of skills, user invokeable only

## Cross-pollination from mattpocock/skills census (W02P05, 2026-08-31)

Three ideas the census flagged as worth doing but out of scope for the import
itself. All three are prose rewrites of existing Moe skills, not new imports.

- **`writing-plans` — adopt `wayfinder`'s decision-ticket vs task-ticket split.**
  Matt separates "questions the plan doesn't answer yet" from "work items", and
  blocks a task ticket on the decision tickets it depends on
  (`../.moe-references/mattpocock-skills/skills/engineering/wayfinder/SKILL.md:74-80`).
  Moe's plans currently conflate both. Cross-pollinate the framing; don't
  import the skill (it assumes an issue-tracker abstraction Moe doesn't have).
- **`test-driven-development` — cross-link to `codebase-design`'s seam vocabulary.**
  Contingent on W02P05 landing `codebase-design`. Matt's `tdd/SKILL.md:19-26`
  already delegates seam vocabulary to `codebase-design`; mirror the one-line
  cross-link into Moe's TDD so the two skills lock together the same way.
- **`brainstorming` — add an "already-scoped, need to sharpen" branch.**
  `grilling` and `brainstorming` are peers, not competitors — the missing case
  is when the shape is already agreed and what's needed is a round-based BFS
  through remaining decisions
  (`../.moe-references/mattpocock-skills/skills/engineering/grilling/SKILL.md:6-8`).
  Add as a fourth path alongside spike/bounded/architectural.
