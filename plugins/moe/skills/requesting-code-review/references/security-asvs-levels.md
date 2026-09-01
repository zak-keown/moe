# Security ASVS Levels

Threat-model rigor levels, mapping OWASP ASVS L1/L2/L3 to how hard a reviewer should look. It lands with the review skills rather than with the debugging cluster it was imported alongside, because its subject is reviewer depth, not fault finding.

*Imported from `open-gsd/gsd-core` @ `05092ff3` (MIT), `gsd-core/references/security-asvs-levels.md`. Rewritten only where it named GSD's own agent and phase machine; the technique content is upstream's. See PARITY.md.*

## L1 — Opportunistic (default)

**Scope:** Cover threats on primary trust boundaries and high-impact components.

**Planner disposition:** `mitigate` critical/high-severity threats. `mitigate` medium-severity threats if they occur on a primary trust boundary; otherwise `accept` with documented rationale explaining the specific risk tolerance. `accept` low-risk threats with a rationale statement. `transfer` when threat is third-party responsibility.

**Auditor verification depth:** Verify each declared mitigation is PRESENT in the cited file (grep-level check — find the pattern, confirm the call exists).

## L2 — Standard

**Scope:** Map ALL applicable STRIDE categories for every in-scope component.

**Planner disposition:** `mitigate` medium-severity-and-above threats. Every `accept` MUST have explicit documented rationale explaining why the risk is tolerable for this specific context.

**Auditor verification depth:** Verify the mitigation ACTUALLY ADDRESSES the threat vector (not just that some pattern is present) and is placed at the correct trust boundary. A login check in the wrong layer does not close the threat.

## L3 — Comprehensive

**Scope:** Exhaustive STRIDE × all components; defense-in-depth for critical threats.

**Planner disposition:** `mitigate` all threats except those explicitly accepted with documented sign-off. Defense-in-depth layers required for critical threats (multiple independent controls).

**Auditor verification depth:** Deep verification — trace data flow end-to-end, check edge cases and ordering, confirm the mitigation cannot be bypassed via alternate code paths or parameter manipulation.
