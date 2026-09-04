# Backlog

- Audit embedding model--better available?
- Add "defer" to jig with an enumerable reason -- reason isn't there? Escalate to human whether deferral is allowed.
- Add in-repo concept of a backlog (in ./moe folder), include thin skill wrappers for interacting with it. Need state machine?
- Hardener skill. Installs a temporary copy of Moe and attempts to break/compromise it. Files backlog items, does not fix.
- Change codebase-review/fix skills to write to and use new backlog 
- Skill pair moe-handoff - writes .continue-here to .moe, including state of moe itself; moe-resume picks up and continues
- Robust actual testing of harnesses, e2e, local models where possible. PROVE it works. Actual scenarios? Tic Tac Toe Game? Make it operationally required somewhere? If we can make Moe work reliably on a local model, frontier models will sail.