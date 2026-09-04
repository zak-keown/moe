# api — doc-type template

You are generating or verifying a project's `API.md`.

## What to read

- Route/handler definitions — grep for the framework's routing calls
  (`app.get`, `router.post`, `@app.route`, `#[get(...)]`, or the equivalent
  for whatever HTTP framework is in use) to find every endpoint.
- CLI command definitions — grep for the CLI framework's command
  registration (`.command(`, `subcommand(`, `argparse` subparsers, `clap`
  derive attributes) to find every CLI command and flag.
- Exported public functions and classes — grep for `export function`,
  `export class`, `export const`, `pub fn`, `pub struct`, or the language's
  equivalent, restricted to the package's declared public entrypoint
  (`main`, `exports`, or the `index` file's re-exports), not every internal
  symbol.
- Each handler's, command's, or export's actual source — read it to extract
  the real parameter list, types, defaults, and return type. Never copy a
  signature from a doc comment without checking it against the code below it.
- Authentication or authorization middleware, if any — grep for auth
  middleware, decorators, or guards applied to the routes above.
- Existing `API.md` — if present, compare each documented signature against
  the source.

## Sections to write (in order)

1. **Overview** — what kind of API this is (REST, CLI, library) and how a
   caller reaches it: base URL, binary name, or import path.
2. **Endpoints / Commands / Exports** — grouped by module or route prefix.
   For each: method/command/signature, parameters with types, return value or
   response shape, and a one-line description. For libraries, document the
   public surface only (`export function`, `export class`) — skip anything
   not re-exported from the package entrypoint.
3. **Authentication** — only if middleware or guards exist. Describe the
   actual mechanism (bearer token, API key header, session cookie), not a
   generic placeholder.
4. **Error responses** — only if the code defines structured error handling:
   error classes, status-code mapping, or a documented error envelope.

## Rules

- Every endpoint, command, or export you document must exist in the source —
  `grep` for it first.
- Every signature (parameters, types, return value) must match the function
  you `read`, not a doc comment or an older version of the doc.
- Do not invent parameters, default values, response fields, or endpoints
  that are not in the source.
- Group consistently — by route prefix for HTTP APIs, by subcommand for
  CLIs, by module for libraries. Do not mix grouping schemes within one doc.
- Invoke `write-clearly` before finalizing prose.

## Verify mode

When verifying rather than generating, check each documented signature and
endpoint against the codebase and report findings as:

```yaml
- id: <assigned by coordinator>
  type: stale_reference | missing_coverage | factual_error
  file: API.md
  anchor: "<quoted text from the doc>"
  actual: "<what the code actually says>"
  severity: high | medium | low
```

Severity guide:
- **high** — a documented endpoint, command, or export that no longer
  exists, or a signature whose parameters or types are wrong
- **medium** — an exported endpoint, command, or export missing from the
  doc entirely
- **low** — a stale one-line description or example that reads awkwardly but
  would not mislead a caller
