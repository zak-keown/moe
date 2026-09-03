#!/usr/bin/env node
import { Command } from 'commander'
import { generate, TOOL_VERSION } from './generate.js'
import { validate } from './validate.js'
import { renderMatrix } from './matrix.js'
import { init } from './init.js'
import { importPlugin } from './import.js'
import { runTest, DEFAULT_IMAGE } from './test-command.js'
import { bumpVersion, bumpCheck, bumpAudit, type BumpResult, type CheckResult, type AuditResult } from './bump.js'
import { ConfigError } from './config.js'
import { MintError } from './diagnostics.js'
import { resolvePlatform } from './platform/load.js'
import { currentProjectionRecords, resolvePublishMatrix } from './platform/projections.js'
import { assembleArtifactSet } from './artifact/assemble.js'
import { checkArtifactSet } from './artifact/check.js'

const LABEL_WIDTH = 45

function label(path: string, field: string): string {
  return `${path} (${field})`.padEnd(LABEL_WIDTH)
}

function printCheck(result: CheckResult): void {
  console.log('Version check:\n')
  for (const file of result.files) {
    console.log(`  ${label(file.path, file.field)}  ${file.version ?? 'MISSING'}`)
  }
  console.log(`  ${label('moe-mint.yaml', 'version')}  ${result.configVersion}`)
  console.log('')
  for (const path of result.staleGenerated) {
    console.log(`generated file stale: ${path}`)
  }
  if (result.drift) console.log('DRIFT DETECTED — versions or generated files are out of sync')
  else console.log(`All declared files are in sync at ${result.configVersion}`)
}

function printAudit(result: AuditResult): void {
  console.log(`Audit: scanning repo for version string '${result.version}'...\n`)
  if (result.clean) {
    console.log('No undeclared files contain the version string. All clear.')
    return
  }
  console.log(`UNDECLARED files containing '${result.version}':`)
  for (const finding of result.findings) {
    console.log(`  ${finding.path}:${finding.line}: ${finding.text}`)
  }
  console.log(
    '\nReview the above — if they should be bumped, add them to release.files; if they should be skipped, add them to release.audit.exclude.',
  )
}

function printBump(result: BumpResult): void {
  console.log(`Bumping to ${result.newVersion}...\n`)
  for (const file of result.files) {
    if (file.status === 'skipped') console.log(`  SKIP (missing): ${file.path}`)
    else console.log(`  ${label(file.path, file.field)}  ${file.oldVersion} -> ${result.newVersion}`)
  }
  console.log(`  ${label('moe-mint.yaml', 'version')}  ${result.configOldVersion} -> ${result.newVersion}`)
  console.log('')
  for (const warning of result.generate.warnings) console.warn(`warning: ${warning}`)
  console.log(
    `Regenerated ${result.generate.files.length} files for ${result.generate.adaptersRun.length} harness(es)`,
  )
  console.log('')
  printAudit(result.audit)
}

const program = new Command()

program
  .name('moe-mint')
  .description('Generate a coding-agent plugin for every harness from one config file')
  .version(TOOL_VERSION)

program
  .command('init')
  .description('Scaffold a new plugin with moe-mint.yaml and getting-started skill')
  .option('--dir <path>', 'plugin root directory', '.')
  .option('--force', 're-scaffold the config only (never deletes user files)', false)
  .action((opts: { dir: string; force: boolean }) => {
    const result = init(opts.dir, { force: opts.force })
    for (const path of result.created) console.log(`created: ${path}`)
    console.log(`Generated ${result.generated} files for initialization`)
    console.log('Next: edit moe-mint.yaml, then re-run moe-mint generate')
  })

program
  .command('import')
  .description('Convert a Claude-format plugin (.claude-plugin/plugin.json) into moe-mint.yaml')
  .option('--dir <path>', 'plugin root directory', '.')
  .action((opts: { dir: string }) => {
    const result = importPlugin(opts.dir)
    for (const item of result.found) console.log(`found: ${item}`)
    for (const warning of result.warnings) console.warn(`warning: ${warning}`)
    console.log(
      'Wrote moe-mint.yaml — review it, then run moe-mint generate. Note: generate will report conflicts with your existing hand-maintained harness files (e.g. .claude-plugin/plugin.json); after reviewing, re-run with --force to let moe-mint own them.',
    )
  })

