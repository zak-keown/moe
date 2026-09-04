import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type RunSetManifest } from "../lib/api";
import { Spinner, StatusBadge } from "./shared";

/** How often the fallback poll re-fetches the manifest while mounted. */
export const RUN_SET_POLL_INTERVAL_MS = 3000;

/**
 * The WS subscription (below) only carries the manifest while the socket
 * stays connected — no reconnect, and until this fix no fallback either.
 * If the socket fails to connect, or drops mid-run (server restart,
 * reverse-proxy timeout, network blip), this interval is the only thing
 * that keeps `manifest` from going stale for however long the run set
 * continues to execute server-side. Mirrors `useActiveRuns.ts`'s
 * polling-as-fallback-over-push pattern. Returns a cleanup that stops the
 * interval.
 */
export function pollRunSetManifest(
  fetchManifest: () => Promise<RunSetManifest>,
  onUpdate: (manifest: RunSetManifest) => void,
  intervalMs: number,
): () => void {
  const id = setInterval(() => {
    fetchManifest()
      .then(onUpdate)
      .catch(() => {
        // best-effort; keep the last known manifest and try again next tick
      });
  }, intervalMs);
  return () => clearInterval(id);
}

export function RunSetDetail() {
  const { id } = useParams<{ id: string }>();
  const [manifest, setManifest] = useState<RunSetManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Initial fetch
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api.runSets
      .get(id)
      .then((m) => {
        if (!cancelled) setManifest(m);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load run set");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // WS subscription — snapshot on connect, re-fetch on pass_end / set_done.
  // No reconnect on drop: the fallback poll below is what keeps `manifest`
  // from going stale if the socket never connects or dies mid-run.
  useEffect(() => {
    if (!id) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/ws/run-sets/${encodeURIComponent(id)}`,
    );
    ws.onerror = () => {
      // best-effort; the fallback poll below keeps the manifest updated
    };
    ws.onclose = () => {
      // best-effort; the fallback poll below keeps the manifest updated
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.kind === "snapshot" && msg.manifest) {
          setManifest(msg.manifest);
        } else if (msg.kind === "pass_end" || msg.kind === "set_done") {
          // Re-fetch to pick up updated statuses and summary
          api.runSets
            .get(id)
            .then(setManifest)
            .catch(() => {});
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => {
      ws.close();
    };
  }, [id]);

  // Fallback poll — covers the window before the socket connects and any
  // period after it drops. See `pollRunSetManifest`.
  useEffect(() => {
    if (!id) return;
    return pollRunSetManifest(() => api.runSets.get(id), setManifest, RUN_SET_POLL_INTERVAL_MS);
  }, [id]);

  const handleCancel = async () => {
    if (!id) return;
    setCancelling(true);
    try {
      await api.runSets.cancel(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="p-6">
        <Spinner label="Loading run set…" />
      </div>
    );
  }

  const inFlight = manifest.completedAt === null;

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-2 flex items-center gap-3">
        <h1 className="heading-display text-2xl">
          Run set · {manifest.kind} · {manifest.passes}{" "}
          {manifest.passes === 1 ? "attempt" : "attempts"}
        </h1>
        {inFlight && (
          <span
            role="img"
            className="relative flex h-2 w-2 flex-shrink-0"
            aria-label="Run in progress"
          >
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal" />
          </span>
        )}
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-slate space-y-1">
          <div>Cards: {manifest.cards.join(", ")}</div>
          <div>Created: {manifest.createdAt}</div>
          {manifest.completedAt && <div>Completed: {manifest.completedAt}</div>}
        </div>
        {inFlight && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="btn-secondary"
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>

      {/* Summary card */}
      {manifest.summary && (
        <div className="card p-4 mb-6">
          <h2 className="section-label mb-3">Summary</h2>
          <div className="flex items-center gap-3 mb-2">
            <StatusBadge status={manifest.summary.overall.overallStatus} size="md" />
            <span className="text-sm text-slate">
              {Object.entries(manifest.summary.overall.byStatus)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${n} ${k}`)
                .join(" · ")}
            </span>
          </div>
          {manifest.summary.perCard.length > 0 && (
            <div className="mt-3 space-y-2">
              {manifest.summary.perCard.map((c) => (
                <div key={c.cardId} className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-ink">{c.cardId}</span>
                  <StatusBadge status={c.cardStatus} />
                  <span className="text-slate">
                    median {c.medianTurns} turn{c.medianTurns !== 1 ? "s" : ""} /{" "}
                    {Math.round(c.medianDurationMs / 1000)}s
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attempt rows */}
      <div className="space-y-1">
        {manifest.runs.map((r) => {
          const live = r.status === "running" || r.status === "queued";
          const linkTo = live ? `/runs/live/${r.runId}` : `/runs/${r.runId}`;
          return (
            <Link
              key={r.runId}
              to={linkTo}
              className="block p-3 border border-edge rounded hover:bg-panel transition-colors duration-150"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink">
                  Attempt {r.attemptNumber} of {manifest.passes}
                  {manifest.cards.length > 1 && <span className="text-slate"> · {r.cardId}</span>}
                </span>
                <StatusBadge status={r.status} />
              </div>
              <div className="text-xs text-slate mt-1 font-mono">{r.runId}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
