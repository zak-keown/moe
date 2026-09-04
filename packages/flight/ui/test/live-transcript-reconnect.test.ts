import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { connectWithReconnect, reconnectDelayMs } from "../src/hooks/useLiveTranscript";

/** A minimal fake WebSocket the test drives by hand — no real network. */
class FakeSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  closed = false;

  close() {
    this.closed = true;
  }

  /** Test helper: simulate the server dropping the connection. */
  simulateClose() {
    this.onclose?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reconnectDelayMs", () => {
  test("doubles each attempt, capped at 30s", () => {
    expect(reconnectDelayMs(0)).toBe(1000);
    expect(reconnectDelayMs(1)).toBe(2000);
    expect(reconnectDelayMs(2)).toBe(4000);
    expect(reconnectDelayMs(10)).toBe(30000);
  });
});

describe("connectWithReconnect", () => {
  test("reopens the socket with backoff after it closes, while shouldReconnect() is true", async () => {
    const sockets: FakeSocket[] = [];
    const createSocket = vi.fn(() => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as WebSocket;
    });

    connectWithReconnect(
      "ws://example.test/",
      { onOpen: () => {}, onClose: () => {}, onError: () => {}, onMessage: () => {} },
      () => true,
      createSocket,
    );

    expect(createSocket).toHaveBeenCalledTimes(1);

    // Server drops the connection.
    sockets[0]?.simulateClose();

    // Not yet time for the first reconnect attempt (1000ms backoff).
    await vi.advanceTimersByTimeAsync(500);
    expect(createSocket).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(600);
    expect(createSocket).toHaveBeenCalledTimes(2);
  });

  test("does not reconnect once shouldReconnect() returns false (run is gone/ended)", async () => {
    const sockets: FakeSocket[] = [];
    const createSocket = vi.fn(() => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as WebSocket;
    });

    connectWithReconnect(
      "ws://example.test/",
      { onOpen: () => {}, onClose: () => {}, onError: () => {}, onMessage: () => {} },
      () => false,
      createSocket,
    );

    sockets[0]?.simulateClose();

    await vi.advanceTimersByTimeAsync(60000);
    expect(createSocket).toHaveBeenCalledTimes(1);
  });

  test("close() stops further reconnect attempts", async () => {
    const sockets: FakeSocket[] = [];
    const createSocket = vi.fn(() => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as WebSocket;
    });

    const conn = connectWithReconnect(
      "ws://example.test/",
      { onOpen: () => {}, onClose: () => {}, onError: () => {}, onMessage: () => {} },
      () => true,
      createSocket,
    );

    sockets[0]?.simulateClose();
    conn.close();

    await vi.advanceTimersByTimeAsync(60000);
    expect(createSocket).toHaveBeenCalledTimes(1);
    expect(sockets[0]?.closed).toBe(true);
  });
});
