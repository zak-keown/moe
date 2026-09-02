const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const { getElementSelector } = require('./element-selector');
const { throwIfExceptionDetails } = require('./cdp-utils');

// Auto-downscale cap so screenshots fit Claude's many-image mode size limit
// (max 2000px). Headroom of 200px keeps us safely under.
const MAX_IMAGE_DIMENSION_PX = 1800;

/**
 * Page / element / full-page screenshots via CDP Page.captureScreenshot,
 * with auto-downscaling so the resulting PNG fits Claude's many-image mode
 * size limit (max dimension 2000 — we cap at 1800 for headroom).
 *
 * Three clip modes, picked from the args:
 *   - `fullPage: true` — Page.getLayoutMetrics → captureBeyondViewport
 *   - `selector` set — element's getBoundingClientRect
 *   - default — explicit viewport clip from window.innerWidth/Height
 *
 * The default-viewport clip is load-bearing on Linux: without it Chrome
 * uses its internal DPI-scaled dimensions, which produces oversized
 * screenshots on HiDPI displays (Xft.dpi:144 etc).
 *
 * Downscaling is best-effort and platform-specific (sips on macOS,
 * ImageMagick on Linux, no-op on Windows). Failures are silent — better
 * to have a big PNG than no PNG.
 *
 * Path resolution for user-supplied filenames (CR-065 — a filename is a
 * tool argument, so this is a containment boundary, not just a convenience):
 *   - Every resolved path (absolute or relative) MUST land under the
 *     containment root — the session directory, or CWD when no session
 *     context is available. Anything that would resolve outside it (an
 *     absolute path elsewhere, or enough `../` segments) is rejected with
 *     an error rather than written. If no session directory exists yet,
 *     `initializeSession()` is called to create one.
 *   - No filename supplied → auto-generates a timestamped name in the root.
 *   - A pre-existing file the current session did not itself write is
 *     never overwritten; reusing a name this session already wrote to
 *     (e.g. a repeatedly-refreshed "latest.png") is fine.
 *
 * `attachScreenshot({ getPageSession, state, initializeSession })` returns
 * the bound action. `state` and `initializeSession` are optional; when
 * absent, the containment root is CWD (legacy behaviour).
 */
