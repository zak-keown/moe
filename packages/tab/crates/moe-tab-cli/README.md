# moe-tab-cli

Command-line tool to estimate the USD cost of an AI-agent transcript. Ships the `moe-tab`
binary.

```bash
cargo install --path crates/moe-tab-cli   # installs the `moe-tab` binary

moe-tab estimate trajectory.json          # dialect auto-detected from content
moe-tab estimate usage.jsonl --dialect tab --json
moe-tab refresh                           # update the on-disk pricing snapshot
moe-tab refresh --as-of 2026-06-09        # or 2026-06-09T18:30:00Z
```

`--dialect` takes `atif` or `tab`. A pricing snapshot is compiled into the binary, so
`estimate` works out of the box; `refresh` pulls fresher LiteLLM + OpenRouter sheets into
`$MOE_TAB_PRICING_DIR`, else `$XDG_DATA_HOME/moe/tab`, else `~/.local/share/moe/tab`.

Built on [`moe-tab-core`](../moe-tab-core). Part of
[Moe](https://gitlab.tcdevops.com/Zak/moe), forked from
[obol](https://github.com/prime-radiant-inc/obol). Apache-2.0.
