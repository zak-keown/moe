import { type ToolResult, textResult } from "../../../models/provider.js";
import { resolveInside } from "../../../paths.js";
import { composeResult } from "../adapter.js";
import type { WebToolCtx } from "./types.js";

/**
 * Page-level action tools: navigate, eval, file_upload.
 *
 * `eval` stays implemented but is not exposed in the schema
 * (PRI-1590 experiment — see tool-defs.ts). file_upload routes to
 * DOM.setFileInputFiles via chrome.fileUpload — the only way to
 * programmatically set <input type=file> — after resolving each requested
 * path against ctx.contextRoot via resolveInside() (CR-032), the same
 * containment install_cookies/install_passkey already use.
 */

export async function executeNavigate(
  ctx: WebToolCtx,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  await ctx.chrome.navigate(ctx.tab, args.url as string);
  return composeResult("navigated", await ctx.takeReturnScreenshot());
}

export async function executeEval(
  ctx: WebToolCtx,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const result = await ctx.chrome.evaluate(ctx.tab, args.expression as string);
  const text =
    result === undefined
      ? "undefined"
      : typeof result === "string"
        ? result
        : JSON.stringify(result);
  return composeResult(text, await ctx.takeReturnScreenshot());
}

export async function executeFileUpload(
  ctx: WebToolCtx,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  // CR-032: file_paths reached DOM.setFileInputFiles verbatim, with nothing
  // confining them to the run's context root — unlike every other
  // file-touching tool in this package (install_cookies, install_passkey),
  // which route their path through resolveInside(contextRoot, path). A
  // model could attach ~/.ssh/id_rsa, ~/.aws/credentials, or the run's own
  // evidence directory to a file input, and the browser would upload the
  // bytes to whatever origin the page posts to. Resolve each requested path
  // against contextRoot the same way; reject rather than pass through a raw
  // absolute path.
  if (ctx.contextRoot === null) {
    return textResult(
      "Error: file_upload requires a context directory (WebAdapterOptions.contextRoot) to be configured for this run; none was provided.",
    );
  }
  const requested = args.file_paths;
  if (!Array.isArray(requested) || requested.some((p) => typeof p !== "string")) {
    return textResult('Error: file_upload requires "file_paths" to be an array of strings.');
  }
  const resolvedPaths: string[] = [];
  for (const rel of requested as string[]) {
    try {
      resolvedPaths.push(resolveInside(ctx.contextRoot, rel));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return textResult(`Error: ${reason}`);
    }
  }
  try {
    const result = await ctx.chrome.fileUpload(ctx.tab, args.selector as string, resolvedPaths);
    return composeResult(
      `uploaded ${result.files} file(s) to ${args.selector}`,
      await ctx.takeReturnScreenshot(),
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return composeResult(`Error: ${reason}`, await ctx.takeReturnScreenshot());
  }
}
