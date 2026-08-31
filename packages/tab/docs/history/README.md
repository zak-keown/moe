# Inherited record — verbatim, do not rebrand

Everything under this directory is upstream `obol` material, kept **byte-for-byte** as received
at `28e3dba`. It describes a project that *was* called obol, by an author this fork cannot reach.
Rewriting it to say "moe-tab" would falsify the record, and the record is the only way a pre-fork
decision gets reconstructed.

| Path | What it is |
|---|---|
| `plans/` | 11 upstream build plans, 2026-06-04 → 2026-06-08. Task-level, with acceptance criteria. |
| `specs/` | 11 upstream design specs. `2026-06-08-obol-usage-sidecar-design.md` is the origin of the `tab` dialect. |
| `validation/` | Three dated differential-validation reports: obol vs superpowers-evals, the five-language FFI equivalence gate, and obol vs prudence on Pi cells. |
| `RELEASING.md` | Upstream's four-channel release process (npm, Go, crates.io, PyPI), all tag-driven through GitHub Actions. None of it is wired up here. |
| `scripts/` | The two reproducers the validation reports name. |

## What is stale in here, and why it stays

These documents predate upstream's 0.6.0, which deleted the per-agent raw-log parsers. They talk
about `--dialect claude`, `codex`, `pi`, `gemini`, `opencode`, `copilot` and `kimi`. **None of
those exist in the code.** The dialects are `atif` and `tab` — see [`../dialects.md`](../dialects.md),
which is the live reference.

The same goes for `scripts/`: `validate_pi.sh` passes `--dialect pi` and `validate_against_sevals.sh`
passes `--dialect claude|codex`, so neither runs against this code, and both also need external
checkouts and a corpus of real session logs that upstream deliberately did not ship. They are here
as the method behind the numbers in `validation/`, not as runnable tools. The live equivalence gate
is `../../scripts/validate-bindings.sh`.

`RELEASING.md` describes publishing to npm, crates.io, PyPI and a generated Go module repository.
Whether Moe publishes any of that is an open decision recorded in
[PARITY.md](../../../../PARITY.md); the four GitHub Actions workflows that implemented it were not
ported.
