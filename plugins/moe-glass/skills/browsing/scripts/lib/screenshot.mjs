import fs from 'node:fs';
import path from 'node:path';
import { execFileSync as defaultExecFileSync } from 'node:child_process';
import os from 'node:os';
import { getElementSelector } from './element-selector.mjs';
import { throwIfExceptionDetails } from './cdp-utils.mjs';

const MAX_IMAGE_DIMENSION_PX = 1800;

function attachScreenshot({ getPageSession, state, initializeSession, execFileSync = defaultExecFileSync }) {
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
          return;
        }
      } else {
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

  const writtenBySession = new Set();

  function containmentRoot() {
    if (initializeSession) return initializeSession();
    if (state && state.sessionDir) return state.sessionDir;
    return process.cwd();
  }

  function realpathOrResolve(p) {
    try { return fs.realpathSync(p); } catch { return path.resolve(p); }
  }

  function resolveScreenshotPath(filename) {
    const root = containmentRoot();
    const resolvedRoot = path.resolve(root);

    if (!filename) {
      return path.join(resolvedRoot, `screenshot-${Date.now()}.png`);
    }

    const candidate = path.isAbsolute(filename)
      ? path.resolve(filename)
      : path.resolve(resolvedRoot, filename);

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

export { attachScreenshot };
