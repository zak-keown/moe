# Skill Backend Runtime Standard — Design Spec

Date: 2026-09-03  
Status: Approved in conversation; awaiting review of this written spec  
Evidence baseline: `37f4a855ee8a7667ffee200886fe8645b2a6c18d`

## 1. Problem

Moe ships production helper code alongside skills in several incompatible
forms. At the evidence baseline, the production code under shipped
`packages/**/skills/**` trees consists of 69 files: 48 Node JavaScript, 10
Python, and 11 Bash. The count excludes examples, fixtures, tests, and the
illustrative `condition-based-waiting-example.ts` file.

The implementations also disagree about module format, location, and
invocation. Some helpers are ESM `.mjs`, some are CommonJS `.cjs` or `.js`,
some are Python, some are `.sh`, and several are extensionless executables.
Callers variously use `node`, `python3`, a direct path, or a working-directory
relative command. That makes the runtime contract difficult to understand and
leaves portability dependent on undeclared interpreters, shell behavior, file
mode preservation, and current working directory.

The existing gates do not establish a repository-wide standard. Core has
package-local checks for executable bits and parseability, specialized Python
and shell suites are outside the normal Node gate, and Mint validates packaging
integrity without constraining skill backend language or invocation.

## 2. Decision

All production helper code owned by a shipped skill will use dependency-free
Node 24 ESM. The source format is `.mjs`, helpers live under the owning skill's
`scripts/` directory, and every invocation uses an explicit `node` command.

This is an atomic migration. The final tree has no legacy-language allowlist,
compatibility wrappers, or duplicate old implementations.

Package-level applications and services may continue to be authored in
TypeScript and compiled into `dist`. The distinction is intentional:

- portable, directly shipped skill helpers use `.mjs`;
- compiled package backends use TypeScript and ship build output through
  `dist`.

Node 24 is already Moe's universal runtime prerequisite. Directly shipped
TypeScript would add compilation or experimental runtime behavior; Python and
Bash require interpreters outside that baseline. ESM `.mjs` makes module
semantics independent of a nearby `package.json` and avoids CommonJS/ESM
ambiguity inside generated artifacts.

## 3. Scope

### 3.1 Included

The contract covers production code owned by a shipped skill beneath:

```text
packages/<package>/skills/<skill>/
```

This includes CLI entry points, supporting modules, browser-injected source
assembled by those modules, launchers, validators, aggregators, and lifecycle
helpers.

### 3.2 Excluded

The contract does not govern:

- examples stored under an `examples/` directory;
- package test trees, fixtures, or test-only smoke and integration utilities;
- documentation code blocks and non-executable illustrative source;
- package application source under `src/` or compiled output under `dist/`;
- plugin hooks under `hooks/`;
- generated files under `/plugins/`.

Hooks remain separate because Moe deliberately supports a harness-specific
polyglot hook strategy, including `.cmd` and shell dispatch. Generated plugin
trees remain outputs of Mint and must never be edited directly.

## 4. Source and invocation contract

Production skill backend code must satisfy all of the following:

1. Code resides under `skills/<skill>/scripts/`.
2. Every code file has the `.mjs` extension and uses ESM imports and exports.
3. Entry points are invoked as `node "<absolute-or-plugin-rooted-path>.mjs"`.
4. Correctness does not depend on a shebang, executable bit, shell
   interpretation, or caller working directory.
5. Skill-local modules import only relative modules and Node built-ins, using
   the explicit `node:` prefix for built-ins.
6. Third-party dependencies, compilation, or package-wide services belong in
   package `src/` and `dist`, not in a skill-local backend.
7. Subprocesses are launched with argument arrays rather than shell command
   strings. Shell evaluation is not part of the backend contract.
8. Tests live in the owning package's test tree.

Non-code assets needed by a backend, including Markdown prompts, HTML, and
JSON, may live under `scripts/`. Illustrative code that is intentionally not a
backend belongs under `examples/` so its exclusion is structural rather than
name-based.

The standard makes the orchestration runtime portable; it does not make every
external capability universal. A helper may still require an explicitly
declared executable such as Git or tmux, and browser automation still requires
a supported browser. Crew remains limited to macOS, Linux, and WSL2 because
tmux is load-bearing even after its launcher becomes JavaScript.

## 5. Enforcement

Mint will own one reusable skill-backend validator. Mint is the correct
authority because it resolves every package's declared skill component before
assembling an installable plugin.

Before staging a skill component, the validator inspects its source tree and
reports every violation in one result. It rejects:

