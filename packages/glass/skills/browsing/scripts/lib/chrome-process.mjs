import {
  readProfileMeta,
  writeProfileMeta,
  clearProfileMeta,
  isPortAlive,
  findAvailablePort,
  findPidOnPort,
  findOrphanChromeForProfile,
  buildChromeArgs,
  getChromeProfileDir,
} from './chrome-launcher-helpers.mjs';
import * as profileLock from './profile-lock.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';

function attachChromeProcess({ state, chromeHttp, getTabs, newTab }) {
  const CHROME_DEBUG_HOST = state.hostOverride.getHost();
  const CHROME_DEBUG_PORT = state.hostOverride.getPort();

  function ensureProfileLock() {
    if (state._profileLockPath) return;

    if (state._profileExplicit) {
      const lockPath = profileLock.acquire(state.chromeProfileName);
      if (lockPath) state._profileLockPath = lockPath;
      return;
    }

    const { profileName, lockPath, slot } =
      profileLock.acquireWithFallback(state.chromeProfileName);
    if (slot > 1) {
      console.error(
        `Another MCP holds profile '${state.chromeProfileName}'; ` +
        `using '${profileName}' instead. Set CHROME_WS_PROFILE to opt out of auto-disambiguation.`
      );
      state.chromeProfileName = profileName;
      state.chromeUserDataDir = null;
    }
    state._profileLockPath = lockPath;
  }

  if (!state._profileLockExitHandlerRegistered) {
    state._profileLockExitHandlerRegistered = true;
    const releaseOnce = () => {
      if (state._profileLockPath) {
        profileLock.release(state._profileLockPath);
        state._profileLockPath = null;
      }
    };
    process.on('exit', releaseOnce);
    process.on('SIGINT', () => { releaseOnce(); process.exit(130); });
    process.on('SIGTERM', () => { releaseOnce(); process.exit(143); });
  }

  async function startChrome(headless = null, profileName = null, port = null) {
    if (headless !== null) {
      state.chromeHeadless = headless;
    }
    if (profileName !== null) {
      state.chromeProfileName = profileName;
      state._profileExplicit = true;
    }

    ensureProfileLock();

    if (!port) {
      const meta = readProfileMeta(state.chromeProfileName);
      if (meta && meta.port) {
        if (await isPortAlive(CHROME_DEBUG_HOST, meta.port, meta.pid)) {
          state.activePort = meta.port;
          console.error(`Reconnected to existing Chrome (port: ${meta.port}, PID: ${meta.pid}, profile: ${state.chromeProfileName})`);
          return false;
        }
        clearProfileMeta(state.chromeProfileName);
      }

      const orphanInfo = await Promise.resolve().then(() => findOrphanChromeForProfile(state.chromeProfileName));
      if (orphanInfo && await isPortAlive(CHROME_DEBUG_HOST, orphanInfo.port, orphanInfo.pid)) {
        state.activePort = orphanInfo.port;
        writeProfileMeta(state.chromeProfileName, { port: orphanInfo.port, pid: orphanInfo.pid });
        console.error(`Adopted orphan Chrome (port: ${orphanInfo.port}, PID: ${orphanInfo.pid}, profile: ${state.chromeProfileName})`);
        return false;
      }
    }

    const HAS_ENV_PORT = process.env.CHROME_WS_PORT !== undefined;
    let chosenPort;
    if (port) {
      chosenPort = port;
    } else if (HAS_ENV_PORT) {
      chosenPort = CHROME_DEBUG_PORT;
    } else {
      chosenPort = await findAvailablePort();
    }

    const chromePaths = {
      darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      ],
      linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
      ],
      win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
      ]
    };

    const platform = os.platform();
    const paths = chromePaths[platform] || [];

    let chromePath = process.env.CHROME_WS_BROWSER;
    if (chromePath && !existsSync(chromePath)) {
      console.error(`CHROME_WS_BROWSER is set to ${chromePath} but no file exists there; falling back to auto-detection`);
      chromePath = null;
    }
    if (!chromePath) {
      for (const p of paths) {
        if (existsSync(p)) {
          chromePath = p;
          break;
        }
      }
    }

    if (!chromePath) {
      const overrideNote = process.env.CHROME_WS_BROWSER
        ? ` (CHROME_WS_BROWSER=${process.env.CHROME_WS_BROWSER} does not exist)`
        : '';
      throw new Error(`Chrome not found. Searched: ${paths.join(', ')}${overrideNote}`);
    }

    if (!state.chromeUserDataDir) {
      state.chromeUserDataDir = getChromeProfileDir(state.chromeProfileName);
      mkdirSync(state.chromeUserDataDir, { recursive: true });
    }

    const args = buildChromeArgs({
      chosenPort,
      chromeUserDataDir: state.chromeUserDataDir,
      chromeHeadless: state.chromeHeadless,
    });

    const proc = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore'
    });

    proc.unref();
    state.chromeProcess = proc;
    state.activePort = chosenPort;

    proc.on('exit', () => {
      if (state.chromeProcess === proc) {
        state.chromeProcess = null;
      }
    });

    let spawnError = null;
    proc.on('error', (err) => {
      spawnError = err;
      if (state.chromeProcess === proc) {
        state.chromeProcess = null;
      }
    });

    const POLL_INTERVAL_MS = 200;
    const POLL_TIMEOUT_MS = 15000;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (spawnError) {
        throw new Error(`Failed to launch Chrome (${chromePath}): ${spawnError.message}`);
      }
      if (await isPortAlive(CHROME_DEBUG_HOST, chosenPort, proc.pid)) break;
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    if (spawnError) {
      throw new Error(`Failed to launch Chrome (${chromePath}): ${spawnError.message}`);
    }
    if (!(await isPortAlive(CHROME_DEBUG_HOST, chosenPort, proc.pid))) {
      state.chromeProcess = null;
      throw new Error(`Chrome did not become ready on port ${chosenPort} within ${POLL_TIMEOUT_MS}ms`);
    }

    writeProfileMeta(state.chromeProfileName, {
      port: chosenPort,
      pid: proc.pid,
      headless: state.chromeHeadless,
      profileName: state.chromeProfileName,
      userDataDir: state.chromeUserDataDir,
      startedAt: new Date().toISOString()
    });

    const mode = state.chromeHeadless ? 'headless' : 'headed';
    console.error(`Chrome started in ${mode} mode (PID: ${proc.pid}, port: ${chosenPort}, profile: ${state.chromeProfileName})`);
    return true;
  }

  async function closeBridge() {
    if (!state.browserSession) return;
    await Promise.race([
      Promise.resolve().then(() => state.browserSession.close()).catch(() => {}),
      new Promise((r) => setTimeout(r, 500)),
    ]);
  }

  async function killChrome() {
    await closeBridge();
    let pidToKill = null;

    if (state.chromeProcess && state.chromeProcess.pid) {
      pidToKill = state.chromeProcess.pid;
    } else if (state.activePort) {
      pidToKill = findPidOnPort(state.activePort);
    }

    if (pidToKill === null) {
      clearProfileMeta(state.chromeProfileName);
      state.chromeProcess = null;
      state.activePort = CHROME_DEBUG_PORT;
      state.resetBridge?.();
      return;
    }

    try {
      try {
        await chromeHttp('/json/close', 'GET');
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (_e) {
        // Chrome might already be dead.
      }

      try {
        process.kill(pidToKill, 'SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (_e) {
        // Process might already be dead.
      }
    } catch (e) {
      console.error(`Error killing Chrome: ${e.message}`);
    }

    clearProfileMeta(state.chromeProfileName);
    state.chromeProcess = null;
    state.activePort = CHROME_DEBUG_PORT;
    state.resetBridge?.();
  }

  async function restartInMode({ targetHeadless, alreadyMessage, doneMessage }) {
    if (state.chromeHeadless === targetHeadless) {
      const chromeAlive = state.activePort
        ? await isPortAlive(CHROME_DEBUG_HOST, state.activePort)
        : false;
      if (chromeAlive) {
        return alreadyMessage;
      }
    }

    const transition = targetHeadless ? 'headless mode (hiding browser window)' : 'headed mode (browser window will be visible)';
    console.error(`Switching to ${transition}...`);
    console.error('WARNING: This will restart Chrome and lose any POST-based page state');

    let currentTabs = [];
    try {
      const tabs = await getTabs();
      currentTabs = tabs.map(t => t.url).filter(url => url && url !== 'about:blank');
    } catch (_e) {
      // Chrome not running
    }

    await killChrome();
    await startChrome(targetHeadless, null, null);

    if (currentTabs.length > 0) {
      console.error(`Reopening ${currentTabs.length} tab(s)...`);
      for (const url of currentTabs) {
        try {
          await newTab(url);
        } catch (e) {
          console.error(`Failed to reopen ${url}: ${e.message}`);
        }
      }
    }

    return doneMessage;
  }

  async function showBrowser() {
    return restartInMode({
      targetHeadless: false,
      alreadyMessage: 'Browser is already visible',
      doneMessage: 'Browser window is now visible. Note: Pages were reloaded via GET requests.',
    });
  }

  async function hideBrowser() {
    return restartInMode({
      targetHeadless: true,
      alreadyMessage: 'Browser is already in headless mode',
      doneMessage: 'Browser is now in headless mode. Note: Pages were reloaded via GET requests.',
    });
  }

  async function getBrowserMode() {
    let running, pid;
    if (state.chromeProcess) {
      running = true;
      pid = state.chromeProcess.pid;
    } else {
      const meta = readProfileMeta(state.chromeProfileName);
      pid = (meta && meta.pid) ? meta.pid : (state.activePort ? findPidOnPort(state.activePort) : null);
      running = state.activePort
        ? await isPortAlive(CHROME_DEBUG_HOST, state.activePort, pid)
        : false;
      if (!running) pid = null;
    }

    const profileDir = state.chromeUserDataDir ?? getChromeProfileDir(state.chromeProfileName);
    return {
      headless: state.chromeHeadless,
      mode: state.chromeHeadless ? 'headless' : 'headed',
      running,
      pid,
      port: state.activePort,
      profile: state.chromeProfileName,
      profileDir,
    };
  }

  function getChromePid() {
    return state.chromeProcess ? state.chromeProcess.pid : null;
  }

  function getActivePort() {
    return state.activePort;
  }

  function getProfileName() {
    return state.chromeProfileName;
  }

  function setProfileName(profileName) {
    if (!/^[a-zA-Z0-9_-]+$/.test(profileName)) {
      throw new Error('Invalid profile name. Only alphanumeric characters, hyphens, and underscores are allowed.');
    }
    if (state.chromeProcess) {
      throw new Error('Cannot change profile while Chrome is running. Kill Chrome first.');
    }
    if (state._profileLockPath) {
      profileLock.release(state._profileLockPath);
      state._profileLockPath = null;
    }
    state._profileExplicit = true;
    state.chromeProfileName = profileName;
    state.chromeUserDataDir = null;
    state.activePort = CHROME_DEBUG_PORT;
    return `Profile set to: ${profileName}`;
  }

  return {
    startChrome,
    killChrome,
    showBrowser,
    hideBrowser,
    getBrowserMode,
    getChromePid,
    getActivePort,
    getProfileName,
    setProfileName,
  };
}

export { attachChromeProcess };
