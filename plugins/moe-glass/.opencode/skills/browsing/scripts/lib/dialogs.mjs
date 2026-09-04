import { randomUUID } from 'node:crypto';
import { renderSyntheticArtifacts } from './dialogs-render.mjs';
import { buildShimSource } from './page-scripts/permission-shim.mjs';

class DialogRefusedError extends Error {
  constructor({ dialog, artifacts }) {
    super('Page is behind a dialog. Handle dialog::accept or dialog::dismiss first.');
    this.name = 'DialogRefusedError';
    this.refused = true;
    this.dialog = dialog;
    this.artifacts = artifacts;
  }
}

const PAGE_TARGET_ACTIONS = new Set([
  'navigate', 'click', 'type', 'extract', 'screenshot', 'eval', 'select', 'attr',
  'await_element', 'await_text', 'hover', 'drag_drop', 'mouse_move', 'scroll',
  'double_click', 'right_click', 'file_upload', 'keyboard_press',
  'set_viewport', 'clear_viewport', 'get_viewport',
]);

const BROWSER_TARGET_ACTIONS = new Set([
  'list_tabs', 'new_tab', 'close_tab', 'show_browser', 'hide_browser',
  'browser_mode', 'set_profile', 'get_profile', 'help', 'clear_cookies',
]);

