'use strict';

// Source of the shim that runs in every page at document_start.
// `buildShimSource(secret)` templates a per-page-session secret into the
// script; `dialogs.js`'s `attachToPageSession` mints the secret and
// registers the result via `Page.addScriptToEvaluateOnNewDocument`.
//
// Why the secret (CR-064): the binding channel this shim uses
// (`window.__dialogShim` / `window.__dialogShim_resolve`) has to be a plain
// global reachable from the page's own JS realm — that is what lets CDP's
// main-world `Runtime.evaluate` reach it to deliver the operator's decision.
// The same reachability means page script can call either function directly:
// `window.__dialogShim_resolve('1', 'grant')` resolves the page's own
// pending request without an operator ever seeing it, and
// `window.__dialogShim(JSON.stringify({type:'permission-request', ...}))`
// fabricates a request that makes the session-boundary gate wedge every
// subsequent page action behind a phantom dialog. SECRET is minted
// server-side per page session and is never assigned to anything the page
// can read (it only ever exists inside this IIFE's closure and as an opaque
// argument the operator's resolve command supplies) — `Page.addScriptTo-
// EvaluateOnNewDocument` scripts aren't inserted as `<script>` DOM nodes, so
// there's no `document.currentScript`-style path for a page to read this
// source and recover it. A page that doesn't already know SECRET can
// neither resolve a real request nor mint one the server will accept.
function buildShimSource(secret) {
  const secretLiteral = JSON.stringify(String(secret));
  return `
(() => {
  const BINDING = '__dialogShim';
  const SECRET = ${secretLiteral};
  const pending = new Map();
  let nextId = 1;

  function ask(name, jsApi) {
    if (typeof window[BINDING] !== 'function') {
      // The binding is unavailable in this execution context — observed on
      // Chrome 148+, where Runtime.addBinding does not reliably inject into
      // page execution contexts (see dialogs.smoke.test.mjs). Calling it
      // anyway throws synchronously inside the Promise executor, turning
      // every wrapped API into an unconditional, uncatchable-as-permission
      // TypeError instead of a proper NotAllowedError (CR-063). Fail OPEN to
      // native behaviour instead: Chrome's own permission gate (or lack of
      // one, per API) still governs the call, same as an unpatched page.
      return Promise.resolve('grant');
    }
    const id = String(nextId++);
    return new Promise((resolve) => {
      pending.set(id, resolve);
      window[BINDING](JSON.stringify({ type: 'permission-request', id, name, jsApi, origin: location.origin, secret: SECRET }));
    });
  }

  window[BINDING + '_resolve'] = (id, resolution, secret) => {
    if (secret !== SECRET) return;
    const r = pending.get(id);
    if (r) { pending.delete(id); r(resolution); }
  };

  // getUserMedia
  if (navigator.mediaDevices) {
    const origGetUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function(constraints) {
      const name = constraints && constraints.video ? 'camera' : 'microphone';
      const decision = await ask(name, 'navigator.mediaDevices.getUserMedia');
      if (decision === 'grant') return origGetUM(constraints);
      throw new DOMException('Permission denied', 'NotAllowedError');
    };
  }

  // Notification.requestPermission
  if (typeof Notification !== 'undefined') {
    const orig = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = async function(cb) {
      const decision = await ask('notifications', 'Notification.requestPermission');
      const result = decision === 'grant' ? 'granted' : 'denied';
      if (typeof cb === 'function') cb(result);
      return result;
    };
  }

  // Geolocation
  if (navigator.geolocation) {
    const origGet = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = async function(success, error, opts) {
      const decision = await ask('geolocation', 'navigator.geolocation.getCurrentPosition');
      if (decision === 'grant') return origGet(success, error, opts);
      if (error) error(new DOMException('Permission denied', 'NotAllowedError'));
    };
  }

  // Clipboard
  if (navigator.clipboard) {
    if (navigator.clipboard.readText) {
      const orig = navigator.clipboard.readText.bind(navigator.clipboard);
      navigator.clipboard.readText = async function() {
        const decision = await ask('clipboard-read', 'navigator.clipboard.readText');
        if (decision === 'grant') return orig();
        throw new DOMException('Permission denied', 'NotAllowedError');
      };
    }
    if (navigator.clipboard.writeText) {
      const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async function(text) {
        const decision = await ask('clipboard-write', 'navigator.clipboard.writeText');
        if (decision === 'grant') return orig(text);
        throw new DOMException('Permission denied', 'NotAllowedError');
      };
    }
  }
})();
`;
}

module.exports = { buildShimSource };
