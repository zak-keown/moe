# Cross-stack tracing acceptance — 2026-09-01

Repository under test: `moe` at
`54b4ec6c54540d472835c1e074e7e7c8e6469329` plus the uncommitted
`tracing-across-the-stack` implementation in this repair wave.

## Tool availability

- CodeGraph: available through the TC MCP server and used as the baseline.
- Moedex: available locally and used only as a second opinion.
- Source fallback: `/Users/ZKeown/Code/dropcatch` was available at
  `05006233dcb0f961e27512e9d7486a68a703e3b6`; its working tree was clean.

## Endpoint to UI — CodeGraph baseline

Subject: `DELETE DeleteSearch` in `TC.DropCatchWebApi`.

Queries executed:

```text
codegraph_search(scope="nodes", label="Route", project="TC.DropCatchWebApi",
  namePattern="%DeleteSearch%")
graph_trace(operation="impact", name="DELETE DeleteSearch",
  project="TC.DropCatchWebApi", depth=3)
graph_trace(operation="consumers", name="DELETE DeleteSearch",
  project="TC.DropCatchWebApi")
```

Result:

- Route search resolved `route:TC.DropCatchWebApi:DELETE:DeleteSearch` at
  `src/TC.DropCatchWebApi/Controllers/SearchController.cs`.
- `impact` returned one direct cross-repository `HTTP_CALLS` edge from
  `DropCatch` method `SavedSearchesService.deleteSavedSearch` to the route.
- The same Route queried with `consumers` returned zero results.

Acceptance: **pass**. This reproduces the warning in the skill: Route impact
uses `impact`; an empty `consumers` result is not proof of no callers.

## Optional Moedex challenge

Query executed:

```text
search_context(query='"DeleteSearch" deleteSavedSearch SavedSearchesService',
  token_budget=2200, top_k=8, graph_depth=1, min_confidence="Pattern")
```

Moedex returned nine bounded blocks and independently found:

- `SavedSearchesTableComponent.deleteSearch`
- `SavedSearchesService.deleteSavedSearch`
- `ApiDeleteSearch`
- `DeleteSearchRequest`

The component's reference to `SavedSearchesService` was confidence `Pattern`,
not promoted to graph-proven evidence. Acceptance: **pass** as an optional
challenge; no conclusion depends on Moedex alone.

## No-CodeGraph degraded path

CodeGraph results were set aside and the local DropCatch working tree was
searched directly:

```text
rg -n -C 3 'DeleteSearch|deleteSavedSearch' \
  /Users/ZKeown/Code/dropcatch/dropcatch-ui/src
rg -n -C 2 'deleteSearch' \
  /Users/ZKeown/Code/dropcatch/dropcatch-ui/src/app \
  /Users/ZKeown/Code/dropcatch/dropcatch-ui/src/environments
```

The source-proven local chain was:

```text
SavedSearchesTableComponent.deleteSearch
  -> SavedSearchesService.deleteSavedSearch
  -> http.send(new ApiDeleteSearch(search.name))
  -> ApiContract(HttpMethods.delete, Api.deleteSearch)
  -> Api.deleteSearch = "deleteSearch"
  -> environment endpoint "/deleteSearch"
```

The BFF source repository was not present in that working tree, so the final
join from `DELETE /deleteSearch` to the controller remained unresolved in the
degraded result. The fallback therefore established repository-scoped UI
provenance without claiming organization-wide coverage. Acceptance: **pass**.

## Outcome

Both directions and the degraded capability ladder behave as documented. The
known Route traversal is reproducible, confidence labels stay honest, and loss
of CodeGraph reduces coverage instead of preventing a useful answer.
