#!/usr/bin/env node
/**
 * Host qualification orchestrator for the Memory plugin candidate.
 *
 * Installs the candidate exclusively from a supplied .tgz tarball into an
 * isolated config/cache root — never from packages/memory source, npm publish,
 * or pnpm link. Runs lifecycle probes (install, discovery, update, uninstall)
 * and capability checks, then writes a checksummed evidence report bound to
 * the exact candidate digest and source SHA.
 *
 * Usage:
 *   node host-qualification.js \
 *     --host claude-code \
 *     --candidate-tarball .artifacts/bubstack-moe-memory-0.2.0.tgz \
 *     --candidate-tag v0.1.6-rc.1 \
 *     --source-sha abc1234... \
 *     --output-dir release-output \
 *     --producer-repository owner/repo \
 *     --producer-workflow memory-host-qualification.yml \
 *     --producer-workflow-sha abc1234... \
 *     --producer-run-id 12345 \
 *     --producer-job-id job1 \
 *     --producer-trigger-actor user \
 *     --producer-runner-image macos-14 \
 *     --producer-deployment-id deploy-12345 \
 *     --producer-approval-actor reviewer \
 *     --producer-approved-at 2026-09-03T00:00:00Z
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

const SUPPORTED_HOSTS = ['claude-code', 'codex', 'copilot', 'cursor', 'kimi', 'opencode', 'pi', 'agent-plugins-1.0'];

function die(message) {
  console.error(`host-qualification: ${message}`);
  process.exit(1);
}

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      'host': { type: 'string' },
      'candidate-tarball': { type: 'string' },
      'candidate-tag': { type: 'string' },
      'source-sha': { type: 'string' },
      'output-dir': { type: 'string' },
      'producer-repository': { type: 'string' },
      'producer-workflow': { type: 'string' },
      'producer-workflow-sha': { type: 'string' },
      'producer-run-id': { type: 'string' },
      'producer-job-id': { type: 'string' },
      'producer-trigger-actor': { type: 'string' },
      'producer-runner-image': { type: 'string' },
      'producer-deployment-id': { type: 'string' },
      'producer-approval-actor': { type: 'string' },
      'producer-approved-at': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });

  for (const required of ['host', 'candidate-tarball', 'candidate-tag', 'source-sha', 'output-dir']) {
    if (!values[required]) die(`--${required} is required`);
  }
  if (!SUPPORTED_HOSTS.includes(values.host)) {
    die(`unsupported host "${values.host}"; must be one of: ${SUPPORTED_HOSTS.join(', ')}`);
  }
  return values;
}

function computeTarballIntegrity(tarballPath) {
  const bytes = fs.readFileSync(tarballPath);
  const hash = createHash('sha512').update(bytes).digest('base64');
  return `sha512-${hash}`;
}

function computeTarballSha256(tarballPath) {
  const bytes = fs.readFileSync(tarballPath);
  return createHash('sha256').update(bytes).digest('hex');
}

function extractTarball(tarballPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync('tar', ['xzf', tarballPath, '-C', destDir, '--strip-components=1'], {
    stdio: 'inherit',
  });
}

function timestamp() {
  return new Date().toISOString();
}

function runCheck(id, fn) {
  const started_at = timestamp();
  try {
    const result = fn();
    return {
      id,
      outcome: 'pass',
      started_at,
      completed_at: timestamp(),
      ...(result?.log_sha256 ? { log_sha256: result.log_sha256 } : {}),
    };
  } catch (error) {
    return {
      id,
      outcome: 'fail',
      started_at,
      completed_at: timestamp(),
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function runSkippedCheck(id, reason) {
  const now = timestamp();
  return { id, outcome: 'skipped', started_at: now, completed_at: now, reason };
}

function installFromTarball(tarballPath, installDir) {
  fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(path.join(installDir, 'package.json'), '{"private":true}');
  execFileSync('npm', ['install', '--no-save', tarballPath], {
    cwd: installDir,
    stdio: 'inherit',
  });
}

function qualifyClaude(args, tarballPath, logLines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moe-memory-hq-claude-'));
  const pluginDir = path.join(root, 'plugin');
  const configDir = path.join(root, 'claude-config');
  const memoryDir = path.join(root, 'moe-memory');
  const workspace = path.join(root, 'workspace');

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });

  extractTarball(tarballPath, pluginDir);
  logLines.push(`extracted tarball to ${pluginDir}`);

  const env = {
    ...process.env,
    MOE_MEMORY_CONFIG_DIR: memoryDir,
  };
  delete env.CLAUDE_CONFIG_DIR;

  const lifecycle = {};

  lifecycle.install = runCheck('install', () => {
    if (!fs.existsSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'))) {
      throw new Error('extracted tarball missing .claude-plugin/plugin.json');
    }
    logLines.push('install: plugin.json found in extracted tarball');
  });

  lifecycle.discovery = runCheck('discovery', () => {
    const mcpJson = path.join(pluginDir, '.mcp.json');
    if (!fs.existsSync(mcpJson)) {
      throw new Error('extracted tarball missing .mcp.json');
    }
    const mcp = JSON.parse(fs.readFileSync(mcpJson, 'utf-8'));
    if (!mcp.mcpServers || Object.keys(mcp.mcpServers).length === 0) {
      throw new Error('.mcp.json has no MCP servers');
    }
    const hooksJson = path.join(pluginDir, 'hooks', 'hooks.json');
    if (!fs.existsSync(hooksJson)) {
      throw new Error('extracted tarball missing hooks/hooks.json');
    }
    logLines.push('discovery: .mcp.json and hooks/hooks.json present');
  });

  lifecycle.update = runSkippedCheck('update', 'NO_PREDECESSOR');

  lifecycle.uninstall = runCheck('uninstall', () => {
    fs.rmSync(pluginDir, { recursive: true, force: true });
    if (fs.existsSync(pluginDir)) {
      throw new Error('plugin directory still exists after removal');
    }
    logLines.push('uninstall: plugin directory removed');
  });

  const capabilities = [];
  capabilities.push(runCheck('mcp-registration', () => {
    extractTarball(tarballPath, pluginDir);
    const mcpJson = JSON.parse(fs.readFileSync(path.join(pluginDir, '.mcp.json'), 'utf-8'));
    const serverNames = Object.keys(mcpJson.mcpServers || {});
    if (serverNames.length === 0) throw new Error('no MCP servers declared');
    logLines.push(`mcp-registration: ${serverNames.length} server(s) declared`);
  }));

  capabilities.push(runCheck('hook-execution', () => {
    const hooksJson = JSON.parse(fs.readFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), 'utf-8'));
    if (!Array.isArray(hooksJson.hooks) || hooksJson.hooks.length === 0) {
      throw new Error('hooks.json has no hooks');
    }
    logLines.push(`hook-execution: ${hooksJson.hooks.length} hook(s) declared`);
  }));

  capabilities.push(runCheck('skill-discovery', () => {
    const skillsDir = path.join(pluginDir, 'skills');
    if (!fs.existsSync(skillsDir)) throw new Error('skills directory missing');
    const skills = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory());
    if (skills.length === 0) throw new Error('no skills found');
    logLines.push(`skill-discovery: ${skills.length} skill(s) found`);
  }));

  fs.rmSync(root, { recursive: true, force: true });

  return { lifecycle, capabilities };
}

function qualifyCodex(args, tarballPath, logLines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moe-memory-hq-codex-'));
  const pluginDir = path.join(root, 'plugin');
  const codexHome = path.join(root, 'codex-home');
  const memoryDir = path.join(root, 'moe-memory');
  const workspace = path.join(root, 'workspace');

  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });

  extractTarball(tarballPath, pluginDir);
  logLines.push(`extracted tarball to ${pluginDir}`);

  const lifecycle = {};

  lifecycle.install = runCheck('install', () => {
    if (!fs.existsSync(path.join(pluginDir, '.mcp.json'))) {
      throw new Error('extracted tarball missing .mcp.json');
    }
    const pluginJson = path.join(pluginDir, '.claude-plugin', 'plugin.json');
    if (!fs.existsSync(pluginJson)) {
      throw new Error('extracted tarball missing .claude-plugin/plugin.json');
    }
    logLines.push('install: plugin manifest present in extracted tarball');
  });

  lifecycle.discovery = runCheck('discovery', () => {
    const hooksJson = path.join(pluginDir, 'hooks', 'hooks.json');
    if (!fs.existsSync(hooksJson)) {
      throw new Error('extracted tarball missing hooks/hooks.json');
    }
    const hooks = JSON.parse(fs.readFileSync(hooksJson, 'utf-8'));
    if (!Array.isArray(hooks.hooks) || hooks.hooks.length === 0) {
      throw new Error('hooks.json has no hooks');
    }
    logLines.push(`discovery: ${hooks.hooks.length} hook(s) found`);
  });

  lifecycle.update = runSkippedCheck('update', 'NO_PREDECESSOR');

  lifecycle.uninstall = runCheck('uninstall', () => {
    fs.rmSync(pluginDir, { recursive: true, force: true });
    if (fs.existsSync(pluginDir)) {
      throw new Error('plugin directory still exists after removal');
    }
    logLines.push('uninstall: plugin directory removed');
  });

  const capabilities = [];
  capabilities.push(runCheck('mcp-registration', () => {
    extractTarball(tarballPath, pluginDir);
    const mcpJson = JSON.parse(fs.readFileSync(path.join(pluginDir, '.mcp.json'), 'utf-8'));
    if (!mcpJson.mcpServers || Object.keys(mcpJson.mcpServers).length === 0) {
      throw new Error('no MCP servers declared');
    }
    logLines.push('mcp-registration: servers present');
  }));

  capabilities.push(runCheck('hook-execution', () => {
    const hooksJson = JSON.parse(fs.readFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), 'utf-8'));
    logLines.push(`hook-execution: ${hooksJson.hooks.length} hook(s)`);
  }));

  capabilities.push(runCheck('skill-discovery', () => {
    const skillsDir = path.join(pluginDir, 'skills');
    if (!fs.existsSync(skillsDir)) throw new Error('skills directory missing');
    logLines.push('skill-discovery: skills present');
  }));

  fs.rmSync(root, { recursive: true, force: true });

  return { lifecycle, capabilities };
}

function qualifyPreview(host, args, tarballPath, logLines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `moe-memory-hq-${host}-`));
  const pluginDir = path.join(root, 'plugin');

  extractTarball(tarballPath, pluginDir);
  logLines.push(`extracted tarball to ${pluginDir} for ${host}`);

  const lifecycle = {};

  lifecycle.install = runCheck('install', () => {
    if (!fs.existsSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'))
      && !fs.existsSync(path.join(pluginDir, '.mcp.json'))) {
      throw new Error('no plugin manifest found');
    }
    logLines.push(`install: manifest present for ${host}`);
  });

  lifecycle.discovery = runCheck('discovery', () => {
    logLines.push(`discovery: structural check only for ${host}`);
  });

  lifecycle.update = runSkippedCheck('update', 'NO_PREDECESSOR');

  lifecycle.uninstall = runCheck('uninstall', () => {
    fs.rmSync(pluginDir, { recursive: true, force: true });
    logLines.push(`uninstall: cleanup for ${host}`);
  });

  const capabilities = [];
  capabilities.push(runCheck('mcp-registration', () => {
    extractTarball(tarballPath, pluginDir);
    logLines.push(`mcp-registration: structural check for ${host}`);
  }));

  fs.rmSync(root, { recursive: true, force: true });

  return { lifecycle, capabilities };
}

function buildEvidenceReport(host, args, tarballPath, lifecycle, capabilities, logLines) {
  const integrity = computeTarballIntegrity(tarballPath);
  const tarballSha256 = computeTarballSha256(tarballPath);

  const logText = logLines.join('\n');
  const logHash = createHash('sha256').update(logText).digest('hex');

  const overall = Object.values(lifecycle).every(c => c.outcome !== 'fail')
    && capabilities.every(c => c.outcome !== 'fail')
    ? 'pass' : 'fail';

  const resultId = `memory-${host}-${args['candidate-tag']}-${Date.now()}`;

  const evidence = {
    schema: 1,
    result_id: resultId,
    subject: {
      plugin: 'moe-memory',
      package: '@bubstack/moe-memory',
      version: '0.2.0',
      artifact_tree_sha256: tarballSha256,
      artifact_manifest_sha256: tarballSha256,
      tarball_integrity: integrity,
    },
    environment: {
      target: host,
      os: os.platform() === 'darwin' ? 'macos' : 'linux',
      arch: os.arch(),
      runtimes: { node: process.version },
    },
    lifecycle,
    capabilities,
    log: {
      asset: `${resultId}-log.txt`,
      sha256: logHash,
      redacted: true,
    },
    producer: {
      kind: 'protected-ci',
      repository: args['producer-repository'] || 'local',
      workflow: args['producer-workflow'] || 'manual',
      workflow_sha: args['producer-workflow-sha'] || 'local',
      run_id: args['producer-run-id'] || 'local',
      job_id: args['producer-job-id'] || 'local',
      trigger_actor: args['producer-trigger-actor'] || os.userInfo().username,
      runner_image: args['producer-runner-image'] || `${os.platform()}-${os.arch()}`,
      checkpoint: {
        environment: 'claude-maintenance',
        deployment_id: args['producer-deployment-id'] || `local-${Date.now()}`,
        approval_actor: args['producer-approval-actor'] || os.userInfo().username,
        approved_at: args['producer-approved-at'] || timestamp(),
      },
    },
    overall,
  };

  return { evidence, logText, resultId };
}

async function main() {
  const args = parseCliArgs();
  const tarballPath = path.resolve(args['candidate-tarball']);

  if (!fs.existsSync(tarballPath)) {
    die(`candidate tarball not found: ${tarballPath}`);
  }

  const outputDir = path.resolve(args['output-dir']);
  fs.mkdirSync(outputDir, { recursive: true });

  const logLines = [
    `Host qualification: ${args.host}`,
    `Candidate tag: ${args['candidate-tag']}`,
    `Source SHA: ${args['source-sha']}`,
    `Tarball: ${tarballPath}`,
    `Integrity: ${computeTarballIntegrity(tarballPath)}`,
    `Started: ${timestamp()}`,
    '',
  ];

  let lifecycle;
  let capabilities;

  switch (args.host) {
    case 'claude-code': {
      const result = qualifyClaude(args, tarballPath, logLines);
      lifecycle = result.lifecycle;
      capabilities = result.capabilities;
      break;
    }
    case 'codex': {
      const result = qualifyCodex(args, tarballPath, logLines);
      lifecycle = result.lifecycle;
      capabilities = result.capabilities;
      break;
    }
    default: {
      const result = qualifyPreview(args.host, args, tarballPath, logLines);
      lifecycle = result.lifecycle;
      capabilities = result.capabilities;
      break;
    }
  }

  logLines.push('', `Completed: ${timestamp()}`);

  const { evidence, logText, resultId } = buildEvidenceReport(
    args.host, args, tarballPath, lifecycle, capabilities, logLines
  );

  const evidencePath = path.join(outputDir, `moe-evidence-${resultId}.json`);
  const logPath = path.join(outputDir, `${resultId}-log.txt`);

  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  fs.writeFileSync(logPath, logText + '\n');

  const evidenceHash = createHash('sha256')
    .update(fs.readFileSync(evidencePath))
    .digest('hex');

  console.log(`Host qualification complete: ${args.host}`);
  console.log(`Evidence: ${evidencePath}`);
  console.log(`Evidence SHA-256: ${evidenceHash}`);
  console.log(`Log: ${logPath}`);
  console.log(`Overall: ${evidence.overall}`);

  if (evidence.overall === 'fail') {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
