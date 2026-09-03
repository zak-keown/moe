# Diamond Fixture Plan

> For agentic workers: test fixture.

**Goal:** Test the diamond DAG shape.

---

### Task 1: Root A

**depends_on:** []

**Files:**
- Create: `src/a.ts`
- Test: `test/a.test.ts`

**Interfaces:**
- Consumes: None
- Produces: `createA(): A`

- [x] **Step 1: Implement A**

Done.

- [x] **Step 2: Test A**

Done.

### Task 2: Left B

**depends_on:** [1]

**Files:**
- Create: `src/b.ts`
- Test: `test/b.test.ts`

**Interfaces:**
- Consumes: `createA()` from Task 1
- Produces: `createB(): B`

- [ ] **Step 1: Implement B**

Pending.

### Task 3: Right C

**depends_on:** [1]

**Files:**
- Create: `src/c.ts`
- Test: `test/c.test.ts`

**Interfaces:**
- Consumes: `createA()` from Task 1
- Produces: `createC(): C`

- [ ] **Step 1: Implement C**

Pending.

### Task 4: Sink D

**depends_on:** [2, 3]

**Files:**
- Create: `src/d.ts`
- Test: `test/d.test.ts`

**Interfaces:**
- Consumes: `createB()` from Task 2, `createC()` from Task 3
- Produces: None

- [ ] **Step 1: Implement D**

Pending.
