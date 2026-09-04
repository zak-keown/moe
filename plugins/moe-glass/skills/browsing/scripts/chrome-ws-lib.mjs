import { getElementSelector } from './lib/element-selector.mjs';
import { KEY_DEFINITIONS } from './lib/key-definitions.mjs';
import { generateHtmlDiff } from './lib/html-diff.mjs';
import { createState } from './lib/session-state.mjs';
import { attachCookies } from './lib/cookies.mjs';
import { attachViewport } from './lib/viewport.mjs';
import { attachEvaluation } from './lib/evaluation.mjs';
import { attachMouse } from './lib/mouse.mjs';
import { attachChromeProcess } from './lib/chrome-process.mjs';
import { attachCapture } from './lib/capture.mjs';
import { attachNavigation } from './lib/navigation.mjs';
import { attachKeyboardInput } from './lib/keyboard-input.mjs';
import { attachExtraction } from './lib/extraction.mjs';
import { attachScreenshot } from './lib/screenshot.mjs';
import { attachTabs, createPageSessionResolver } from './lib/tabs.mjs';
import { createBrowserSession } from './lib/browser-session.mjs';
import { attachBrowserBridge } from './lib/browser-bridge.mjs';
import { attachFileUpload } from './lib/file-upload.mjs';
import { attachConsoleLogging } from './lib/console-logging.mjs';
import { attachSelectOption } from './lib/select-option.mjs';
import { attachDialogs, DialogRefusedError } from './lib/dialogs.mjs';
import { renderSyntheticArtifacts } from './lib/dialogs-render.mjs';
import {
  getXdgCacheHome,
  getChromeProfileDir,
  getProfileMetaPath,
  readProfileMeta,
  writeProfileMeta,
  clearProfileMeta,
  findAvailablePort,
  buildChromeArgs,
} from './lib/chrome-launcher-helpers.mjs';

const PAGE_TARGET_SESSION_METHODS = new Set([
  'navigate',
  'back',
  'forward',
  'click',
  'fill',
  'selectOption',
  'evaluate',
  'extractText',
  'getHtml',
  'getAttribute',
  'waitForElement',
  'waitForText',
  'screenshot',
  'hover',
  'drag',
  'mouseMove',
  'scroll',
  'doubleClick',
  'rightClick',
  'humanType',
  'fileUpload',
  'keyboardPress',
  'clickWithCapture',
  'fillWithCapture',
  'selectOptionWithCapture',
  'evaluateWithCapture',
  'setViewport',
  'clearViewport',
  'getViewport',
]);

