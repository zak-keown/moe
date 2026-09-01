# Moe Agent Container

This image supplies a broad, reproducible coding-agent toolchain for internal
evaluation and automation. It includes common shells and build tools, Node,
Bun, Python through `uv`, Rust, Go, Ruby, tmux, browser-oriented utilities, and
a pinned set of coding-agent CLIs.

## Build

From the repository root:

```sh
docker build -t moe-agent -f infra/container/Dockerfile infra/container
```

The image is intentionally large and optimized for tool availability rather
than production serving. Update pinned CLI versions deliberately and validate
their `--version` or `--help` probes during the image build.
