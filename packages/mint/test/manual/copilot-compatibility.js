#!/usr/bin/env node
/**
 * Copilot compatibility check for a Memory plugin candidate.
 *
 * This runs a minimum/current custom-path structural projection against
 * the candidate tarball. It does NOT constitute full Copilot certification;
 * Copilot targets remain "preview" unless a full certification contract passes.
 *
 * Verifies:
 * - The candidate tarball extracts cleanly
 * - A Copilot-compatible CLAUDE.md or plugin manifest exists
 * - Skills are discoverable under the Copilot adapter's custom path layout
 * - The MCP server declaration is present
 *
 * Usage:
 *   node copilot-compatibility.js \
 *     --candidate-tarball .artifacts/bubstack-moe-memory-0.2.0.tgz \
 *     --candidate-tag v0.1.6-rc.1 \
 *     --source-sha abc1234... \
 *     --output-dir release-output
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

function die(message) {
  console.error(`copilot-compatibility: ${message}`);
  process.exit(1);
}

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      'candidate-tarball': { type: 'string' },
      'candidate-tag': { type: 'string' },
      'source-sha': { type: 'string' },
      'output-dir': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });

  for (const required of ['candidate-tarball', 'candidate-tag', 'output-dir']) {
    if (!values[required]) die(`--${required} is required`);
  }
  return values;
}

function extractTarball(tarballPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync('tar', ['xzf', tarballPath, '-C', destDir, '--strip-components=1'], {
    stdio: 'inherit',
  });
}

function checkStructure(pluginDir) {
  const checks = [];

  const pluginJson = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  checks.push({
    name: 'plugin-manifest',
    pass: fs.existsSync(pluginJson),
    detail: fs.existsSync(pluginJson) ? 'found' : 'missing .claude-plugin/plugin.json',
  });

  const mcpJson = path.join(pluginDir, '.mcp.json');
  checks.push({
    name: 'mcp-declaration',
    pass: fs.existsSync(mcpJson),
    detail: fs.existsSync(mcpJson) ? 'found' : 'missing .mcp.json',
  });

  const skillsDir = path.join(pluginDir, 'skills');
  const hasSkills = fs.existsSync(skillsDir) &&
    fs.readdirSync(skillsDir, { withFileTypes: true }).some(e => e.isDirectory());
  checks.push({
    name: 'skill-discovery',
    pass: hasSkills,
    detail: hasSkills ? 'skills directory with content' : 'no skills found',
  });

  const hooksJson = path.join(pluginDir, 'hooks', 'hooks.json');
  checks.push({
    name: 'hooks-manifest',
    pass: fs.existsSync(hooksJson),
    detail: fs.existsSync(hooksJson) ? 'found' : 'missing hooks/hooks.json',
  });

  const bootstrapDir = path.join(pluginDir, 'bootstrap');
  checks.push({
    name: 'bootstrap-context',
    pass: fs.existsSync(path.join(bootstrapDir, 'CONTEXT.md')),
    detail: fs.existsSync(path.join(bootstrapDir, 'CONTEXT.md'))
      ? 'CONTEXT.md present'
      : 'no bootstrap/CONTEXT.md',
  });

  return checks;
}

function main() {
  const args = parseCliArgs();
  const tarballPath = path.resolve(args['candidate-tarball']);

  if (!fs.existsSync(tarballPath)) {
    die(`candidate tarball not found: ${tarballPath}`);
  }

  const outputDir = path.resolve(args['output-dir']);
  fs.mkdirSync(outputDir, { recursive: true });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moe-memory-copilot-compat-'));
  const pluginDir = path.join(root, 'plugin');

  try {
    extractTarball(tarballPath, pluginDir);
    const checks = checkStructure(pluginDir);
    const allPass = checks.every(c => c.pass);

    const tarballBytes = fs.readFileSync(tarballPath);
    const sha256 = createHash('sha256').update(tarballBytes).digest('hex');

    const report = {
      schema: 1,
      target: 'copilot',
      candidate_tag: args['candidate-tag'],
      source_sha: args['source-sha'] || 'unknown',
      tarball_sha256: sha256,
      status: allPass ? 'compatible' : 'incompatible',
      checks,
      timestamp: new Date().toISOString(),
    };

    const reportPath = path.join(
      outputDir,
      `copilot-compatibility-${args['candidate-tag']}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

    console.log(`Copilot compatibility: ${report.status}`);
    console.log(`Report: ${reportPath}`);
    for (const check of checks) {
      console.log(`  ${check.pass ? 'PASS' : 'FAIL'}: ${check.name} — ${check.detail}`);
    }

    if (!allPass) process.exit(1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