function createSession({ host, port, _testFakes } = {}) {
  const state = createState({ host, port });

  const dialogs = attachDialogs({ state });

  const { chromeHttp, resolveWsUrl, getTabs, newTab, closeTab } = attachTabs({ state });

  const effectiveChromeHttp = (_testFakes && _testFakes.chromeHttp) ? _testFakes.chromeHttp : chromeHttp;
  const browserSessionFactory = () => createBrowserSession({
    host: state.hostOverride.getHost(),
    port: state.hostOverride.getPort(),
    rewriteWsUrl: state.rewriteWsUrl,
    chromeHttp: effectiveChromeHttp,
    WebSocketClient: _testFakes && _testFakes.WebSocketClient,
  });
  state.browserSession = browserSessionFactory();

  let bridgePromise = null;

  state.resetBridge = () => {
    if (state.pageSessionResolver) {
      state.pageSessionResolver.releaseAll();
    }
    state.pageSessionResolver = null;
    state.browserBridge = null;
    state.browserSession = browserSessionFactory();
    bridgePromise = null;
  };

  state.ensureBridge = () => {
    if (state.browserSession && !state.browserSession.isConnected()) {
      state.resetBridge();
    }
    if (state.browserBridge) return Promise.resolve(state.browserBridge);
    if (bridgePromise) return bridgePromise;
    bridgePromise = (async () => {
      const bridge = await attachBrowserBridge({
        browser: state.browserSession,
        host: state.hostOverride.getHost(),
        port: state.hostOverride.getPort(),
        rewriteWsUrl: state.rewriteWsUrl,
        autoAttach: true,
        onPageSession: async (ps) => {
          try {
            await dialogs.attachToPageSession(ps);
          } catch (e) {
            console.error('onPageSession dialog attach failed:', e);
          }
          if (state.pageSessionResolver && ps.targetId) {
            state.pageSessionResolver.prime(ps.targetId, ps);
          }
        },
      });
      state.browserBridge = bridge;
      state.pageSessionResolver = createPageSessionResolver({ bridge });
      return bridge;
    })();
    bridgePromise.catch(() => { bridgePromise = null; });
    return bridgePromise;
  };

  async function getPageSession(tabIndexOrWsUrl) {
    await state.ensureBridge();
    let tab;
    if (typeof tabIndexOrWsUrl === 'number') {
      const tabs = await getTabs();
      tab = tabs[tabIndexOrWsUrl];
      if (!tab) throw new Error(`No tab at index ${tabIndexOrWsUrl}`);
    } else if (typeof tabIndexOrWsUrl === 'string') {
      const m = /\/devtools\/page\/([^/]+)$/.exec(tabIndexOrWsUrl);
      if (!m) throw new Error(`Cannot extract targetId from: ${tabIndexOrWsUrl}`);
      tab = { id: m[1] };
    } else if (tabIndexOrWsUrl && tabIndexOrWsUrl.id) {
      tab = tabIndexOrWsUrl;
    } else {
      throw new Error('Unrecognized tabIndexOrWsUrl');
    }
    const ps = await state.pageSessionResolver(tab);
    await dialogs.attachToPageSession(ps);
    return ps;
  }

  const { click, hover, drag, mouseMove, scroll, doubleClick, rightClick } =
    attachMouse({ getPageSession, dialogs });

  const { keyboardPress, fill, humanType } =
    attachKeyboardInput({ state, getPageSession, click, dialogs });

  const { fileUpload } = attachFileUpload({ getPageSession });

  const { selectOption } = attachSelectOption({ getPageSession });

  const { evaluate } = attachEvaluation({ getPageSession });

  const { extractText, getHtml, getAttribute } = attachExtraction({ getPageSession });

  const screenshotDirRef = { initializeSession: null };

  const { screenshot } = attachScreenshot({
    getPageSession,
    state,
    initializeSession: () => {
      if (screenshotDirRef.initializeSession) return screenshotDirRef.initializeSession();
      if (state.sessionDir) return state.sessionDir;
      throw new Error('Session directory not yet initialized. Call an auto-capture action first.');
    },
  });

  const { startChrome, killChrome, showBrowser, hideBrowser, getBrowserMode, getChromePid, getActivePort, getProfileName, setProfileName } =
    attachChromeProcess({ state, chromeHttp, getTabs, newTab });

  const { enableConsoleLogging, getConsoleMessages, clearConsoleMessages } =
    attachConsoleLogging({ state, getPageSession });

  const {
    initializeSession,
    cleanupSession,
    createCapturePrefix,
    generateDomSummary,
    getPageSize,
    generateMarkdown,
    capturePageArtifacts,
    captureActionWithDiff,
    clickWithCapture,
    fillWithCapture,
    selectOptionWithCapture,
    evaluateWithCapture,
  } = attachCapture({
    state,
    getPageSession,
    getHtml,
    screenshot,
    actions: { click, fill, selectOption, evaluate },
    dialogs,
  });

  screenshotDirRef.initializeSession = initializeSession;

  const { navigate, waitForElement, waitForText, back, forward } =
    attachNavigation({ state, getPageSession, capturePageArtifacts, evaluate });

  const { setViewport, clearViewport, getViewport } = attachViewport({ getPageSession });
  const { clearCookies } = attachCookies({ getPageSession });

  function wrapWithDialogGate(_name, fn) {
    return async function dialogGated(tabIndexOrWsUrl, secondArg, ...rest) {
      let wsUrl;
      try {
        wsUrl = await resolveWsUrl(tabIndexOrWsUrl);
      } catch {
        return fn(tabIndexOrWsUrl, secondArg, ...rest);
      }

      const open = dialogs.getOpen(wsUrl);
      const isDialogSelector = typeof secondArg === 'string' && secondArg.startsWith('dialog::');

      if (open && !isDialogSelector) {
        throw new DialogRefusedError({ dialog: open, artifacts: renderSyntheticArtifacts(open) });
      }

      return fn(tabIndexOrWsUrl, secondArg, ...rest);
    };
  }

  const rawSession = {
    state,
    getElementSelector,
    getTabs,
    newTab,
    closeTab,
    navigate,
    click,
    fill,
    selectOption,
    evaluate,
    extractText,
    getHtml,
    getAttribute,
    waitForElement,
    waitForText,
    back,
    forward,
    screenshot,
    hover,
    drag,
    mouseMove,
    scroll,
    doubleClick,
    rightClick,
    humanType,
    fileUpload,
    keyboardPress,
    KEY_DEFINITIONS,
    startChrome,
    buildChromeArgs,
    killChrome,
    showBrowser,
    hideBrowser,
    getBrowserMode,
    getChromePid,
    getChromeProfileDir,
    getProfileName,
    setProfileName,
    enableConsoleLogging,
    getConsoleMessages,
    clearConsoleMessages,
    getXdgCacheHome,
    initializeSession,
    cleanupSession,
    createCapturePrefix,
    generateDomSummary,
    getPageSize,
    generateMarkdown,
    capturePageArtifacts,
    clickWithCapture,
    fillWithCapture,
    selectOptionWithCapture,
    evaluateWithCapture,
    generateHtmlDiff,
    captureActionWithDiff,
    getActivePort,
    findAvailablePort,
    getProfileMetaPath,
    readProfileMeta,
    writeProfileMeta,
    clearProfileMeta,
    setViewport,
    clearViewport,
    getViewport,
    clearCookies,
    dialogs,
  };

  for (const name of PAGE_TARGET_SESSION_METHODS) {
    if (typeof rawSession[name] === 'function') {
      rawSession[name] = wrapWithDialogGate(name, rawSession[name]);
    }
  }

  return rawSession;
}

export { createSession, PAGE_TARGET_SESSION_METHODS, DialogRefusedError };
