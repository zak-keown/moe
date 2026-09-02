import type { ToolResult } from "../../../models/provider.js";
import { composeResult } from "../adapter.js";
import type { WebToolCtx } from "./types.js";

/**
 * Keyboard tools: type, press.
 *
 * `type` always goes through `fill`, which focuses+clears the target
 * when a selector is given and, either way, drives the text in via
 * `Input.insertText` (with \t/\n handled as Tab/Enter). `press` is the
 * separate single-key path for Enter, Tab, arrow keys, etc. — its
 * `keyboardPress` only knows named keys, so it must never be handed an
 * ordinary character (CR-035: the old no-selector branch here did
 * exactly that, walking `text` char-by-char through `keyboardPress`,
 * which threw `Unknown key: <char>` on the first letter/digit/
 * punctuation character since none of them are in its named-key table).
 */

export async function executeType(
  ctx: WebToolCtx,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const selector = args.selector as string | undefined;
  const text = args.text as string;
  await ctx.chrome.fill(ctx.tab, selector, text);
  return composeResult("typed", await ctx.takeReturnScreenshot());
}

export async function executePress(
  ctx: WebToolCtx,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  await ctx.chrome.keyboardPress(ctx.tab, args.key as string);
  return composeResult("pressed", await ctx.takeReturnScreenshot());
}
