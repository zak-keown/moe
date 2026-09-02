import type { EvidenceLogger } from "../../../evidence/logger.js";
import type { ChromeSession, ScreenshotResult } from "../adapter.js";

/**
 * Per-call context threaded to every per-tool execute function.
 *
 * `tab` is the active tab (top of the WebAdapter's focus stack at
 * dispatch time, or numeric 0 fallback). `takeReturnScreenshot` is
 * the closure built once per executeTool() call so it can capture
 * the args.return_screenshot flag — it accepts an optional tab
 * override for the new_tab / close_tab paths where the focus moved
 * before screenshot time.
 */
export interface WebToolCtx {
  chrome: ChromeSession;
  tab: string | number;
  logger: EvidenceLogger;
  takeReturnScreenshot: (tabOverride?: string | number) => Promise<ScreenshotResult>;
  /**
   * The run's context root (WebAdapterOptions.contextRoot), or null when
   * none was configured. CR-032: file_upload resolves each requested path
   * against this root via resolveInside() — the same containment every
   * other file-touching tool (install_cookies, install_passkey) already
   * goes through — instead of handing an LLM-chosen absolute path straight
   * to DOM.setFileInputFiles.
   */
  contextRoot: string | null;
}