function attachScreenshot({ getPageSession, state, initializeSession }) {
  async function downscaleImageIfNeeded(filepath, maxDimension = MAX_IMAGE_DIMENSION_PX) {
    const platform = os.platform();

    try {
      let width, height;

      if (platform === 'darwin') {
        const output = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filepath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const widthMatch = output.match(/pixelWidth:\s*(\d+)/);
        const heightMatch = output.match(/pixelHeight:\s*(\d+)/);
        width = widthMatch ? parseInt(widthMatch[1]) : 0;
        height = heightMatch ? parseInt(heightMatch[1]) : 0;
      } else if (platform === 'linux') {
        try {
          const output = execFileSync('identify', ['-format', '%w %h', filepath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
          [width, height] = output.trim().split(' ').map(Number);
        } catch {
          // ImageMagick not available — skip downscaling.
          return;
        }
      } else {
        // Windows: no shipped downscale path.
        return;
      }

      if (width <= maxDimension && height <= maxDimension) {
        return;
      }

      if (platform === 'darwin') {
        execFileSync('sips', ['-Z', String(maxDimension), filepath], { stdio: 'ignore' });
      } else if (platform === 'linux') {
        execFileSync('convert', [filepath, '-resize', `${maxDimension}x${maxDimension}>`, filepath], { stdio: 'ignore' });
      }
    } catch (_e) {
      // Better to ship a too-big PNG than none.
    }
  }

  // Screenshot paths this session has itself written, keyed by resolved
  // absolute path. A caller reusing the same filename across calls within a
  // session (a common convenience pattern — "latest.png" overwritten each
  // time) stays allowed; a pre-existing file this session never wrote to is
  // protected from being silently clobbered by a filename collision or a
  // caller-chosen name that happens to match something already there
  // (CR-065).
  const writtenBySession = new Set();

  // Determine the containment root every screenshot path must resolve
  // under: the session dir when one is available (the real MCP/CLI path
  // always provides one), otherwise CWD.
  function containmentRoot() {
    if (initializeSession) return initializeSession();
    if (state && state.sessionDir) return state.sessionDir;
    return process.cwd();
  }

  // Canonicalize through the filesystem when possible (falls back to plain
  // path.resolve for a path that doesn't exist, e.g. the file we're about
  // to create) — used ONLY for the containment comparison inside
  // resolveScreenshotPath below, never for the path actually
  // returned/written. Needed because containment would otherwise compare
  // two spellings of the SAME directory as plain strings: on macOS,
  // os.tmpdir()/session dirs live under /var, a symlink to /private/var,
  // and process.cwd() after a chdir into one returns the resolved
  // /private/var form. Comparing those textually makes path.relative
  // produce a spurious ".." and falsely reject a legitimate same-directory
  // write.
  function realpathOrResolve(p) {
    try { return fs.realpathSync(p); } catch { return path.resolve(p); }
  }

  /**
   * Resolve a user-supplied filename to an absolute path, contained within
   * `containmentRoot()`.
   *
   * - Falsy (null / undefined / '') → auto-generated name in the root.
   * - Absolute or relative → resolved, then REQUIRED to stay under the
   *   root. `..` segments or an absolute path pointing elsewhere are
   *   rejected outright rather than silently honoured — a filename is a
   *   tool argument, so without this any file the MCP process can write is
   *   destroyable by one screenshot call (e.g. `../../../.zshrc`, or an
   *   absolute path to any file at all).
   */
  function resolveScreenshotPath(filename) {
    const root = containmentRoot();
    const resolvedRoot = path.resolve(root);

    if (!filename) {
      // Auto-generated name — always inside the root by construction.
      return path.join(resolvedRoot, `screenshot-${Date.now()}.png`);
    }

    const candidate = path.isAbsolute(filename)
      ? path.resolve(filename)
      : path.resolve(resolvedRoot, filename);

    // Canonicalize both sides for the containment check only (see
    // realpathOrResolve above) — canonicalize the candidate's (existing)
    // directory, then reattach the basename, since the file itself may not
    // exist yet.
    const canonicalRoot = realpathOrResolve(resolvedRoot);
    const canonicalCandidate = path.join(realpathOrResolve(path.dirname(candidate)), path.basename(candidate));

    const relative = path.relative(canonicalRoot, canonicalCandidate);
    const escapesRoot = relative !== '' && (relative.startsWith('..') || path.isAbsolute(relative));
    if (escapesRoot) {
      throw new Error(
        `Refusing to write screenshot outside the session directory: "${filename}" resolves to ` +
        `"${candidate}", which is not under "${resolvedRoot}".`
      );
    }
    return candidate;
  }

  async function screenshot(tabIndexOrWsUrl, filename, selector = null, fullPage = false) {
    const resolvedFilename = resolveScreenshotPath(filename);
    if (fs.existsSync(resolvedFilename) && !writtenBySession.has(resolvedFilename)) {
      throw new Error(
        `Refusing to overwrite existing file this session did not create: "${resolvedFilename}". ` +
        `Choose a different filename.`
      );
    }
    const pageSession = await getPageSession(tabIndexOrWsUrl);

    let clip;
    if (fullPage) {
      const metrics = await pageSession.send('Page.getLayoutMetrics');
      const { width, height } = metrics.contentSize;
      clip = { x: 0, y: 0, width, height, scale: 1 };
    } else if (selector) {
      const js = `
        (() => {
          const el = ${getElementSelector(selector)};
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            scale: 1
          };
        })()
      `;
      const result = await pageSession.send('Runtime.evaluate', {
        expression: js,
        returnByValue: true
      });
      throwIfExceptionDetails(result);
      clip = result.result.value;
    } else {
      // Explicit viewport clip — required for correct sizing on Linux HiDPI.
      const vpResult = await pageSession.send('Runtime.evaluate', {
        expression: '({ width: window.innerWidth, height: window.innerHeight })',
        returnByValue: true
      });
      throwIfExceptionDetails(vpResult);
      const { width, height } = vpResult.result.value;
      clip = { x: 0, y: 0, width, height, scale: 1 };
    }

    const result = await pageSession.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: fullPage,
      clip
    });

    const buffer = Buffer.from(result.data, 'base64');
    fs.writeFileSync(resolvedFilename, buffer);
    writtenBySession.add(resolvedFilename);

    await downscaleImageIfNeeded(resolvedFilename, MAX_IMAGE_DIMENSION_PX);

    return resolvedFilename;
  }

  return { screenshot };
}

module.exports = { attachScreenshot };
