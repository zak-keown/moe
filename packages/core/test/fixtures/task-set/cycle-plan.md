# Cycle Fixture Plan

> For agentic workers: test fixture.

**Goal:** Test cycle detection.

---

### Task 1: Alpha

**depends_on:** [3]

**Files:**
- Create: `src/alpha.ts`

**Interfaces:**
- Consumes: `fromGamma()` from Task 3
- Produces: `fromAlpha()`

- [ ] **Step 1: Implement**

Pending.

### Task 2: Beta

**depends_on:** [1]

**Files:**
- Create: `src/beta.ts`

**Interfaces:**
- Consumes: `fromAlpha()` from Task 1
- Produces: `fromBeta()`

- [ ] **Step 1: Implement**

Pending.

### Task 3: Gamma

**depends_on:** [2]

**Files:**
- Create: `src/gamma.ts`

**Interfaces:**
- Consumes: `fromBeta()` from Task 2
- Produces: `fromGamma()`

- [ ] **Step 1: Implement**

Pending.
