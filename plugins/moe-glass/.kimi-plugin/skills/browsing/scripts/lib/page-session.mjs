function buildPageSessionFromAttached({ browser, router, sessionId, targetId }) {
  const sess = router.registerSession(sessionId);
  let messageIdCounter = 1;
  let detached = false;
  const enabledDomains = new Set();

  async function send(method, params = {}, { timeoutMs = 30000 } = {}) {
    if (detached) throw new Error(`Page session detached (sessionId=${sessionId})`);
    const id = messageIdCounter++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        sess.pendingRequests.delete(id);
        reject(new Error(`Page session timeout: ${method}`));
      }, timeoutMs);
      sess.pendingRequests.set(id, { resolve, reject, timeout });
      try {
        browser.sendRaw(JSON.stringify({ id, method, params, sessionId }));
      } catch (e) {
        clearTimeout(timeout);
        sess.pendingRequests.delete(id);
        reject(e);
      }
    });
  }

  function onEvent(handler) {
    sess.eventListeners.add(handler);
    return () => sess.eventListeners.delete(handler);
  }

  function waitForEvent(method, { timeoutMs = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      let unsub = null;
      const timeout = setTimeout(() => {
        if (unsub) unsub();
        reject(new Error(`waitForEvent ${method}: timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      unsub = onEvent((msg) => {
        if (msg.method === method) {
          clearTimeout(timeout);
          unsub();
          resolve(msg);
        }
      });
    });
  }

  async function enableDomain(name) {
    if (enabledDomains.has(name)) return;
    await send(`${name}.enable`, {});
    enabledDomains.add(name);
  }

  async function detach() {
    if (detached) return;
    detached = true;
    try {
      await browser.send('Target.detachFromTarget', { sessionId });
    } catch {
      // best-effort
    }
    router.unregisterSession(sessionId);
  }

  return { sessionId, targetId, send, onEvent, waitForEvent, enableDomain, detach };
}

async function attachPageSession({ browser, router }, targetId) {
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  return buildPageSessionFromAttached({ browser, router, sessionId, targetId });
}

export { attachPageSession, buildPageSessionFromAttached };
