# Post-Port Plans

- Explore parallelization as an execution option
- Runtime pruning: Gemini is discontinued in favor of Antigravity, and Grok must be removed.
- Branding with Moe identity/tone through docs (add tone to skills?)
- Installer with HQ DX
- Native renderers - Have skills use the actual harness tooling where available, rather than pure text; include Claude's artifact-design skill if present
- Explore a deterministic task DAG for larger projects (anything more than 1 phase?) -- some sort of lightweight state machine? Project mgmt for larger/greenfield initiatives.
- Examine GSD-core for skills to import
    - Explore tiered workflows with better naming, GSD uses fast, quick, and default. The idea is tier 1 is a fix that needs no more tracking or planning than the git commit. Tier 2 adds planning but does not verify/review. Tier 3 is the full monte. 
- Documentation: ideal total flow for contributing to Moe--what to run when and why
- Verification, split in two: let the harness capture the evidence and keep the judgment in prose. Count which skills actually fire while we are in there.

## TC-Specific

- Mutate skills to conform to TC standards - start with MRs and branch formatting
    - https://gitlab.tcdevops.com/ai/skills
    - Branch format is `sc-{cardNumber}/{slug}
    - Explore how to keep these up-to-date 
- Brainstorm on how to integrate AI Governance doc/TC Guide skill
    - https://gitlab.tcdevops.com/ai/aigovernance
    - https://gitlab.tcdevops.com/ai/tc-guide
    - Explore how to keep these up-to-date 
- Context engineering layer between CodeGraph+Moedex and the LLM using Moe