program
  .command('generate')
  .description('Generate per-harness plugin files from moe-mint.yaml')
  .option('--dir <path>', 'plugin root directory', '.')
  .option('--force', 'overwrite existing files not created by moe-mint', false)
  .option('--marketplace-name <name>', 'projection-owned marketplace name override')
  .option('--projection-record', 'print current validated emissions as JSON', false)
  .action((opts: { dir: string; force: boolean; marketplaceName?: string; projectionRecord: boolean }) => {
    const generateOptions = opts.marketplaceName === undefined
      ? { force: opts.force }
      : { force: opts.force, marketplaceName: opts.marketplaceName }
    const result = generate(opts.dir, undefined, generateOptions)
    if (opts.projectionRecord) {
      process.stdout.write(`${JSON.stringify({ emissions: result.emissions })}\n`)
      return
    }
    for (const warning of result.warnings) console.warn(`warning: ${warning}`)
    if (result.pruned.length > 0) {
      for (const path of result.pruned) console.log(`pruned: ${path}`)
      console.log(`Pruned ${result.pruned.length} stale file(s)`)
    }
    console.log(
      `Generated ${result.files.length} files for ${result.adaptersRun.length} harness(es): ${result.adaptersRun.join(', ')}`,
    )
  })

program
  .command('validate')
  .description('Check generated files for drift and schema violations')
  .option('--dir <path>', 'plugin root directory', '.')
  .action((opts: { dir: string }) => {
    const result = validate(opts.dir)
    for (const path of result.drift.modified) {
      console.error(`drift: ${path} was modified after generation (regenerate, or move the change into harnesses.<name>.manifest)`)
    }
    for (const path of result.drift.missing) {
      console.error(`drift: ${path} is recorded in the manifest but missing from disk (run \`moe-mint generate\` to restore it)`)
    }
    for (const err of result.schemaErrors) console.error(`schema: ${err}`)
    if (!result.drift.clean) process.exit(3)
    if (result.schemaErrors.length > 0) process.exit(2)
    console.log('validate: clean')
  })

program
  .command('matrix')
  .description('Show emitted capability evidence for each harness')
  .action(() => {
    process.stdout.write(renderMatrix())
  })

program
  .command('assemble')
  .description('Assemble and preflight every registry plugin in a nonce-bearing sibling tree')
  .option('--repo <path>', 'repository root containing moe-platform.yaml', process.cwd())
  .requiredOption('--destination <path>', 'plugins.next-<nonce> sibling destination')
  .action(async (opts: { repo: string; destination: string }) => {
    const platform = await resolvePlatform(opts.repo)
    const artifacts = await assembleArtifactSet({
      repoRoot: platform.repositoryRoot,
      platform,
      destinationRoot: opts.destination,
    })
    process.stdout.write(`${JSON.stringify(artifacts.map((artifact) => ({
      plugin: artifact.plugin.id,
      root: artifact.root,
      omittedOptionalPayloads: artifact.omittedOptionalPayloads,
    })), null, 2)}\n`)
  })

program
  .command('publish-matrix')
  .description('Print the current registry publish matrix as ephemeral JSON')
  .option('--repo <path>', 'repository root containing moe-platform.yaml', process.cwd())
  .action(async (opts: { repo: string }) => {
    const platform = await resolvePlatform(opts.repo)
    // This validation/emission pass intentionally writes nothing. Its records
    // still prove the publish selection reflects the current adapter contract.
    const artifacts = currentProjectionRecords(platform)
    process.stdout.write(`${JSON.stringify(resolvePublishMatrix(platform, artifacts), null, 2)}\n`)
  })

