import { describe, it } from 'vitest';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makePageSessionFake } from './_helpers.mjs';

const require = createRequire(import.meta.url);
const { attachScreenshot } = require('../../skills/browsing/lib/screenshot.js');

// Helper: create a real temp session dir and tear it down after the test.
async function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-test-'));
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('screenshot', () => {
  // Use a 1x1 transparent PNG for the fake screenshot data.
  const FAKE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  function setup(handlers = {}) {
    const ps = makePageSessionFake({
      'Page.captureScreenshot': () => ({ data: FAKE_PNG_BASE64 }),
      'Runtime.evaluate': () => ({ result: { value: { width: 1024, height: 768 } } }),
      ...handlers
    });
    const getPageSession = async () => ps;
    // Screenshots must resolve within a known containment root (CR-065);
    // os.tmpdir() is this suite's natural root since tmpFile() below already
    // writes there.
    const state = { sessionDir: os.tmpdir() };
    const initializeSession = () => os.tmpdir();
    return { ...attachScreenshot({ getPageSession, state, initializeSession }), ps };
  }

  function tmpFile() {
    return path.join(os.tmpdir(), `screenshot-test-${Date.now()}-${Math.random()}.png`);
  }

  it('viewport screenshot sends explicit clip from window.innerWidth/Height', async () => {
    const filename = tmpFile();
    const { screenshot, ps } = setup();
    await screenshot(0, filename);

    const screenshotCall = ps.calls.find(c => c.method === 'Page.captureScreenshot');
    assert.deepEqual(screenshotCall.params.clip, { x: 0, y: 0, width: 1024, height: 768, scale: 1 });
    assert.equal(screenshotCall.params.captureBeyondViewport, false);

    fs.unlinkSync(filename);
  });

  it('full-page screenshot uses Page.getLayoutMetrics contentSize', async () => {
    const filename = tmpFile();
    const { screenshot, ps } = setup({
      'Page.getLayoutMetrics': () => ({ contentSize: { width: 1024, height: 5000 } })
    });
    await screenshot(0, filename, null, true);

    const screenshotCall = ps.calls.find(c => c.method === 'Page.captureScreenshot');
    assert.equal(screenshotCall.params.clip.height, 5000);
    assert.equal(screenshotCall.params.captureBeyondViewport, true);

    fs.unlinkSync(filename);
  });

  it('writes the decoded PNG to disk and returns absolute path', async () => {
    const filename = tmpFile();
    const { screenshot } = setup();
    const returned = await screenshot(0, filename);
    assert.ok(path.isAbsolute(returned));
    const written = fs.readFileSync(filename);
    assert.ok(written.length > 0);
    fs.unlinkSync(filename);
  });

  it('decodes base64 correctly — written bytes match the original PNG', async () => {
    const filename = tmpFile();
    const { screenshot } = setup();
    await screenshot(0, filename);
    const written = fs.readFileSync(filename);
    const expected = Buffer.from(FAKE_PNG_BASE64, 'base64');
    assert.deepEqual(written, expected);
    fs.unlinkSync(filename);
  });
});

describe('screenshot path resolution', () => {
  const FAKE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  function setupWithState(sessionDir) {
    const ps = makePageSessionFake({
      'Page.captureScreenshot': () => ({ data: FAKE_PNG_BASE64 }),
      'Runtime.evaluate': () => ({ result: { value: { width: 1024, height: 768 } } }),
    });
    const getPageSession = async () => ps;
    const state = { sessionDir };
    const initializeSession = () => sessionDir;
    return { ...attachScreenshot({ getPageSession, state, initializeSession }), ps };
  }

  it('absolute path is written as-is and returned as-is', async () => {
    await withTempDir(async (dir) => {
      const { screenshot } = setupWithState(dir);
      const absPath = path.join(dir, 'direct.png');
      const returned = await screenshot(0, absPath);
      assert.equal(returned, absPath);
      assert.ok(fs.existsSync(absPath), 'file should exist at absolute path');
    });
  });

  it('relative path is resolved against session dir, not CWD', async () => {
    await withTempDir(async (dir) => {
      const { screenshot } = setupWithState(dir);
      const returned = await screenshot(0, 'relative.png');
      const expected = path.join(dir, 'relative.png');
      assert.equal(returned, expected);
      assert.ok(fs.existsSync(expected), 'file should exist in session dir');
    });
  });

  it('without state/initializeSession, relative path resolves against CWD', async () => {
    const ps = makePageSessionFake({
      'Page.captureScreenshot': () => ({ data: FAKE_PNG_BASE64 }),
      'Runtime.evaluate': () => ({ result: { value: { width: 1024, height: 768 } } }),
    });
    const getPageSession = async () => ps;
    // No state or initializeSession — legacy behaviour: CWD is the
    // containment root (CR-065). A relative filename still resolves against
    // CWD exactly as before.
    const { screenshot } = attachScreenshot({ getPageSession });
    const filename = `legacy-rel-test-${Date.now()}.png`;
    const returned = await screenshot(0, filename);
    assert.equal(returned, path.resolve(process.cwd(), filename));
    fs.unlinkSync(returned);
  });

  // CR-065: a filename is a tool argument. Without containment, an absolute
  // path anywhere on disk — or a relative path with enough `../` segments —
  // let one screenshot call overwrite any file the MCP process can write.
  it('CR-065: an absolute path outside the containment root is rejected, not written', async () => {
    const ps = makePageSessionFake({
      'Page.captureScreenshot': () => ({ data: FAKE_PNG_BASE64 }),
      'Runtime.evaluate': () => ({ result: { value: { width: 1024, height: 768 } } }),
    });
    const getPageSession = async () => ps;
    // Legacy mode: root is CWD. os.tmpdir() is a different directory.
    const { screenshot } = attachScreenshot({ getPageSession });
    const outside = path.join(os.tmpdir(), `should-not-be-written-${Date.now()}.png`);
    await assert.rejects(() => screenshot(0, outside), /outside the session directory|not under/i);
    assert.equal(fs.existsSync(outside), false, 'must never have been written');
  });

  it('CR-065: relative path traversal (../) that would escape the session dir is rejected', async () => {
    await withTempDir(async (dir) => {
      const { screenshot } = setupWithState(dir);
      const escapee = `../../../escaped-by-traversal-${Date.now()}.png`;
      const wouldLandAt = path.resolve(dir, escapee);
      await assert.rejects(() => screenshot(0, escapee), /outside the session directory|not under/i);
      assert.equal(fs.existsSync(wouldLandAt), false, 'traversal target must never have been written');
    });
  });

  it('CR-065: refuses to overwrite a pre-existing file this session did not create', async () => {
    await withTempDir(async (dir) => {
      const preexisting = path.join(dir, 'not-mine.png');
      fs.writeFileSync(preexisting, 'not a screenshot');
      const { screenshot } = setupWithState(dir);
      await assert.rejects(() => screenshot(0, 'not-mine.png'), /refusing to overwrite/i);
      assert.equal(fs.readFileSync(preexisting, 'utf8'), 'not a screenshot', 'pre-existing content must be untouched');
    });
  });

  it('CR-065: a session MAY overwrite a file it wrote itself (e.g. a reused "latest.png")', async () => {
    await withTempDir(async (dir) => {
      const { screenshot } = setupWithState(dir);
      const first = await screenshot(0, 'latest.png');
      const second = await screenshot(0, 'latest.png');
      assert.equal(first, second);
      assert.ok(fs.existsSync(second));
    });
  });
});
