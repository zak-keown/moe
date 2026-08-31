# @bubstack/moe-tab

Price an agent transcript. What the run cost you.

Not a plugin. A library/CLI consumed by other packages.

**Status:** scaffold. No code imported yet.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `obol` | `28e3dba` | Apache-2.0 |

Snapshots are in `../.moe-references/` (gitignored). They are the spec — not upstream
`main`. See [PARITY.md](../../PARITY.md).

## Import notes

- Rust crate plus Go, Python and TypeScript bindings. The TypeScript binding at bindings/typescript is the pnpm workspace package; the crate is driven by root `pnpm tab:build`.
- flight's confirmed dependency. Publishing @primeradianthq/obol to npm to test a cost model change is the loop this monorepo removes.
- Cargo workspace members: obol-core, obol-cli, obol-ffi. All three rename.
- Carries its own NOTICE with upstream attributions. It travels with the code.
- Four of the eleven upstream CI workflows are here, two of which publish to crates.io and PyPI. Decide whether Moe publishes publicly before porting them.
- cargo 1.98 is installed and reads the upstream 3-crate workspace, but it is not on
  PATH by default here. See ARCHITECTURE.md, Local prerequisites.
