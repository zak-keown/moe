/**
 * CR-008 regression: session secrets (server-info, .last-port, .last-token,
 * and the session directory itself) must never be written through a symlink
 * planted ahead of us, and their mode must always take effect.
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const SERVER = path.join(__dirname, '../../skills/brainstorming/scripts/server.mjs');
const START_SCRIPT = path.join(__dirname, '../../skills/brainstorming/scripts/start-server.sh');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS: ${name}`); passed++; }
  catch (e) { console.log(`  FAIL: ${name}`); console.log(`    ${e.message}`); failed++; }
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-secfile-'));
}

let writeSecretFile;
(async () => {
const mod = await import(pathToFileURL(SERVER).href);
writeSecretFile = mod.writeSecretFile;

console.log('\n--- writeSecretFile (server.mjs) ---');

test('creates a fresh file with the requested mode', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'server-info');
  writeSecretFile(target, 'payload', 0o600);
  assert.strictEqual(fs.readFileSync(target, 'utf-8'), 'payload');
  assert.strictEqual(fs.statSync(target).mode & 0o777, 0o600);
});

test('does not follow a planted symlink, and the mode still takes effect', () => {
  const dir = tmpDir();
  const victim = path.join(dir, 'victim.txt');
  fs.writeFileSync(victim, 'do not overwrite me', { mode: 0o644 });
  const target = path.join(dir, 'server-info');
  fs.symlinkSync(victim, target);

  writeSecretFile(target, 'secret-payload', 0o600);

  // The victim file must be untouched...
  assert.strictEqual(fs.readFileSync(victim, 'utf-8'), 'do not overwrite me');
  assert.strictEqual(fs.statSync(victim).mode & 0o777, 0o644);
  // ...and `target` is now a real file (the symlink was replaced), holding
  // the payload with the correct mode.
  assert.strictEqual(fs.lstatSync(target).isSymbolicLink(), false);
  assert.strictEqual(fs.readFileSync(target, 'utf-8'), 'secret-payload');
  assert.strictEqual(fs.statSync(target).mode & 0o777, 0o600);
});

test('overwrites a stale plain file from a prior session (legitimate restart)', () => {
  const dir = tmpDir();
  const target = path.join(dir, '.last-token');
  fs.writeFileSync(target, 'old-token', { mode: 0o644 });
  writeSecretFile(target, 'new-token', 0o600);
  assert.strictEqual(fs.readFileSync(target, 'utf-8'), 'new-token');
  assert.strictEqual(fs.statSync(target).mode & 0o777, 0o600);
});

console.log('\n--- create_session_dir_exclusive (start-server.sh) ---');

function runShellFn(fnCall) {
  return execFileSync(
    'bash',
    ['-c', `BRAINSTORM_TEST_SOURCE_ONLY=1 source "${START_SCRIPT}"; ${fnCall}`],
    { encoding: 'utf-8' },
  );
}

test('creates the directory when nothing exists at that path', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'session-abc');
  runShellFn(`create_session_dir_exclusive "${target}" && echo OK`);
  assert.strictEqual(fs.statSync(target).isDirectory(), true);
});

test('refuses when a real directory already exists at that path', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'session-abc');
  fs.mkdirSync(target);
  assert.throws(() => runShellFn(`create_session_dir_exclusive "${target}"`));
});

test('refuses when a symlink is planted at that path', () => {
  const dir = tmpDir();
  const victim = path.join(dir, 'victim-dir');
  fs.mkdirSync(victim);
  const target = path.join(dir, 'session-abc');
  fs.symlinkSync(victim, target);
  assert.throws(() => runShellFn(`create_session_dir_exclusive "${target}"`));
  // And the victim directory must never receive session content: since the
  // function itself only mkdir()s, there is nothing to assert beyond "it
  // refused" — but sanity-check the symlink was left alone (not replaced).
  assert.strictEqual(fs.lstatSync(target).isSymbolicLink(), true);
});

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
