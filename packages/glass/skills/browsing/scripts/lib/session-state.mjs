import { createOverride } from '../host-override.mjs';

function createState({ host, port } = {}) {
  const hostOverride = createOverride({ host, port });

  const envProfile = process.env.CHROME_WS_PROFILE;
  const profileFromEnv = envProfile && /^[a-zA-Z0-9_-]+$/.test(envProfile)
    ? envProfile
    : null;

  return {
    hostOverride,
    rewriteWsUrl: hostOverride.rewriteWsUrl,

    activePort: hostOverride.getPort(),

    consoleMessages: new Map(),

    sessionDir: null,
    captureCounter: 0,

    chromeProcess: null,
    chromeHeadless: true,
    chromeUserDataDir: null,
    chromeProfileName: profileFromEnv || 'moe-glass',
    _profileExplicit: profileFromEnv !== null,

    browserBridge: null,
    browserSession: null,

    activeTab: 0,
  };
}

export { createState };