- production code outside `scripts/`;
- Python, shell, TypeScript, CommonJS, ordinary `.js`, or extensionless
  production code;
- executable bits or shebangs on production skill code;
- bare third-party module specifiers in `.mjs` helpers;
- skill instructions that invoke a production helper directly instead of
  through `node`.

Diagnostics identify the source path, violated rule, and expected remediation.
Within a skill tree, every code file outside `examples/` is treated as
production code; test-like filenames are not an escape hatch. Tests and
fixtures must live in package-level test and fixture trees. The validator does
not grow a list of legacy file exceptions.

The same implementation is exercised at two gates:

1. A focused repository contract test invokes it across every package skill
   tree during `pnpm check`, providing fast feedback without regenerating
   plugins.
2. Mint component assembly invokes it before staging, preventing `pnpm mint`
   and `pnpm mint:check` from emitting a nonconforming plugin.

Jig does not initially receive a parallel command. Adding a second authority
would create rule drift without improving coverage: Mint already owns artifact
admissibility, and the repository test provides the fast local gate.

Validator tests include a conforming fixture and failures for Python, shell,
CommonJS, TypeScript, ordinary `.js`, extensionless executable code, misplaced
code, shebangs, executable bits, third-party imports, and bare invocation.

## 6. Migration

The migration preserves helper behavior and public CLI contracts. Before each
conversion, black-box coverage records accepted arguments, exit status,
stdout, stderr, generated files, malformed-input behavior, and subprocess
failures.

Implementation proceeds in risk order:

1. Port the Python validators and aggregators to Node standard-library APIs.
2. Port Bash data-processing helpers and replace incidental `jq` and `awk`
   dependencies with Node APIs.
3. Port Git, tmux, and Crew launchers using argument-array subprocess calls.
4. Port the brainstorming start/stop lifecycle while preserving secure
   directory creation, foreground/background behavior, signal handling,
   browser launch, and Windows behavior.
5. Move Glass's production CommonJS files beneath
   `skills/browsing/scripts/`, convert them to ESM, rename the CLI to
   `chrome-ws.mjs`, and update the compiled MCP backend to import the same ESM
   implementation.
6. Update every owning `SKILL.md`, supporting document, package test, and
   internal reference to use the new paths and explicit `node` invocation.
7. Move non-backend illustrative code into `examples/`, and move test-only
   utilities currently co-located with skills into package test trees.
8. Enable the zero-exception validator, regenerate `/plugins/` with
   `pnpm mint`, and remove obsolete language-specific test commands when they
   no longer cover an intentional out-of-scope utility.

Intermediate commits may keep the branch understandable, but the migration and
enforcement land as one repository change. Main must not contain a state where
the gate allows new legacy helpers or where converted skills reference missing
backends.

## 7. Verification

Each converted helper retains focused behavioral tests in the owning package's
normal test tree. Conversion work must not replace behavioral assertions with
source-shape assertions.

The final verification set is:

- focused tests for each migrated helper group;
- Mint validator unit and repository-contract tests;
- `pnpm check`;
- `pnpm mint:check`;
- `pnpm provenance`;
- Glass browser tests when Chrome is available;
- Crew/tmux integration tests on a supported tmux environment;
- brainstorming lifecycle tests, including its Windows-specific behavior.

The brainstorming lifecycle and Glass module conversion are separate
high-risk review boundaries. Glass shares its browser implementation between
the skill CLI and compiled MCP server; both consumers must pass before that
conversion is complete.

## 8. Acceptance criteria

The work is complete when:

1. Every in-scope skill backend file is `.mjs` beneath its owning skill's
   `scripts/` directory.
2. No in-scope skill invocation requires Python, Bash, `jq`, `awk`, executable
   bits, shebang dispatch, or a particular current working directory.
3. Every skill instruction invokes its backend with explicit `node` and a
   plugin-rooted path.
4. Skill-local backends use only relative modules and `node:` built-ins.
5. Mint rejects each forbidden source shape before staging an artifact.
6. `pnpm check` exercises the same contract against the whole source tree.
7. No legacy allowlist or compatibility wrapper remains.
8. Behavioral tests demonstrate parity for every converted helper group.
9. Generated plugins are reproducible from source and provenance remains
   complete.

## 9. Non-goals

This work does not:

- rewrite package-level TypeScript services in JavaScript;
- standardize repository build, release, Rust, Python proof, or hook scripts;
- remove external capabilities that are intrinsic to a skill, such as Git,
  tmux, or Chrome;
- make Crew a native-Windows feature;
- redesign skill workflows or their user-visible output;
- add a general-purpose Jig policy framework.
