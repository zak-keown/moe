import { WebSocketClient as DefaultWebSocketClient } from './websocket-client.mjs';

function createBrowserSession({ host, port, rewriteWsUrl, chromeHttp, WebSocketClient = DefaultWebSocketClient }) {
  let ws = null;
  const pendingRequests = new Map();
  let messageIdCounter = 1;
  const eventListeners = new Set();
  let connectPromise = null;
  let closed = false;

  async function ensureConnected() {
    if (ws && ws.isConnected()) return;
    if (connectPromise) { await connectPromise; return; }
    connectPromise = (async () => {
      try {
        const versionInfo = await chromeHttp('/json/version');
        if (!versionInfo || !versionInfo.webSocketDebuggerUrl) {
          throw new Error('chromeHttp(/json/version) returned no webSocketDebuggerUrl');
        }
        const url = rewriteWsUrl(versionInfo.webSocketDebuggerUrl, host, port);
        const next = new WebSocketClient(url);
        next.on('message', (raw) => {
          let data;
          try { data = JSON.parse(raw); } catch (e) {
            console.error('browser-session: bad JSON from CDP:', e);
            return;
          }
          if (data.id !== undefined && data.sessionId === undefined) {
            const pending = pendingRequests.get(data.id);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingRequests.delete(data.id);
              if (data.error) {
                pending.reject(new Error(data.error.message || JSON.stringify(data.error)));
              } else {
                pending.resolve(data.result);
              }
              return;
            }
          }
          for (const fn of eventListeners) {
            try { fn(data); } catch (e) { console.error('browser-session listener threw:', e); }
          }
        });
        next.on('close', () => {
          for (const [, p] of pendingRequests) {
            clearTimeout(p.timeout);
            p.reject(new Error('Browser session WS closed'));
          }
          pendingRequests.clear();
        });
        await next.connect();
        ws = next;
      } catch (e) {
        connectPromise = null;
        throw e;
      }
    })();
    await connectPromise;
  }

  async function send(method, params = {}, { timeoutMs = 10000 } = {}) {
    if (closed) throw new Error('Browser session closed');
    await ensureConnected();
    if (closed) throw new Error('Browser session closed');
    const id = messageIdCounter++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Browser session timeout: ${method}`));
      }, timeoutMs);
      pendingRequests.set(id, { resolve, reject, timeout });
      try {
        ws.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        clearTimeout(timeout);
        pendingRequests.delete(id);
        reject(e);
      }
    });
  }

  function onEvent(handler) {
    eventListeners.add(handler);
    return () => eventListeners.delete(handler);
  }

  async function close() {
    closed = true;
    if (ws) { ws.close(); ws = null; }
    for (const [, p] of pendingRequests) {
      clearTimeout(p.timeout);
      p.reject(new Error('Browser session closed'));
    }
    pendingRequests.clear();
    eventListeners.clear();
  }

  function isConnected() { return ws !== null && ws.isConnected(); }

  function sendRaw(json) {
    if (closed) throw new Error('Browser session closed');
    if (!ws || !ws.isConnected()) {
      throw new Error('Browser WS not connected (call send() first to lazy-open)');
    }
    ws.send(json);
  }

  return { send, onEvent, close, isConnected, sendRaw };
}

export { createBrowserSession };
