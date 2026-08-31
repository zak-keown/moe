import type { EvidenceLogger } from "../../evidence/logger.js";
import type { StreamOptions } from "./format.js";
import { JsonlRenderer, type WriteSink } from "./jsonl.js";
import { PrettyRenderer } from "./pretty.js";
import type { StreamRenderer } from "./renderer.js";

/**
 * Attach a stream renderer to an EvidenceLogger's event observer channel.
 * Returns a cleanup function that detaches the observer and flushes the
 * renderer. Callers should invoke cleanup exactly once, typically in a
 * finally block alongside adapter.close().
 */
export function attachRenderer(
  logger: EvidenceLogger,
  opts: StreamOptions,
  sink: WriteSink,
): () => void {
  if (opts.silent) return () => {};
  const renderer: StreamRenderer =
    opts.format === "jsonl"
      ? new JsonlRenderer(sink)
      : new PrettyRenderer(sink, { color: opts.color, columns: opts.columns });

  const unsubscribe = logger.addEventObserver((ev) => {
    renderer.handle(ev as any);
  });

  return () => {
    unsubscribe();
    renderer.close();
  };
}
