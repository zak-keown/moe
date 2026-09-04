import fs from 'node:fs';
import path from 'node:path';
import { getXdgCacheHome } from './chrome-launcher-helpers.mjs';
import { generateHtmlDiff } from './html-diff.mjs';
import { throwIfExceptionDetails } from './cdp-utils.mjs';
import markdownScript from './page-scripts/markdown.mjs';
import domSummaryScript from './page-scripts/dom-summary.mjs';
import { renderSyntheticArtifacts } from './dialogs-render.mjs';

const activeCleanups = new Set();
let processHandlersRegistered = false;

function ensureProcessHandlersRegistered() {
  if (processHandlersRegistered) return;
  processHandlersRegistered = true;
  const runAll = () => { for (const fn of activeCleanups) fn(); };
  process.on('exit', runAll);
  process.on('SIGINT', () => { runAll(); process.exit(0); });
  process.on('SIGTERM', () => { runAll(); process.exit(0); });
}

function attachCapture({ state, getPageSession, getHtml, screenshot, actions, dialogs }) {
  function initializeSession() {
    if (!state.sessionDir) {
      const cacheHome = getXdgCacheHome();
      const dateStr = new Date().toISOString().split('T')[0];
      const sessionId = `session-${Date.now()}`;

      state.sessionDir = path.join(cacheHome, 'moe', 'browser', dateStr, sessionId);
      fs.mkdirSync(state.sessionDir, { recursive: true });
      state.captureCounter = 0;

      console.error(`Browser session directory: ${state.sessionDir}`);

      ensureProcessHandlersRegistered();
      activeCleanups.add(cleanupSession);
    }
    return state.sessionDir;
  }

  function cleanupSession() {
    if (state.sessionDir) {
      try {
        fs.rmSync(state.sessionDir, { recursive: true, force: true });
        console.error(`Cleaned up session directory: ${state.sessionDir}`);
      } catch (error) {
        console.error(`Failed to cleanup session directory: ${error.message}`);
      }
      state.sessionDir = null;
    }
    activeCleanups.delete(cleanupSession);
  }

  function createCapturePrefix(actionType = 'navigate') {
    initializeSession();
    state.captureCounter++;
    return `${String(state.captureCounter).padStart(3, '0')}-${actionType}`;
  }

  async function generateDomSummary(tabIndexOrWsUrl) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const result = await ps.send('Runtime.evaluate', {
      expression: domSummaryScript,
      returnByValue: true
    });
    throwIfExceptionDetails(result);
    return result.result.value;
  }

  async function getPageSize(tabIndexOrWsUrl) {
    const ps = await getPageSession(tabIndexOrWsUrl);

    const js = `({
      width: window.innerWidth,
      height: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight
    })`;

    const result = await ps.send('Runtime.evaluate', {
      expression: js,
      returnByValue: true
    });
    throwIfExceptionDetails(result);
    return result.result.value;
  }

  async function generateMarkdown(tabIndexOrWsUrl) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const result = await ps.send('Runtime.evaluate', {
      expression: markdownScript,
      returnByValue: true
    });
    throwIfExceptionDetails(result);
    return result.result.value;
  }

  function writeIfDir(dir, filename, content) {
    if (!dir) return;
    try {
      fs.writeFileSync(path.join(dir, filename), content);
    } catch (_err) {
      // Best-effort
    }
  }

  async function capturePageArtifacts(tabIndexOrWsUrl, actionType = 'navigate') {
    const ps = await getPageSession(tabIndexOrWsUrl);

    if (dialogs) {
      const open = dialogs.getOpen(ps.sessionId);
      if (open) {
        const artifacts = renderSyntheticArtifacts(open);
        const prefix = createCapturePrefix(actionType);
        const dir = state.sessionDir;
        writeIfDir(dir, `${prefix}.md`, artifacts.markdown);
        writeIfDir(dir, `${prefix}.html`, artifacts.html);
        writeIfDir(dir, `${prefix}-console.txt`, artifacts.consoleSnapshot);
        return {
          capturePrefix: prefix,
          sessionDir: dir,
          files: {
            html: dir ? path.join(dir, `${prefix}.html`) : null,
            markdown: dir ? path.join(dir, `${prefix}.md`) : null,
            screenshot: null,
            consoleLog: dir ? path.join(dir, `${prefix}-console.txt`) : null,
          },
          markdown: artifacts.markdown,
          html: artifacts.html,
          consoleSnapshot: artifacts.consoleSnapshot,
          png: undefined,
          dialog: open,
        };
      }
    }

    const prefix = createCapturePrefix(actionType);
    const dir = initializeSession();

    const [html, markdown, pageSize, domSummary] = await Promise.all([
      getHtml(tabIndexOrWsUrl),
      generateMarkdown(tabIndexOrWsUrl),
      getPageSize(tabIndexOrWsUrl),
      generateDomSummary(tabIndexOrWsUrl)
    ]);

    const htmlPath = path.join(dir, `${prefix}.html`);
    const markdownPath = path.join(dir, `${prefix}.md`);
    const screenshotPath = path.join(dir, `${prefix}.png`);
    const consoleLogPath = path.join(dir, `${prefix}-console.txt`);

    fs.writeFileSync(htmlPath, html || '');
    fs.writeFileSync(markdownPath, markdown || '');
    fs.writeFileSync(consoleLogPath, '# Console Log\n# TODO: Console logging not yet implemented\n');

    await screenshot(tabIndexOrWsUrl, screenshotPath);

    return {
      capturePrefix: prefix,
      sessionDir: dir,
      files: {
        html: htmlPath,
        markdown: markdownPath,
        screenshot: screenshotPath,
        consoleLog: consoleLogPath
      },
      pageSize,
      domSummary
    };
  }

  async function captureActionWithDiff(tabIndexOrWsUrl, actionType, actionFn, settleTime = 3000) {
    const ps = await getPageSession(tabIndexOrWsUrl);

    const pinnedTab = { id: ps.targetId };

    if (dialogs && dialogs.getOpen(ps.sessionId)) {
      return { actionResult: await actionFn() };
    }

    const prefix = createCapturePrefix(actionType);
    const dir = initializeSession();

    async function saveFocus() {
      const result = await ps.send('Runtime.evaluate', {
        expression: `
          (() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            if (el.id) return { type: 'id', value: el.id };
            if (el.name) return { type: 'name', value: el.name, tag: el.tagName.toLowerCase() };
            const focusPath = [];
            let current = el;
            while (current && current !== document.body) {
              const parent = current.parentElement;
              if (!parent) break;
              const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
              const index = siblings.indexOf(current);
              focusPath.unshift({ tag: current.tagName.toLowerCase(), index });
              current = parent;
            }
            return { type: 'path', value: focusPath };
          })()
        `,
        returnByValue: true
      });
      throwIfExceptionDetails(result);
      return result.result?.value;
    }

    async function restoreFocus(focusInfo) {
      if (!focusInfo) return;
      let selector;
      if (focusInfo.type === 'id') {
        selector = `document.getElementById(${JSON.stringify(focusInfo.value)})`;
      } else if (focusInfo.type === 'name') {
        selector = `document.querySelector(${JSON.stringify(focusInfo.tag + '[name="' + focusInfo.value + '"]')})`;
      } else if (focusInfo.type === 'path') {
        selector = `(() => {
          let el = document.body;
          const focusPath = ${JSON.stringify(focusInfo.value)};
          for (const step of focusPath) {
            const children = Array.from(el.children).filter(c => c.tagName.toLowerCase() === step.tag);
            el = children[step.index];
            if (!el) return null;
          }
          return el;
        })()`;
      }
      if (selector) {
        const restoreResult = await ps.send('Runtime.evaluate', {
          expression: `(() => { const el = ${selector}; if (el) el.focus({ preventScroll: true }); })()`
        });
        throwIfExceptionDetails(restoreResult);
      }
    }

    const beforeHtml = await getHtml(pinnedTab);
    const focusInfo = await saveFocus();
    const beforeScreenshotPath = path.join(dir, `${prefix}-before.png`);
    await screenshot(pinnedTab, beforeScreenshotPath);
    await restoreFocus(focusInfo);

    const actionResult = await actionFn();

    if (dialogs) {
      const openAfter = dialogs.getOpen(ps.sessionId);
      if (openAfter) {
        const artifacts = renderSyntheticArtifacts(openAfter);
        const afterPrefix = createCapturePrefix(actionType);
        const afterDir = state.sessionDir;
        writeIfDir(afterDir, `${afterPrefix}.md`, artifacts.markdown);
        writeIfDir(afterDir, `${afterPrefix}.html`, artifacts.html);
        writeIfDir(afterDir, `${afterPrefix}-console.txt`, artifacts.consoleSnapshot);
        return {
          actionResult,
          capture: null,
          dialog: openAfter,
          artifacts,
        };
      }
    }

    await new Promise(resolve => setTimeout(resolve, settleTime));

    const [afterHtml, markdown, pageSize, domSummary] = await Promise.all([
      getHtml(pinnedTab),
      generateMarkdown(pinnedTab),
      getPageSize(pinnedTab),
      generateDomSummary(pinnedTab)
    ]);

    const diff = generateHtmlDiff(beforeHtml, afterHtml);

    const beforeHtmlPath = path.join(dir, `${prefix}-before.html`);
    const afterHtmlPath = path.join(dir, `${prefix}-after.html`);
    const diffPath = path.join(dir, `${prefix}-diff.txt`);
    const markdownPath = path.join(dir, `${prefix}.md`);
    const afterScreenshotPath = path.join(dir, `${prefix}-after.png`);

    fs.writeFileSync(beforeHtmlPath, beforeHtml || '');
    fs.writeFileSync(afterHtmlPath, afterHtml || '');
    fs.writeFileSync(diffPath, diff);
    fs.writeFileSync(markdownPath, markdown || '');
    await screenshot(pinnedTab, afterScreenshotPath);

    return {
      actionResult,
      capture: {
        prefix,
        sessionDir: dir,
        files: {
          beforeHtml: beforeHtmlPath,
          afterHtml: afterHtmlPath,
          diff: diffPath,
          markdown: markdownPath,
          beforeScreenshot: beforeScreenshotPath,
          afterScreenshot: afterScreenshotPath
        },
        pageSize,
        domSummary,
        diffSummary: diff.split('\n').slice(0, 5).join('\n') + (diff.split('\n').length > 5 ? '\n...' : '')
      }
    };
  }

  async function clickWithCapture(tabIndexOrWsUrl, selector) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const run = async () => {
      const clickResult = await actions.click(tabIndexOrWsUrl, selector);

      if (typeof selector === 'string' && selector.startsWith('dialog::')) {
        return { action: 'click', selector, dialogHandled: true, result: clickResult };
      }

      const pinnedTab = { id: ps.targetId };
      const artifacts = await capturePageArtifacts(pinnedTab, 'click');
      return {
        action: 'click',
        selector,
        pageSize: artifacts.pageSize,
        capturePrefix: artifacts.capturePrefix,
        sessionDir: artifacts.sessionDir,
        files: artifacts.files,
        domSummary: artifacts.domSummary,
        consoleLog: []
      };
    };
    if (dialogs && dialogs.withDialogAwarenessForSession) {
      return dialogs.withDialogAwarenessForSession('click', ps, { selector }, run);
    }
    return run();
  }

  async function fillWithCapture(tabIndexOrWsUrl, selector, value) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const pinnedTab = { id: ps.targetId };
    const run = async () => {
      await actions.fill(tabIndexOrWsUrl, selector, value);
      const artifacts = await capturePageArtifacts(pinnedTab, 'type');
      return {
        action: 'type',
        selector,
        value,
        pageSize: artifacts.pageSize,
        capturePrefix: artifacts.capturePrefix,
        sessionDir: artifacts.sessionDir,
        files: artifacts.files,
        domSummary: artifacts.domSummary,
        consoleLog: []
      };
    };
    if (dialogs && dialogs.withDialogAwarenessForSession) {
      return dialogs.withDialogAwarenessForSession('type', ps, { selector }, run);
    }
    return run();
  }

  async function selectOptionWithCapture(tabIndexOrWsUrl, selector, value) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const pinnedTab = { id: ps.targetId };
    const run = async () => {
      await actions.selectOption(tabIndexOrWsUrl, selector, value);
      const artifacts = await capturePageArtifacts(pinnedTab, 'select');
      return {
        action: 'select',
        selector,
        value,
        pageSize: artifacts.pageSize,
        capturePrefix: artifacts.capturePrefix,
        sessionDir: artifacts.sessionDir,
        files: artifacts.files,
        domSummary: artifacts.domSummary,
        consoleLog: []
      };
    };
    if (dialogs && dialogs.withDialogAwarenessForSession) {
      return dialogs.withDialogAwarenessForSession('select', ps, { selector }, run);
    }
    return run();
  }

  async function evaluateWithCapture(tabIndexOrWsUrl, expression) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const pinnedTab = { id: ps.targetId };
    const run = async () => {
      const result = await actions.evaluate(tabIndexOrWsUrl, expression);
      const artifacts = await capturePageArtifacts(pinnedTab, 'eval');
      return {
        action: 'eval',
        expression,
        result,
        pageSize: artifacts.pageSize,
        capturePrefix: artifacts.capturePrefix,
        sessionDir: artifacts.sessionDir,
        files: artifacts.files,
        domSummary: artifacts.domSummary,
        consoleLog: []
      };
    };
    if (dialogs && dialogs.withDialogAwarenessForSession) {
      return dialogs.withDialogAwarenessForSession('eval', ps, {}, run);
    }
    return run();
  }

  return {
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
  };
}

export { attachCapture };
