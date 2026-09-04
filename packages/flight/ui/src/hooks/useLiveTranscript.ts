import { useEffect, useState } from "react";
import {
  applyEvent,
  emptyTranscript,
  type TranscriptEvent,
  type TranscriptModel,
} from "../lib/transcript";

// WS message shapes consumed by the transcript view. The server also sends
// `snapshot` / `frame` / `progress` / `complete` / `error` / `gone` messages
// (consumed by LiveRun) — those are ignored here.
type TranscriptWsMessage =
  | { type: "transcriptSnapshot"; events: TranscriptEvent[] }
  | { type: "event"; event: TranscriptEvent }
  | { type: string; [k: string]: unknown };

export interface UseLiveTranscriptResult {
  model: TranscriptModel;
  connected: boolean;
  error: string | null;
  /** True once the server has told us the run is no longer active. */
  gone: boolean;
}

/** Exponential backoff, capped at 30s. Attempt 0 → 1s, 1 → 2s, 2 → 4s, ... */
export function reconnectDelayMs(attempt: number): number {
  const BASE_MS = 1000;
  const MAX_MS = 30000;
  return Math.min(BASE_MS * 2 ** attempt, MAX_MS);
}

export interface ReconnectingSocketHandlers {
  onOpen: () => void;
  onClose: () => void;
  onError: () => void;
  onMessage: (data: string) => void;
}

/**
 * Opens a WebSocket to `url`. On close/error, reopens it with exponential
 * backoff (`reconnectDelayMs`) for as long as `shouldReconnect()` returns
 * true at the moment the socket closes — the caller decides "plausibly
 * still active" (e.g. no `gone`/`runEnd` message received yet). Returns a
 * `close()` that stops reconnecting and closes the current socket.
 *
 * `createSocket` is injectable so this can be tested without a real
 * network connection.
 */
export function connectWithReconnect(
  url: string,
  handlers: ReconnectingSocketHandlers,
  shouldReconnect: () => boolean,
  createSocket: (url: string) => WebSocket = (u) => new WebSocket(u),
): { close: () => void } {
  let cancelled = false;
  let attempt = 0;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function open() {
    if (cancelled) return;
    const ws = createSocket(url);
    socket = ws;
    ws.onopen = () => {
      if (cancelled) return;
      attempt = 0;
      handlers.onOpen();
    };
    ws.onmessage = (evt: MessageEvent) => {
      if (cancelled) return;
      handlers.onMessage(evt.data);
    };
    ws.onerror = () => {
      if (cancelled) return;
      handlers.onError();
    };
    ws.onclose = () => {
      if (cancelled) return;
      handlers.onClose();
      if (!shouldReconnect()) return;
      const delay = reconnectDelayMs(attempt);
      attempt += 1;
      timer = setTimeout(open, delay);
    };
  }

  open();

  return {
    close: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    },
  };
}

export function useLiveTranscript(runId: string | null): UseLiveTranscriptResult {
  const [model, setModel] = useState<TranscriptModel>(() => emptyTranscript());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!runId) return;
    setModel(emptyTranscript());
    setConnected(false);
    setError(null);
    setGone(false);

    let isGone = false;
    let hasRunEnd = false;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/ws?run=${encodeURIComponent(runId)}`;

    const conn = connectWithReconnect(
      url,
      {
        onOpen: () => setConnected(true),
        onClose: () => setConnected(false),
        onError: () => setConnected(false),
        onMessage: (data) => {
          let msg: TranscriptWsMessage;
          try {
            msg = JSON.parse(data);
          } catch {
            return;
          }
          switch (msg.type) {
            case "transcriptSnapshot":
              setModel((m) =>
                (msg as { type: "transcriptSnapshot"; events: TranscriptEvent[] }).events.reduce(
                  applyEvent,
                  m,
                ),
              );
              break;
            case "event":
              setModel((m) => {
                const next = applyEvent(
                  m,
                  (msg as { type: "event"; event: TranscriptEvent }).event,
                );
                hasRunEnd = next.runEnd !== undefined;
                return next;
              });
              break;
            case "error": {
              const m = (msg as unknown as { message?: unknown | undefined }).message;
              setError(typeof m === "string" ? m : "run error");
              break;
            }
            case "gone":
              isGone = true;
              setGone(true);
              break;
            default:
              // Ignore legacy message types (frame/progress/snapshot/complete) —
              // they're consumed by LiveRun's hook, not here.
              break;
          }
        },
      },
      () => !isGone && !hasRunEnd,
    );

    return () => {
      conn.close();
    };
  }, [runId]);

  return { model, connected, error, gone };
}
