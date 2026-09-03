import { readMeta, resolveSession } from "../core/worker-store.js";
/**
 * Resolve a worker arg (session id or tmux_name alias) to its session id and
 * meta, or a code-1 error CommandResult the caller can return directly.
 *
 * Callers discriminate on the shape: a successful resolve has `sid`/`meta`; an
 * error result has `code`. Use `'code' in result` to branch.
 */
export function resolveWorker(ctx, worker) {
    const sid = resolveSession(ctx.workerDir, worker);
    if (sid === null) {
        return { stderr: `Error: no worker known as '${worker}'`, code: 1 };
    }
    const meta = readMeta(ctx.workerDir, sid);
    if (meta === null) {
        return {
            stderr: `Error: no meta found for worker '${worker}' (sid: ${sid})`,
            code: 1,
        };
    }
    return { sid, meta };
}
