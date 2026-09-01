// MOE-FLIGHT DIVERGENCE #1: WebSocketClient uses a WebSocket client library
// rather than upstream's `http.request` + hand-rolled frame parser. The public
// API (`on/connect/send/close/isConnected`) matches upstream's, so callers
// don't need to know which backend is in use.
//
// MOE-FLIGHT DIVERGENCE (import, 2026-08-31): the backend is now the `ws`
// package, not the global `WebSocket`.
//
// The original used `new WebSocket(url, { perMessageDeflate: false })` — a
// Bun-only extension (Bun PR #29685) where the standard constructor's second
// argument is `protocols`, a string or string array. Under Node's global
// WebSocket (undici) a non-string second argument is ignored outright, so the
// PRI-1690 compression opt-out below silently stopped working: the CDP
// browser-WS renegotiated permessage-deflate, and Chrome's intermittently
// malformed deflate frames close the socket with code=1002 "Invalid
// compressed data" mid-run. `test/qa/adapters/web/lib/
// websocket-client-no-compression.test.ts` caught it on the first Node run.
//
// `ws` honours `perMessageDeflate: false` for real, and it is already a
// declared runtime dependency of @tc/moe-flight (src/qa/runtime/serve.ts
// uses it for upgrades). It also keeps the browser-shaped
// `addEventListener` API this class was written against.
//
// When syncing from upstream, preserve this class body verbatim — upstream
// rarely touches `lib/websocket-client.js`.
const WebSocket = require('ws');

class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.callbacks = {};
    this.ws = null;
    this.connected = false;
  }

  on(event, callback) {
    this.callbacks[event] = callback;
  }

  isConnected() {
    return this.connected && this.ws !== null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      // perMessageDeflate: false opts out of WebSocket compression
      // negotiation. Chrome's CDP intermittently sends frames whose
      // permessage-deflate payloads close the connection with
      // code=1002 "Invalid compressed data" — wedging the browser-WS
      // mid-run. Opting out avoids the bug at the source. PRI-1690.
      this.ws = new WebSocket(this.url, { perMessageDeflate: false });

      this.ws.addEventListener('open', () => {
        this.connected = true;
        if (this.callbacks.open) this.callbacks.open();
        resolve();
      });

      this.ws.addEventListener('message', (event) => {
        if (this.callbacks.message) {
          const data = typeof event.data === 'string' ? event.data : event.data.toString('utf8');
          this.callbacks.message(data);
        }
      });

      this.ws.addEventListener('error', (event) => {
        this.connected = false;
        if (this.callbacks.error) this.callbacks.error(event);
        reject(event);
      });

      this.ws.addEventListener('close', () => {
        this.connected = false;
        if (this.callbacks.close) this.callbacks.close();
      });
    });
  }

  send(data) {
    if (!this.ws || !this.connected) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(data);
  }

  close() {
    this.connected = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = { WebSocketClient };
