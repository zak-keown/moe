import { getElementSelector } from './element-selector.mjs';
import { DialogRefusedError } from './dialogs.mjs';
import { renderSyntheticArtifacts } from './dialogs-render.mjs';

const NAVIGATE_TIMEOUT_MS = 30000;
const CONSOLE_LINGER_MS = 1000;

function attachNavigation({ state, getPageSession, capturePageArtifacts, evaluate }) {
  async function navigate(tabIndexOrWsUrl, url, autoCapture = false) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const sid = ps.sessionId;

    state.consoleMessages.set(sid, []);

    await ps.enableDomain('Page');
    if (autoCapture) {
      await ps.enableDomain('Runtime');
    }

    const unsubConsole = () => {};

    let frameNavigated = false;
    const unsubFrameNav = ps.onEvent((msg) => {
      if (msg.method === 'Page.frameNavigated') {
        const frame = msg.params && msg.params.frame;
        if (frame && !frame.parentId) {
          frameNavigated = true;
        }
      }
    });

    let loadTimeout, unsubLoad;
    const loadPromise = new Promise((resolve, reject) => {
      loadTimeout = setTimeout(() => {
        unsubLoad();
        reject(new Error(`navigate timeout: ${url} did not fire Page.loadEventFired within ${NAVIGATE_TIMEOUT_MS}ms`));
      }, NAVIGATE_TIMEOUT_MS);
      unsubLoad = ps.onEvent((msg) => {
        if (msg.method === 'Page.loadEventFired' && frameNavigated) {
          clearTimeout(loadTimeout);
          unsubLoad();
          resolve(msg);
        }
      });
    });

    loadPromise.catch(() => {});

    const sawDialogBefore = state.dialogs && state.dialogs.has(sid);
    let unsubDialog;
    const dialogPromise = new Promise((resolve) => {
      unsubDialog = ps.onEvent(() => {
        const open = state.dialogs && state.dialogs.get(sid);
        if (open && !sawDialogBefore) {
          unsubDialog();
          resolve(open);
        }
      });
    });

    let navigateResult;
    let dialogWon = null;
    try {
      const navigatePromise = ps.send('Page.navigate', { url });
      navigatePromise.catch(() => {});

      const outcome = await Promise.race([
        navigatePromise.then((r) => ({ kind: 'send-resolved', r })),
        navigatePromise.catch((e) => ({ kind: 'send-rejected', e })),
        loadPromise.then(() => ({ kind: 'load' })),
        dialogPromise.then((d) => ({ kind: 'dialog', d })),
      ]);

      if (outcome.kind === 'send-rejected') {
        clearTimeout(loadTimeout);
        if (unsubLoad) unsubLoad();
        if (unsubDialog) unsubDialog();
        unsubConsole();
        unsubFrameNav();
        throw outcome.e;
      }

      if (outcome.kind === 'dialog') {
        dialogWon = outcome.d;
      } else {
        navigateResult = (outcome.kind === 'send-resolved') ? outcome.r : await navigatePromise;
      }
    } catch (err) {
      clearTimeout(loadTimeout);
      if (unsubLoad) unsubLoad();
      if (unsubDialog) unsubDialog();
      unsubConsole();
      unsubFrameNav();
      throw err;
    }

    if (dialogWon) {
      clearTimeout(loadTimeout);
      if (unsubLoad) unsubLoad();
      if (unsubDialog) unsubDialog();
      unsubConsole();
      unsubFrameNav();
      throw new DialogRefusedError({
        dialog: dialogWon,
        artifacts: renderSyntheticArtifacts(dialogWon),
      });
    }

    if (unsubDialog) unsubDialog();

    if (navigateResult && navigateResult.errorText) {
      clearTimeout(loadTimeout);
      if (unsubLoad) unsubLoad();
      unsubConsole();
      unsubFrameNav();
      throw new Error(`Navigate failed: ${navigateResult.errorText} (${url})`);
    }

    try {
      await loadPromise;
    } catch (err) {
      unsubConsole();
      unsubFrameNav();
      throw err;
    }

    if (autoCapture) {
      await new Promise(r => setTimeout(r, CONSOLE_LINGER_MS));
    }

    unsubConsole();
    unsubFrameNav();

    if (autoCapture) {
      try {
        const artifacts = await capturePageArtifacts(tabIndexOrWsUrl, 'navigate');
        const consoleLog = [];

        return {
          frameId: navigateResult?.frameId,
          url,
          pageSize: artifacts.pageSize,
          capturePrefix: artifacts.capturePrefix,
          sessionDir: artifacts.sessionDir,
          files: artifacts.files,
          domSummary: artifacts.domSummary,
          consoleLog
        };
      } catch (error) {
        return {
          frameId: navigateResult?.frameId,
          url,
          error: `Auto-capture failed: ${error.message}`
        };
      }
    }

    return navigateResult?.frameId;
  }

  async function waitForElement(tabIndexOrWsUrl, selector, timeout = 5000) {
    const js = `
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('waitForElement timeout: ' + ${JSON.stringify(selector)})), ${timeout});
        const check = () => {
          if (${getElementSelector(selector)}) {
            clearTimeout(t);
            resolve(true);
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      })
    `;
    await evaluate(tabIndexOrWsUrl, js);
  }

  async function waitForText(tabIndexOrWsUrl, text, timeout = 5000) {
    const js = `
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('waitForText timeout: ' + ${JSON.stringify(text)})), ${timeout});
        const check = () => {
          if (document.body.textContent.includes(${JSON.stringify(text)})) {
            clearTimeout(t);
            resolve(true);
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      })
    `;
    await evaluate(tabIndexOrWsUrl, js);
  }

  async function back(tabIndexOrWsUrl) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    await ps.send('Runtime.evaluate', { expression: 'history.back()' });
  }

  async function forward(tabIndexOrWsUrl) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    await ps.send('Runtime.evaluate', { expression: 'history.forward()' });
  }

  return { navigate, waitForElement, waitForText, back, forward };
}

export { attachNavigation };
