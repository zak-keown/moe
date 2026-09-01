# Context-routing acceptance — 2026-09-01

Repository under test: `moe` at `e7b7131` plus the uncommitted F-03 routing
contract repair.

## Tool availability

- CodeGraph: connected through the TC MCP server; its tools were globally
  allowlisted for this Codex installation.
- Moedex: optional and not required for this acceptance.
- Local memory fallback: verified as the explicit no-CodeGraph route in the
  installed skill contract.

## Structured-document baseline

Executed:

```text
rag_search(
  query="TurnCommerce Git branch naming merge request conventions",
  sourceKinds=["structured_doc"],
  topK=3,
  format="json")
```

The result included `structured_doc:kb:git.md`, section **“Branch strategy”**,
at revision `c6df857cf0f484d91937acf30e9eb2850324131a`, with a re-fetchable
`sourceUrl`. The snippet directly stated the `sc-123456/description` branch
shape and recommended worktrees when another agent may be active.

The result's score was about `0.03077` despite being directly relevant. This
falsified the old prose rule that a result near `0.03` was categorically a miss.
The skill and delegated CodeGraph agent now require content inspection and
bounded context verification rather than an absolute cutoff.

Executed:

```text
rag_context(
  sourceKey="structured_doc:kb:git.md",
  chunkIndex=2,
  scope="section",
  maxTokens=2000,
  format="json")
```

It returned the complete 128-token Branch strategy section with
`truncated: false` and the same revision and source URL. Acceptance: **pass**.

## Decision-memory route

Executed:

```text
memory_read(
  operation="search",
  query="Moe TC downstream mirror upstream ProGet @tc scope",
  claimLimit=5,
  entityLimit=5)
```

No entity or claim seed matched. The correct result is “not found”; the route
returned promptly and did not fabricate a memory result. Acceptance: **pass**.

## Missing-backend contracts

The executable test named **“retrieving-context contract”** asserts:

- working-tree content routes to `Read`/`Grep` before retrieval;
- Moedex absence continues through the CodeGraph baseline without retries;
- CodeGraph absence retains `search_conversations`, `search_journal`, and
  `process_thoughts`, and explicitly refuses a `memory_store` call;
- shared Moedex discoveries must be re-established through CodeGraph; and
- both retrieval agents retain bounded output and explicit tool surfaces.

These are tool-surface negative cases rather than simulated network failures:
the behavior under absence is the instruction contract the agent receives when
the corresponding tools are not present. Acceptance: **pass**.
