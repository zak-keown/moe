import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  PORT_RANGE_START,
  PORT_RANGE_END,
  buildChromeArgs,
  getXdgCacheHome,
  getChromeProfileDir,
  findPidOnPort,
  findOrphanChromeForProfile,
  isPortFree,
  portFreeFromProbes,
  sandboxDisableNeeded,
} = require('../../skills/browsing/lib/chrome-launcher-helpers.js');

describe('chrome-launcher-helpers', () => {
  it('PORT_RANGE_START is 9222 (backward compat)', () => {
    assert.equal(PORT_RANGE_START, 9222);
    assert.ok(PORT_RANGE_END > PORT_RANGE_START);
  });

  it('buildChromeArgs includes the chosen port', () => {
    const args = buildChromeArgs({
      chosenPort: 9333,
      chromeUserDataDir: '/tmp/profile',
      chromeHeadless: false
    });
    assert.ok(args.includes('--remote-debugging-port=9333'));
    assert.ok(args.includes('--user-data-dir=/tmp/profile'));
    assert.ok(!args.includes('--headless=new'));
  });

  it('buildChromeArgs adds --headless=new when chromeHeadless is true', () => {
    const args = buildChromeArgs({
      chosenPort: 9333,
      chromeUserDataDir: '/tmp/profile',
      chromeHeadless: true
    });
    assert.ok(args.includes('--headless=new'));
  });

  it('buildChromeArgs appends CHROME_EXTRA_ARGS tokens', () => {
    process.env.CHROME_EXTRA_ARGS = '--use-gl=angle --enable-foo';
    try {
      const args = buildChromeArgs({
        chosenPort: 9333,
        chromeUserDataDir: '/tmp/profile',
        chromeHeadless: false
      });
      assert.ok(args.includes('--use-gl=angle'));
      assert.ok(args.includes('--enable-foo'));
    } finally {
      delete process.env.CHROME_EXTRA_ARGS;
    }
  });

  it('sandboxDisableNeeded is true for root', () => {
    assert.equal(sandboxDisableNeeded({ uid: 0, dockerEnv: false, cgroup: null }), true);
  });

  it('sandboxDisableNeeded is true inside a container', () => {
    assert.equal(sandboxDisableNeeded({ uid: 501, dockerEnv: true, cgroup: null }), true);
    assert.equal(
      sandboxDisableNeeded({ uid: 501, dockerEnv: false, cgroup: '12:pids:/docker/abc123' }),
      true
    );
    assert.equal(
      sandboxDisableNeeded({ uid: 501, dockerEnv: false, cgroup: '1:name=systemd:/kubepods/pod9' }),
      true
    );
  });

  it('sandboxDisableNeeded is false for a normal user outside containers', () => {
    assert.equal(sandboxDisableNeeded({ uid: 501, dockerEnv: false, cgroup: null }), false);
    assert.equal(
      sandboxDisableNeeded({ uid: 501, dockerEnv: false, cgroup: '0::/init.scope' }),
      false
    );
  });

  it('buildChromeArgs keeps the sandbox unless noSandbox is needed', () => {
    const base = { chosenPort: 9333, chromeUserDataDir: '/tmp/profile', chromeHeadless: false };
    assert.ok(!buildChromeArgs({ ...base, noSandbox: false }).includes('--no-sandbox'),
      'sandbox stays on for normal users');
    assert.ok(buildChromeArgs({ ...base, noSandbox: true }).includes('--no-sandbox'),
      'sandbox disabled where it cannot work (root/container)');
    // Default follows environment detection.
    assert.equal(
      buildChromeArgs(base).includes('--no-sandbox'),
      sandboxDisableNeeded(),
      'default must follow sandboxDisableNeeded()'
    );
  });

  it('buildChromeArgs includes first-run suppression and automation flags', () => {
    const args = buildChromeArgs({
      chosenPort: 9333,
      chromeUserDataDir: '/tmp/profile',
      chromeHeadless: false
    });
    assert.ok(args.includes('--no-first-run'));
    assert.ok(args.includes('--no-default-browser-check'));
    assert.ok(args.includes('--disable-search-engine-choice-screen'));
    assert.ok(args.includes('--password-store=basic'));
    assert.ok(args.includes('--use-mock-keychain'));
    const disableFeatures = args.find(a => a.startsWith('--disable-features='));
    assert.ok(disableFeatures, '--disable-features flag must exist');
    assert.ok(disableFeatures.includes('Translate'), 'must disable Translate');
    assert.ok(disableFeatures.includes('OptimizationHints'), 'must disable OptimizationHints');
  });

  it('getXdgCacheHome returns a non-empty path', () => {
    const path = getXdgCacheHome();
    assert.equal(typeof path, 'string');
    assert.ok(path.length > 0);
  });

  it('getChromeProfileDir composes profile name into XDG path', () => {
    const dir = getChromeProfileDir('myprofile');
    assert.match(dir, /moe\/browser-profiles\/myprofile$/);
  });

  it('findPidOnPort returns null for an unbound port', async () => {
    const pid = await findPidOnPort(64999);
    assert.equal(pid, null);
  });

  it('findPidOnPort returns the current process PID for a port we bound', async () => {
    const net = await import('node:net');
    const server = net.default.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const pid = await findPidOnPort(port);
      assert.equal(typeof pid, 'number');
      assert.equal(pid, process.pid);
    } finally {
      server.close();
    }
  });

  it('findOrphanChromeForProfile returns null when no match', () => {
    const r = findOrphanChromeForProfile('definitely-nonexistent-profile-name-xyz');
    assert.equal(r, null);
  });

  // CR-056: profile names are auto-disambiguated by suffix (moe-glass,
  // moe-glass-2, moe-glass-3), so getChromeProfileDir('moe-glass') is a
  // literal string prefix of getChromeProfileDir('moe-glass-2'). A `ps` line
  // that carries the SIBLING profile's --user-data-dir must never be adopted
  // for the base profile.
  //
  // findOrphanChromeForProfile shells out to the real `ps auxw` with no
  // maxBuffer override, so on a machine with a large process table (this
  // dev box included: ps auxw exceeds the 1MB default) execSync throws and
  // the function silently returns null via its catch-all — masking the
  // defect for any test that spawns a real decoy and reads the real process
  // table. Stubbing child_process.execSync (it is destructured fresh inside
  // the function body on every call, so patching the shared module export
  // is picked up) gives a deterministic repro of the substring-match bug
  // itself, independent of the host's process table.
  it('findOrphanChromeForProfile does not adopt a sibling profile whose dir is a superstring of ours', () => {
    const cp = require('child_process');
    const baseProfile = 'cr056-orphan-base';
    const siblingDir = getChromeProfileDir('cr056-orphan-base-2'); // superstring of the base profile's dir

    const fakePsOutput = [
      'USER               PID  %CPU %MEM      VSZ    RSS   TT  STAT STARTED      TIME COMMAND',
      `zakkeown         55555   0.0  0.1        0      0   ??  S    10:00AM   0:00.01 ` +
        `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome ` +
        `--remote-debugging-port=19999 --user-data-dir=${siblingDir}`,
    ].join('\n');

    const originalExecSync = cp.execSync;
    cp.execSync = () => fakePsOutput;
    try {
      const r = findOrphanChromeForProfile(baseProfile);
      assert.equal(r, null, `must not adopt the sibling profile's Chrome, got ${JSON.stringify(r)}`);
    } finally {
      cp.execSync = originalExecSync;
    }
  });

  // portFreeFromProbes: the pure decision over the IPv4 + IPv6 loopback bind
  // probes. The dual-stack check is a race-guard for hosts where Chrome may bind
  // ::1 only — but an UNAVAILABLE IPv6 loopback (e.g. a container with
  // net.ipv6.conf.lo.disable_ipv6=1) must not be mistaken for a port conflict.
  describe('portFreeFromProbes', () => {
    it('free when both IPv4 and IPv6 loopback are free', () => {
      assert.equal(portFreeFromProbes({ free: true }, { free: true }), true);
    });

    it('not free when IPv4 loopback is occupied', () => {
      assert.equal(portFreeFromProbes({ free: false, code: 'EADDRINUSE' }, { free: true }), false);
    });

    it('not free when IPv6 loopback is genuinely in use (race-guard preserved)', () => {
      assert.equal(
        portFreeFromProbes({ free: true }, { free: false, code: 'EADDRINUSE' }),
        false,
      );
    });

    it('FREE when IPv6 loopback is unavailable (EADDRNOTAVAIL) — not a port conflict', () => {
      // The bug: a container with IPv6 loopback disabled returns EADDRNOTAVAIL on
      // every ::1 bind, which made every port look occupied and Chrome never launch.
      assert.equal(
        portFreeFromProbes({ free: true }, { free: false, code: 'EADDRNOTAVAIL' }),
        true,
      );
    });

    it('FREE when the IPv6 address family is unsupported (EAFNOSUPPORT)', () => {
      assert.equal(
        portFreeFromProbes({ free: true }, { free: false, code: 'EAFNOSUPPORT' }),
        true,
      );
    });
  });

  it('isPortFree returns true for a free port and false for an occupied one (real binds)', async () => {
    const net = await import('node:net');
    // A high port we expect free.
    const probe = net.default.createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address();
    probe.close();
    await new Promise((resolve) => probe.once('close', resolve));
    assert.equal(await isPortFree(port), true);

    // Now occupy it on IPv4 loopback and re-probe.
    const holder = net.default.createServer();
    await new Promise((resolve) => holder.listen(port, '127.0.0.1', resolve));
    try {
      assert.equal(await isPortFree(port), false);
    } finally {
      holder.close();
    }
  });
});
