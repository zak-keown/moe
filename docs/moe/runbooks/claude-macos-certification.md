# Claude Code/macOS Certification Runbook

## Prerequisites

- A candidate release exists as a GitHub draft with all six tarballs uploaded.
- The `claude-maintenance` GitHub environment is configured with required
  reviewers.
- An `ANTHROPIC_API_KEY` is stored as an environment secret (not a repository
  secret) scoped to `claude-maintenance`.

## Trigger

1. Go to **Actions > certify-claude-macos > Run workflow**.
2. Enter the candidate platform tag (e.g. `v0.1.5-rc.1`).
3. Click **Run workflow**.
4. The job waits for environment approval — an authorized reviewer must approve
   the deployment before the runner starts.

## What the workflow does

1. Checks out the repository at the tag's commit SHA.
2. Installs Node 24, pnpm, and builds the Mint CLI.
3. Installs Claude Code at the pinned version and verifies authentication via
   `claude auth status` using the environment-scoped API key.
4. Resolves the deployment/approval identity through the Actions API (not
   `github.actor`).
5. Downloads and revalidates the candidate catalog and all six tarballs from the
   draft release.
6. For each plugin, in an isolated config/project directory:
   - **install** — installs the candidate tarball
   - **discovery** — verifies the plugin is discoverable
   - **update** — runs predecessor-to-candidate update (skipped with
     `NO_PREDECESSOR` for first-publish plugins like Statusline)
   - **capabilities** — exercises each capability in the plugin's declared set
   - **uninstall** — removes the plugin cleanly
7. Writes one evidence JSON and one redacted log per plugin.
8. Uploads evidence as a workflow artifact.

## Evidence dispositions

- **certified**: all lifecycle checks and capabilities pass, predecessor update
  exercised.
- **preview / NO_PREDECESSOR**: first-publish plugin; update is skipped but
  every other check must pass.

## Failure recovery

If a plugin fails mid-lifecycle, the driver attempts cleanup uninstall and
preserves the primary error. Logs are redacted before upload. Re-run the
workflow with the same candidate tag after fixing the issue.

## Security constraints

- The `ANTHROPIC_API_KEY` never appears in workflow inputs or logs.
- No personal runner or pre-authenticated keychain is used.
- Operators cannot supply digests or verdicts — the workflow computes them.
- The approval actor identity comes from the Deployments API, not the trigger
  actor.
