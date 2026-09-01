# Tracked Apple release payloads

The Darwin libraries in this directory are release inputs, not Linux CI output.
They must be built on Apple hardware from the repository's pinned Rust source,
smoke-tested through `moe_tab_version`, stripped with `strip -x`, and committed
with updated hashes and versions in `manifest.json`.

Linux CI must never download an Apple SDK or build either Darwin payload. It
builds and smokes only the Linux x64 and arm64 libraries, then hands those two
artifacts to the release pack job. `scripts/tab-native.mjs` combines those
ephemeral Linux artifacts with these tracked Apple inputs and rejects missing,
untracked, hash-mismatched, wrong-architecture, or wrong-version payloads.

Run `node scripts/tab-third-party-licenses.mjs --check` with Cargo 1.98 on PATH
for the full offline linked-license verification. CI's Node-only pack boundary
runs `--check-inputs`, which fails immediately if `Cargo.lock` or any workspace
crate manifest moved without regenerating the committed payload.
