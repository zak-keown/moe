import http from 'node:http';
import crypto from 'node:crypto';

const WS_ACCEPT_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;

class WebSocketClient {
  constructor(url) {
    this.url = new URL(url);
    this.callbacks = {};
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.connected = false;
  }

  on(event, callback) {
    this.callbacks[event] = callback;
  }

  isConnected() {
    return this.connected && this.socket !== null;
  }

  connect(timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const expectedAccept = crypto.createHash('sha1').update(key + WS_ACCEPT_GUID).digest('base64');

      const options = {
        hostname: this.url.hostname,
        port: this.url.port || 80,
        path: this.url.pathname + this.url.search,
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13'
        }
      };

      const req = http.request(options);

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        req.destroy();
        reject(new Error(`WebSocket handshake to ${this.url} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      req.on('upgrade', (res, socket) => {
        if (settled) { socket.destroy(); return; }
        const actualAccept = res.headers['sec-websocket-accept'];
        if (actualAccept !== expectedAccept) {
          settled = true;
          clearTimeout(timer);
          socket.destroy();
          reject(new Error(
            `WebSocket handshake to ${this.url} failed: Sec-WebSocket-Accept mismatch ` +
            `(expected ${expectedAccept}, got ${actualAccept})`
          ));
          return;
        }
        settled = true;
        clearTimeout(timer);

        this.socket = socket;
        this.connected = true;

        socket.on('data', (data) => {
          this.buffer = Buffer.concat([this.buffer, data]);
          this.processFrames();
        });

        socket.on('error', (err) => {
          this.connected = false;
          if (this.callbacks.error) this.callbacks.error(err);
        });

        socket.on('close', () => {
          this.connected = false;
          if (this.callbacks.close) this.callbacks.close();
        });

        if (this.callbacks.open) this.callbacks.open();
        resolve();
      });

      req.on('response', (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        res.resume();
        reject(new Error(
          `WebSocket handshake to ${this.url} failed: server responded with HTTP ${res.statusCode} instead of upgrading`
        ));
      });

      req.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      req.end();
    });
  }

  processFrames() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];

      const _fin = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0F;
      const _masked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7F;

      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        payloadLen = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      if (this.buffer.length < offset + payloadLen) return;

      const payload = this.buffer.slice(offset, offset + payloadLen);
      this.buffer = this.buffer.slice(offset + payloadLen);

      if (opcode === 0x1 && this.callbacks.message) {
        this.callbacks.message(payload.toString('utf8'));
      }
    }
  }

  send(data) {
    if (!this.socket || !this.connected) {
      throw new Error('WebSocket not connected');
    }
    const payload = Buffer.from(data, 'utf8');
    const payloadLen = payload.length;

    let frame;
    let offset = 2;

    if (payloadLen < 126) {
      frame = Buffer.alloc(payloadLen + 6);
      frame[1] = payloadLen | 0x80;
    } else if (payloadLen < 65536) {
      frame = Buffer.alloc(payloadLen + 8);
      frame[1] = 126 | 0x80;
      frame.writeUInt16BE(payloadLen, 2);
      offset = 4;
    } else {
      frame = Buffer.alloc(payloadLen + 14);
      frame[1] = 127 | 0x80;
      frame.writeBigUInt64BE(BigInt(payloadLen), 2);
      offset = 10;
    }

    frame[0] = 0x81;

    const mask = Buffer.alloc(4);
    crypto.randomFillSync(mask);
    mask.copy(frame, offset);
    offset += 4;

    for (let i = 0; i < payloadLen; i++) {
      frame[offset + i] = payload[i] ^ mask[i % 4];
    }

    this.socket.write(frame);
  }

  close() {
    this.connected = false;
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }
}

export { WebSocketClient };
