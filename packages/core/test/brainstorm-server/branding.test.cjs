/**
 * Tests for the visual companion's branding block.
 *
 * REWRITTEN ON IMPORT. Upstream this file tested a telemetry beacon: the brand
 * markup injected `<img src="https://primeradiant.com/brand/...?v=<version>">`
 * into every served page, sending the plugin version and the viewer's IP to a
 * third party on every session, opt-out only via SUPERPOWERS_DISABLE_TELEMETRY /
 * DISABLE_TELEMETRY / CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC. The beacon is
 * REMOVED here rather than rebranded, so the five opt-out tests and every
 * `.brand-logo` assertion have no subject any more.
 *
 * What replaces them is the inverse invariant, which is the one worth guarding:
 * the served HTML must contain no remote asset and no outbound link at all.
 * The version probe and the header layout assertions are kept as-is; the probe
 * now reads `.claude-plugin/plugin.json` (which moe-mint emits) before
 * `package.json`, where upstream read `package.json` then `.codex-plugin/`.
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const REPO_ROOT = path.join(__dirname, '../..');
const SERVER_PATH = path.join(REPO_ROOT, 'skills/brainstorming/scripts/server.mjs');
const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')
).version;
const TOKEN = 'testtoken-branding-0123456789abcdef';

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startServer({ port, dir, env = {}, serverPath = SERVER_PATH }) {
  cleanup(dir);
  return spawn('node', [serverPath], {
    env: {
      ...process.env,
      BRAINSTORM_PORT: String(port),
      BRAINSTORM_DIR: dir,
      BRAINSTORM_TOKEN: TOKEN,
      ...env
    }
  });
}

function waitForServer(server) {
  let stdout = '';
  let stderr = '';

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. stderr: ${stderr}`)), 5000);
    server.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.includes('server-started')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.stderr.on('data', (data) => { stderr += data.toString(); });
    server.on('error', reject);
  });
}

function fetchHtml(port) {
  return new Promise((resolve, reject) => {
    const headers = { Cookie: `brainstorm-key-${port}=${TOKEN}` };
    http.get(`http://localhost:${port}/`, { headers }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function writeFragment(dir) {
  const contentDir = path.join(dir, 'content');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.writeFileSync(path.join(contentDir, 'screen.html'), '<h2>Pick a layout</h2>');
}

// A plugin tree as moe-mint generates it: manifests at the plugin root, no
// package.json. Proves readPluginVersion() resolves the right depth
// (__dirname/../../.. from skills/brainstorming/scripts) in the shipped shape,
// not just in the source tree.
function createGeneratedPluginFixture(version) {
  const root = fs.mkdtempSync(path.join('/tmp', 'moe-core-generated-plugin-'));
  const scriptDir = path.join(root, 'skills/brainstorming/scripts');
  fs.cpSync(path.join(REPO_ROOT, 'skills/brainstorming/scripts'), scriptDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude-plugin/plugin.json'),
    JSON.stringify({ name: 'moe-core', version }, null, 2)
  );
  return {
    root,
    serverPath: path.join(scriptDir, 'server.mjs')
  };
}

async function withServer(options, fn) {
  const server = startServer(options);
  try {
    await waitForServer(server);
    await fn();
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill();
      await new Promise(resolve => server.once('exit', resolve));
    }
    await sleep(100);
    cleanup(options.dir);
  }
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function assertBrandedText(html, version = PACKAGE_VERSION) {
  assert(
    html.includes(`Moe v${version}`),
    `branding text should include the dynamic plugin version (expected "Moe v${version}")`
  );
  assert(
    /<div class="brand"><span class="brand-copy">Moe v/.test(html),
    'brand block should be a bare span, with no wrapping link or image'
  );
}

// The invariant that replaced the telemetry opt-out matrix. If anyone reinstates
// a remote asset or an outbound link in the brand block, this fails.
function assertNoRemoteAssetsOrOutboundLinks(html) {
  assert(!/primeradiant/i.test(html), 'served HTML must not reference primeradiant.com');
  assert(!/<img\b/i.test(html), 'served HTML must not embed any image');
  assert(!/https:\/\//i.test(html), 'served HTML must not reference any https URL');
  assert(!/<a\s[^>]*href=/i.test(html), 'served HTML must not contain an outbound link');
}

function assertFramedScreenUsesBrandHeader(html) {
  assert(!html.includes('<div class="indicator-bar">'), 'framed screens should not render footer chrome');
  assert(
    /<div class="header">[\s\S]*<div class="brand">[\s\S]*<div class="status">Connecting…<\/div>/.test(html),
    'header should contain branding and connection status'
  );
  assert(!html.includes('id="indicator-text"'), 'header should not render the selection indicator text');
  assert(!html.includes('Click an option above'), 'header should not render the selection instruction');
}

function assertHeaderAvoidsNarrowOverlap(html) {
  assert(
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/i.test(html),
    'header should allocate shrinkable space to branding before the status column'
  );
  assert(
    /\.header \.status\s*\{[^}]*grid-column:\s*2/i.test(html),
    'status should live in the final fixed-width grid column'
  );
  assert(
    /\.header \.brand\s*\{[^}]*width:\s*100%/i.test(html),
    'header brand should fill its grid track so overflow clipping prevents overlap'
  );
}

async function main() {
  console.log('\n--- Visual Companion Branding ---');

  await test('framed screens render the version as text, with no remote asset', async () => {
    const port = 3451;
    const dir = '/tmp/brainstorm-branding-default';
    await withServer({ port, dir }, async () => {
      writeFragment(dir);
      await sleep(300);
      const html = await fetchHtml(port);
      assertBrandedText(html);
      assertNoRemoteAssetsOrOutboundLinks(html);
      assertFramedScreenUsesBrandHeader(html);
      assertHeaderAvoidsNarrowOverlap(html);
    });
  });

  await test('waiting screen renders the version as text, with no remote asset', async () => {
    const port = 3452;
    const dir = '/tmp/brainstorm-branding-waiting';
    await withServer({ port, dir }, async () => {
      const html = await fetchHtml(port);
      assert(html.includes('Waiting for the agent'), 'waiting page should still render');
      assertBrandedText(html);
      assertNoRemoteAssetsOrOutboundLinks(html);
    });
  });

  await test('generated plugin tree reads version from .claude-plugin manifest', async () => {
    const port = 3457;
    const dir = '/tmp/brainstorm-branding-generated-plugin';
    const generatedVersion = '7.8.9';
    const fixture = createGeneratedPluginFixture(generatedVersion);

    try {
      await withServer({ port, dir, serverPath: fixture.serverPath }, async () => {
        writeFragment(dir);
        await sleep(300);
        const html = await fetchHtml(port);
        assertBrandedText(html, generatedVersion);
        assert(!html.includes('Moe vunknown'), 'generated plugin should not fall back to unknown version');
      });
    } finally {
      cleanup(fixture.root);
    }
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