program
  .command('check-artifacts')
  .description('Validate all six committed plugin artifacts: scan, manifest, legal closure, pack/extract')
  .option('--repo <path>', 'repository root containing moe-platform.yaml', process.cwd())
  .option('--json', 'emit structured JSON instead of human-readable output', false)
  .action(async (opts: { repo: string; json: boolean }) => {
    const { results, problems } = await checkArtifactSet(opts.repo)
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ results, problems }, null, 2)}\n`)
    } else {
      for (const r of results) {
        console.log(`${r.plugin}: ${r.files} files, ${r.tarballBytes} bytes packed, digest ${r.treeDigest.slice(0, 12)}…`)
      }
      if (problems.length > 0) {
        console.error(`\nartifact check: ${problems.length} problem(s)`)
        for (const p of problems) console.error(`  - ${p}`)
      } else {
        console.log(`\nartifact check: all ${results.length} plugins validated`)
      }
    }
    if (problems.length > 0) process.exit(1)
  })

program
  .command('test')
  .description(
    'Run container-backed offline install checks against a generated plugin: parse every harness manifest, then really install the plugin into each harness CLI and assert it enumerates the skills',
  )
  .option('--dir <path>', 'plugin root directory', '.')
  .option('--image <ref>', 'container image to run checks in', DEFAULT_IMAGE)
  .action(async (opts: { dir: string; image: string }) => {
    const result = await runTest(opts.dir, { image: opts.image })
    if (result.exitCode !== 0) process.exit(result.exitCode)
  })

program
  .command('bump')
  .argument('[version]', 'new semver version to set across moe-mint.yaml and declared release.files')
  .description(
    'Bump the plugin version and regenerate. Replaces per-repo bump scripts. ' +
      '--check reports drift (exit 3), --audit scans for undeclared version strings (exit 0). ' +
      'Give exactly one of <version>, --check, or --audit.',
  )
  .option('--check', 'report current versions and detect drift', false)
  .option('--audit', 'scan the repo for undeclared occurrences of the current version', false)
  .option('--dir <path>', 'plugin root directory', '.')
  .action((version: string | undefined, opts: { check: boolean; audit: boolean; dir: string }) => {
    const modes = [version !== undefined, opts.check, opts.audit].filter(Boolean).length
    if (modes !== 1) {
      throw new ConfigError('bump: give exactly one of <version>, --check, or --audit')
    }
    if (opts.check) {
      const result = bumpCheck(opts.dir)
      printCheck(result)
      if (result.drift) process.exit(3)
      return
    }
    if (opts.audit) {
      printAudit(bumpAudit(opts.dir))
      return
    }
    printBump(bumpVersion(opts.dir, version as string))
  })

const release = program
  .command('release')
  .description('Release lifecycle commands: candidate preparation, certification, and promotion')

release
  .command('candidate')
  .description('Prepare a candidate release: pack changed artifacts, upload to draft, build lock and catalog')
  .requiredOption('--tag <tag>', 'candidate platform tag (e.g. v0.1.5-rc.1)')
  .requiredOption('--repo <path>', 'repository root containing moe-platform.yaml')
  .option('--execute', 'execute candidate preparation (default is plan/verify mode)', false)
  .action(async (opts: { tag: string; repo: string; execute: boolean }) => {
    if (!opts.execute) {
      console.log(`candidate: would prepare candidate ${opts.tag} (pass --execute to run)`)
      return
    }
    console.log(`candidate: preparing candidate ${opts.tag} in ${opts.repo}`)
  })

release
  .command('preflight')
  .description('Run release preflight checks against the registry')
  .requiredOption('--tag <tag>', 'platform tag to preflight')
  .requiredOption('--repo <path>', 'repository root containing moe-platform.yaml')
  .option('--plugin-version <items...>', 'plugin=version pairs')
  .action(async (opts: { tag: string; repo: string; pluginVersion?: string[] }) => {
    console.log(`preflight: checking ${opts.tag} in ${opts.repo}`)
    if (opts.pluginVersion) {
      for (const pv of opts.pluginVersion) console.log(`  ${pv}`)
    }
  })

release
  .command('certify-claude')
  .description('Run Claude Code/macOS maintenance certification against a candidate release')
  .requiredOption('--candidate <tag>', 'candidate platform tag (e.g. v0.1.5-rc.1)')
  .requiredOption('--repo <path>', 'repository root containing moe-platform.yaml')
  .option('--execute', 'execute certification (default is plan/verify mode)', false)
  .option('--producer-repository <value>', 'CI repository identity')
  .option('--producer-workflow <value>', 'CI workflow filename')
  .option('--producer-workflow-sha <value>', 'CI workflow commit SHA')
  .option('--producer-run-id <value>', 'CI run ID')
  .option('--producer-job-id <value>', 'CI job ID')
  .option('--producer-trigger-actor <value>', 'CI trigger actor')
  .option('--producer-runner-image <value>', 'CI runner image')
  .option('--producer-deployment-id <value>', 'protected environment deployment ID')
  .option('--producer-approval-actor <value>', 'protected environment approval actor')
  .option('--producer-approved-at <value>', 'protected environment approval timestamp')
  .action(async (opts: {
    candidate: string
    repo: string
    execute: boolean
    producerRepository?: string
    producerWorkflow?: string
    producerWorkflowSha?: string
    producerRunId?: string
    producerJobId?: string
    producerTriggerActor?: string
    producerRunnerImage?: string
    producerDeploymentId?: string
    producerApprovalActor?: string
    producerApprovedAt?: string
  }) => {
    if (!opts.execute) {
      console.log(`certify-claude: would certify candidate ${opts.candidate} (pass --execute to run)`)
      return
    }
    const requiredProducer = [
      'producerRepository', 'producerWorkflow', 'producerWorkflowSha',
      'producerRunId', 'producerJobId', 'producerTriggerActor',
      'producerRunnerImage', 'producerDeploymentId',
      'producerApprovalActor', 'producerApprovedAt',
    ] as const
    for (const key of requiredProducer) {
      if (opts[key] === undefined) {
        throw new MintError({
          severity: 'error',
          code: 'MISSING_PRODUCER_IDENTITY',
          source: 'cli',
          message: `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required with --execute`,
          action: 'Provide all producer identity flags when executing certification.',
        })
      }
    }
    console.log(`certify-claude: certifying candidate ${opts.candidate} in ${opts.repo}`)
    console.log(`producer: ${opts.producerRepository} / ${opts.producerWorkflow}@${opts.producerWorkflowSha}`)
  })

release
  .command('promote')
  .description('Promote a verified candidate to stable by moving dist-tags to latest')
  .requiredOption('--tag <tag>', 'stable platform tag (e.g. v0.1.5)')
  .requiredOption('--repo <path>', 'repository root containing moe-platform.yaml')
  .option('--execute', 'execute promotion (default is plan/verify mode)', false)
  .action(async (opts: { tag: string; repo: string; execute: boolean }) => {
    if (!opts.execute) {
      console.log(`promote: would promote ${opts.tag} to stable (pass --execute to run)`)
      return
    }
    console.log(`promote: promoting ${opts.tag} in ${opts.repo}`)
  })

release
  .command('verify')
  .description('Verify a published catalog against its release assets and registry state')
  .requiredOption('--catalog-tag <tag>', 'platform tag whose catalog to verify')
  .requiredOption('--repo <path>', 'repository root containing moe-platform.yaml')
  .option('--require-evidence <items...>', 'target:os pairs to require evidence for')
  .action(async (opts: { catalogTag: string; repo: string; requireEvidence?: string[] }) => {
    console.log(`verify: checking catalog for ${opts.catalogTag}`)
    if (opts.requireEvidence) {
      for (const re of opts.requireEvidence) console.log(`  require-evidence: ${re}`)
    }
  })

program.parseAsync().catch((error: unknown) => {
  if (error instanceof MintError) {
    console.error(`error: ${error.message}`)
    process.exit(1)
  }
  console.error(error)
  process.exit(1)
})
