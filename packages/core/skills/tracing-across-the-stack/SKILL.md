---
name: tracing-across-the-stack
description: Use when tracing a TurnCommerce Angular-to-BFF dependency in either direction — which UI code an endpoint change can affect, or which endpoint supplies a component's data. Uses CodeGraph first, an honest source-search fallback, and Moedex only as an optional enhancement.
---

# Tracing Across the Stack

Build a reproducible chain across the Angular → BFF boundary. This skill answers
two questions:

- **Endpoint → UI impact:** "What could break if I change this route?"
- **Component → endpoint provenance:** "Where does this component's data come
  from?"

These directions have different evidence. CodeGraph models the HTTP boundary
well enough to establish endpoint impact. It does not model an entire NgRx chain
by symbol, so component provenance usually includes source searches whose status
must be reported honestly.

## Capability ladder

Use the highest available rung without waiting for an optional backend.

1. **CodeGraph baseline.** Use `codegraph_search`, `graph_trace`, and
   `rag_search`. This is the reproducible cross-repository baseline.
2. **Source-search fallback.** If CodeGraph is absent or does not establish a
   hop, inspect available working trees with `Read` and `Grep`/`rg`. State the
   repositories searched and what an unavailable repository prevents you from
   determining.
3. **Optional Moedex enhancement.** If Moedex tools are present, use
   `impact_analysis`, `trace_calls`, or a budgeted `search_context` to find
   candidate hops or challenge the baseline. Moedex is access-scoped and is
   never a prerequisite or the sole citation in a shared artifact.

Read files from an open working tree directly. Retrieval snapshots can lag
uncommitted work. Use corpus tools for repositories not on disk and for the
cross-repository HTTP edge.

## Evidence states

Assign every hop exactly one state as you build the chain:

| State | Meaning |
|---|---|
| `graph-proven` | A named graph edge joins the two nodes. Record the operation, edge type, and query subject. |
| `source-proven` | Code in an inspected revision directly establishes the relationship. Cite repo, relative path, and symbol or line. |
| `convention-matched` | File layout or a TC convention suggests the relationship, but no call or graph edge proves it. Cite both the source match and the convention. |
| `unresolved` | The available tools or repositories cannot establish the hop. State the missing evidence that would resolve it. |

Do not collapse `convention-matched` into "proven" in the final prose. A
plausible component → selector → effect chain is useful evidence, but it is
not a graph traversal.

## Direction 1: endpoint to UI impact

1. **Normalize the endpoint.** Establish its BFF repository/project, HTTP
   method, and route template. If the user supplied only a handler name, use
   `codegraph_search` with `label: "Route"` and inspect the candidates. Preserve
   ambiguity until method and route agree.
2. **Run the verified traversal.** Call `graph_trace` with
   `operation: "impact"`, the Route name, its project, and a bounded depth.
   Record `HTTP_CALLS` results, including `source_repo`, `target_repo`, HTTP
   method, URL pattern, and the Angular-side node returned by the trace.
3. **Follow the Angular-side evidence.** Use graph edges when populated. When
   the trace stops at a service or method, inspect that repository's source to
   find the component, effect, or caller. Mark source-backed hops
   `source-proven`; mark filename/convention associations
   `convention-matched`.
4. **Challenge, do not replace, the result.** If Moedex is available, run
   `impact_analysis` or a budgeted graph-annotated search as a second opinion.
   Reconcile additional candidates against CodeGraph or source before adding
   them to the reproducible chain.

**Use `impact`, not `consumers`, for Route traversal.** `consumers` has returned
an empty result for Routes where `impact` returned a populated cross-repository
`HTTP_CALLS` edge. An empty `consumers` result is not evidence that an endpoint
has no UI callers. Likewise, a missing inbound `call_path` is a coverage gap,
not proof that no call path exists.

When CodeGraph is absent, search the available Angular repositories for the
route template, stable URL fragments, request DTO, and matching HTTP method.
Trace each source hit inward only as far as the inspected code permits. Report
the result as repository-scoped; without the organization graph, you cannot
claim that all cross-repository callers were found.

## Direction 2: component to endpoint provenance

1. **Fix the starting datum.** Name the component and the displayed field,
   observable, input, or event whose origin is in question. Inspect the
   component and template when they are in the working tree.
2. **Use the graph for the edges it has.** Locate the `Component` with
   `codegraph_search` and inspect populated `RENDERS`, `INJECTS`, and
   `SUBSCRIBES` relationships. Do not invent an NgRx node type: CodeGraph does
   not expose Selector, Reducer, Effect, Action, or Store nodes, and selectors
   may appear only as `File` nodes.
3. **Retrieve the current TC discovery convention.** Use
   `rag_search(sourceKinds: ["structured_doc"])` for the relevant sections of
   `ai/kb/angular-ngrx.md`, and retain its `source_key`, revision, and URL. Cite
   that document rather than copying its NgRx conventions into the answer.
4. **Fill the unmodelled span from source.** Follow the convention's discovery
   hints through the available `*.selectors.ts`, `*.effects.ts`, service, and
   component files. Search for actual identifiers, actions, injected services,
   HTTP method, and route fragments. A filename or naming pattern alone is
   `convention-matched`; a direct import, call, dispatch, or subscription is
   `source-proven`.
5. **Close the BFF boundary.** Once the service request exposes a method and
   URL, match it to a CodeGraph `Route`. Record the `HTTP_CALLS` edge when the
   graph provides one. If only source is available, cite both sides and leave
   the cross-repository join `convention-matched` or `unresolved` as the
   evidence warrants.
6. **Enhance when Moedex is present.** Use `trace_calls` or a budgeted
   `search_context` with graph annotation to locate missed source symbols.
   Verify each added hop against source or the CodeGraph baseline. Do not stall
   or weaken the answer when Moedex is absent.

When CodeGraph and `ai/kb` are both unavailable, source search still produces a
useful partial chain. Label filename-based NgRx associations as heuristics, name
the repositories not available to inspect, and say that TC-convention and
organization-wide coverage could not be verified.

## Reporting contract

Lead with the answer, then include the chain and its evidence. A compact report
has this shape:

```markdown
## Result
<the likely impact or provenance, with its scope>

## Chain
`A` --RELATION--> `B` --RELATION--> `C`

## Evidence
| Hop | State | Evidence and citation |
|---|---|---|
| A → B | graph-proven | CodeGraph `impact`, `HTTP_CALLS`, project + Route |
| B → C | source-proven | repo/path · symbol or line · revision |

## Limits
<unresolved hops, corpus/repository coverage, and the next check that would resolve each>
```

For a shared artifact, make every citation re-fetchable:

- CodeGraph: query subject plus repository/path or `source_key`, revision, and
  `source_url` when supplied.
- Working tree: repository, relative path, symbol or line, and inspected SHA;
  disclose uncommitted state when it affects the evidence.
- Moedex: never cite `abs_path`. Its results depend on the asking user's GitLab
  access. Use it for discovery, then cite CodeGraph or inspected source.

Do not report "no callers", "no impact", or a complete provenance chain merely
because a graph operation returned nothing. Empty evidence establishes only
that the chosen query found nothing within its indexed coverage.

## Red flags

- Using `consumers` instead of `impact` for a Route
- Treating an empty graph result as proof of absence
- Calling a selector, effect, or action graph-proven when it was found by file
  convention
- Reporting a filename match without inspecting the identifier relationship
- Making Moedex required, retrying until it wakes, or citing its local mirror
- Claiming organization-wide coverage from repositories available only on disk
- Presenting a mixed-confidence chain without a per-hop evidence state
