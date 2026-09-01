# Moe Backstory

Backstory recovers a behavioral specification from an existing codebase. Its
skills combine source analysis, runtime observation, test analysis, repository
archaeology, external documentation, and fidelity validation.

## Contents

- `skills/` — the analysis pipeline and specialist methods.
- `agents/` — focused analysis agents.
- `commands/` — workflow entry points.
- `mint/` — plugin generation configuration.

The installable plugin is generated under `/plugins`. Never hand-edit the
generated manifest.

## Development

```sh
pnpm --filter @bubstack/moe-backstory lint
pnpm mint
```
