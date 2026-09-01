# Moe Proof

Proof runs task-based evaluations, grades their artifacts, and builds reports
or a local results site. Evaluation definitions are YAML and runners can target
small local models or hosted models.

## CLI

```sh
moe-proof docs
moe-proof run path/to/eval.yaml
moe-proof grade path/to/eval.yaml
moe-proof report path/to/eval.yaml
moe-proof serve path/to/eval.yaml
moe-proof build path/to/eval.yaml
```

Run `moe-proof --help` for options and model configuration.

## Development

```sh
uv sync --project py/proof
pnpm proof:test
```