function attachDialogs({ state }) {
  if (!state.dialogs) state.dialogs = new Map();
  if (!state._targetIdToSessionId) state._targetIdToSessionId = new Map();
  if (!state._dialogShimSecrets) state._dialogShimSecrets = new Map();

  function getOpen(wsUrlOrSid) {
    const direct = state.dialogs.get(wsUrlOrSid);
    if (direct) return direct;
    const m = /\/devtools\/page\/([^/]+)$/.exec(wsUrlOrSid);
    if (m) {
      const sid = state._targetIdToSessionId.get(m[1]);
      if (sid) return state.dialogs.get(sid) || null;
    }
    return null;
  }

  function clear(wsUrlOrSid) {
    state.dialogs.delete(wsUrlOrSid);
    const wsMatch = /\/devtools\/page\/([^/]+)$/.exec(wsUrlOrSid);
    if (wsMatch) {
      const sid = state._targetIdToSessionId.get(wsMatch[1]);
      if (sid) state.dialogs.delete(sid);
    }
  }

  if (!state._dialogPageSessions) state._dialogPageSessions = new Set();

  async function attachToPageSession(pageSession) {
    const sid = pageSession.sessionId;
    if (state._dialogPageSessions.has(sid)) return;
    state._dialogPageSessions.add(sid);
    if (pageSession.targetId) {
      state._targetIdToSessionId.set(pageSession.targetId, sid);
    }
    await pageSession.send('Page.enable', {});
    await pageSession.send('DeviceAccess.enable', {});
    await pageSession.send('Fetch.enable', {
      handleAuthRequests: true,
      patterns: [{ urlPattern: '*' }],
    });
    await pageSession.send('Runtime.enable', {});
    const shimSecret = randomUUID();
    state._dialogShimSecrets.set(sid, shimSecret);
    await pageSession.send('Page.addScriptToEvaluateOnNewDocument', { source: buildShimSource(shimSecret) });
    await pageSession.send('Runtime.addBinding', { name: '__dialogShim' });
    pageSession.onEvent((msg) => handleCdpEventForSession(sid, msg, pageSession.send));
  }

  function handleCdpEventForSession(sid, msg, sendPageCmd) {
    if (msg.method === 'Runtime.bindingCalled') {
      if (msg.params.name !== '__dialogShim') return;
      let data;
      try { data = JSON.parse(msg.params.payload); } catch { return; }
      if (data.type === 'permission-request') {
        const expectedSecret = state._dialogShimSecrets.get(sid);
        if (!expectedSecret || data.secret !== expectedSecret) {
          console.error(`[dialogs] permission-request on ${sid} failed secret check; ignoring (forged or stale)`);
          return;
        }
        if (state.dialogs.has(sid)) {
          console.error(`[dialogs] permission request while dialog open on ${sid}; preserving original`);
          return;
        }
        state.dialogs.set(sid, {
          kind: 'permission',
          openedAt: Date.now(),
          payload: { name: data.name, origin: data.origin, jsApi: data.jsApi },
          staged: { _shimId: data.id, _shimSecret: expectedSecret },
        });
      }
      return;
    }
    if (msg.method === 'Page.javascriptDialogOpening') {
      if (state.dialogs.has(sid)) {
        console.error(`[dialogs] second javascriptDialogOpening on ${sid}; preserving original`);
        return;
      }
      const p = msg.params;
      state.dialogs.set(sid, {
        kind: p.type,
        openedAt: Date.now(),
        payload: {
          message: p.message, defaultPrompt: p.defaultPrompt, url: p.url, hasBrowserHandler: p.hasBrowserHandler,
        },
        staged: {},
      });
      return;
    }
    if (msg.method === 'DeviceAccess.deviceRequestPrompted') {
      if (state.dialogs.has(sid)) {
        console.error(`[dialogs] second prompt on ${sid}; preserving original`);
        return;
      }
      state.dialogs.set(sid, {
        kind: 'device-chooser',
        openedAt: Date.now(),
        payload: {
          requestId: msg.params.id,
          deviceKind: msg.params.deviceKind || 'usb',
          devices: msg.params.devices || [],
        },
        staged: {},
      });
      return;
    }
    if (msg.method === 'Page.javascriptDialogClosed') {
      state.dialogs.delete(sid);
      return;
    }
    if (msg.method === 'Page.frameNavigated') {
      if (msg.params.frame && !msg.params.frame.parentId) {
        state.dialogs.delete(sid);
      }
      return;
    }
    if (msg.method === 'Fetch.requestPaused') {
      const p = msg.params;
      if (sendPageCmd) {
        sendPageCmd('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
      }
      return;
    }
    if (msg.method === 'Fetch.authRequired') {
      const p = msg.params;
      if (state.dialogs.has(sid)) {
        console.error(`[dialogs] auth challenge while dialog open on ${sid}; preserving original`);
        return;
      }
      state.dialogs.set(sid, {
        kind: 'basic-auth',
        openedAt: Date.now(),
        payload: {
          requestId: p.requestId,
          origin: p.authChallenge.origin,
          scheme: p.authChallenge.scheme,
          realm: p.authChallenge.realm || '',
        },
        staged: {},
      });
      return;
    }
  }

  async function withDialogAwareness(actionName, wsUrl, args, fn) {
    const open = getOpen(wsUrl);
    const isDialogSelector = typeof args?.selector === 'string' && args.selector.startsWith('dialog::');

    if (open && PAGE_TARGET_ACTIONS.has(actionName) && !isDialogSelector) {
      return {
        refused: true,
        error: 'Page is behind a dialog. Handle dialog::accept or dialog::dismiss first.',
        dialog: open,
        artifacts: renderSyntheticArtifacts(open),
      };
    }

    if (!open && PAGE_TARGET_ACTIONS.has(actionName)) {
      const before = state.dialogs.has(wsUrl);
      const actionResult = await fn();
      const afterOpen = getOpen(wsUrl);
      if (!before && afterOpen) {
        return {
          midFlight: true,
          actionResult,
          dialog: afterOpen,
          artifacts: renderSyntheticArtifacts(afterOpen),
        };
      }
      return actionResult;
    }

    return fn();
  }

  async function withDialogAwarenessForSession(actionName, pageSession, args, fn) {
    const sid = pageSession && pageSession.sessionId;
    const open = sid ? state.dialogs.get(sid) : null;
    const isDialogSelector = typeof args?.selector === 'string' && args.selector.startsWith('dialog::');

    if (open && PAGE_TARGET_ACTIONS.has(actionName) && !isDialogSelector) {
      return {
        refused: true,
        error: 'Page is behind a dialog. Handle dialog::accept or dialog::dismiss first.',
        dialog: open,
        artifacts: renderSyntheticArtifacts(open),
      };
    }

    if (!open && PAGE_TARGET_ACTIONS.has(actionName)) {
      const before = sid ? state.dialogs.has(sid) : false;
      const actionResult = await fn();
      const afterOpen = sid ? state.dialogs.get(sid) : null;
      if (!before && afterOpen) {
        return {
          midFlight: true,
          actionResult,
          dialog: afterOpen,
          artifacts: renderSyntheticArtifacts(afterOpen),
        };
      }
      return actionResult;
    }

    return fn();
  }

  return { getOpen, clear, attachToPageSession, withDialogAwareness, withDialogAwarenessForSession };
}

export { attachDialogs, PAGE_TARGET_ACTIONS, BROWSER_TARGET_ACTIONS, DialogRefusedError };
