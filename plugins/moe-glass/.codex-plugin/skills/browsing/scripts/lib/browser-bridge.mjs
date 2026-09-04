import { createCdpRouter } from './cdp-router.mjs';
import { attachPageSession, buildPageSessionFromAttached } from './page-session.mjs';

async function attachBrowserBridge({ browser, host, port, rewriteWsUrl, autoAttach = false, onPageSession = null }) {
  const router = createCdpRouter({ browser });

  const targetMap = new Map();
  const onCreatedFns = new Set();
  const onDestroyedFns = new Set();

  router.getRootListeners().add((msg) => {
    if (msg.method === 'Target.targetCreated') {
      const t = msg.params.targetInfo;
      targetMap.set(t.targetId, t);
      for (const fn of onCreatedFns) {
        try { fn(t); } catch (e) { console.error('targets onCreated handler threw:', e); }
      }
    } else if (msg.method === 'Target.targetInfoChanged') {
      const t = msg.params.targetInfo;
      targetMap.set(t.targetId, t);
    } else if (msg.method === 'Target.targetDestroyed') {
      const t = targetMap.get(msg.params.targetId);
      targetMap.delete(msg.params.targetId);
      if (t) {
        for (const fn of onDestroyedFns) {
          try { fn(t); } catch (e) { console.error('targets onDestroyed handler threw:', e); }
        }
      }
    }
  });

  router.getRootListeners().add(async (msg) => {
    if (msg.method !== 'Target.attachedToTarget') return;
    const { sessionId, targetInfo, waitingForDebugger } = msg.params;

    if (!waitingForDebugger) return;

    const ps = buildPageSessionFromAttached({ browser, router, sessionId, targetId: targetInfo.targetId });

    if (onPageSession && targetInfo.type === 'page') {
      try { await onPageSession(ps); }
      catch (e) { console.error('onPageSession hook threw:', e); }
    }

    try { await ps.send('Runtime.runIfWaitingForDebugger', {}); }
    catch (e) { console.error('Runtime.runIfWaitingForDebugger failed:', e); }
  });

  await browser.send('Target.setDiscoverTargets', { discover: true });

  if (autoAttach) {
    await browser.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
    });
  }

  function list() { return Array.from(targetMap.values()); }
  function onCreated(fn) { onCreatedFns.add(fn); return () => onCreatedFns.delete(fn); }
  function onDestroyed(fn) { onDestroyedFns.add(fn); return () => onDestroyedFns.delete(fn); }

  function waitForNew(predicate, { timeoutMs = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      let unsub = null;
      const timeout = setTimeout(() => {
        if (unsub) unsub();
        reject(new Error(`waitForNew: timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      unsub = onCreated((t) => {
        let match;
        try { match = predicate(t); }
        catch (e) {
          clearTimeout(timeout);
          if (unsub) unsub();
          reject(e);
          return;
        }
        if (match) {
          clearTimeout(timeout);
          if (unsub) unsub();
          resolve(t);
        }
      });
    });
  }

  async function createBrowserContext(opts = {}) {
    const params = {};
    if (opts.proxyServer) params.proxyServer = opts.proxyServer;
    const { browserContextId } = await browser.send('Target.createBrowserContext', params);
    let disposed = false;

    async function createPage(url = 'about:blank') {
      if (disposed) throw new Error('BrowserContext disposed');
      const { targetId } = await browser.send('Target.createTarget', { url, browserContextId });
      const rawWsUrl = `ws://${host}:${port}/devtools/page/${targetId}`;
      return {
        id: targetId, targetId,
        webSocketDebuggerUrl: rewriteWsUrl(rawWsUrl, host, port),
        type: 'page', url, browserContextId,
      };
    }

    async function dispose() {
      if (disposed) return;
      disposed = true;
      try { await browser.send('Target.disposeBrowserContext', { browserContextId }); }
      catch (e) { console.warn('BrowserContext.dispose() failed:', e && e.message); }
    }

    return { browserContextId, createPage, dispose };
  }

  async function attachPage(targetId) {
    return attachPageSession({ browser, router }, targetId);
  }

  return {
    targets: { list, onCreated, onDestroyed, waitForNew },
    createBrowserContext,
    attachPageSession: attachPage,
    router,
  };
}

export { attachBrowserBridge };
