import { getElementSelector } from './element-selector.mjs';
import { throwIfExceptionDetails } from './cdp-utils.mjs';
import { tryHandleDialogSelectorForSession } from './dialogs-router.mjs';

const DRAG_SETTLE_MS = 50;

function defaultRng() {
  return Math.random();
}

function bezierPoints(x0, y0, x1, y1, n, rng) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const perpScale = (0.05 + rng() * 0.20) * dist;
  const perpX = dist > 0 ? (-dy / dist) * perpScale : 0;
  const perpY = dist > 0 ? (dx / dist) * perpScale : 0;
  const cx = mx + perpX;
  const cy = my + perpY;

  const points = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    points.push({
      x: Math.round(u * u * x0 + 2 * u * t * cx + t * t * x1),
      y: Math.round(u * u * y0 + 2 * u * t * cy + t * t * y1),
    });
  }
  return points;
}

function easeWeight(i, n) {
  return Math.sin((i / n) * Math.PI);
}

function attachMouse({ getPageSession, dialogs, _rng }) {
  const lastMousePos = { x: 0, y: 0 };
  const rng = typeof _rng === 'function' ? _rng : defaultRng;

  async function humanMouseMove(ps, fromX, fromY, toX, toY, extraParams = {}) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const steps = Math.min(120, Math.max(10, Math.round(dist / 15)));
    const totalMs = Math.min(400, Math.max(30, (dist / 200) * 80));

    const weights = Array.from({ length: steps }, (_, i) => easeWeight(i + 1, steps));
    const weightSum = weights.reduce((a, b) => a + b, 0);

    const points = bezierPoints(fromX, fromY, toX, toY, steps, rng);

    for (let i = 0; i < steps; i++) {
      const { x, y } = i === steps - 1
        ? { x: Math.round(toX), y: Math.round(toY) }
        : points[i];

      await ps.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
        ...extraParams,
      });

      const baseDuration = (weights[i] / weightSum) * totalMs;
      const jitter = 1 + (rng() * 0.2 - 0.1);
      const delayMs = Math.round(baseDuration * jitter);
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    lastMousePos.x = Math.round(toX);
    lastMousePos.y = Math.round(toY);
  }

  async function resolveCenter(ps, selector, label = 'Element') {
    const js = `
      (() => {
        const el = ${getElementSelector(selector)};
        if (!el) return { found: false };
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return { found: false, zeroRect: true };
        }
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          found: true
        };
      })()
    `;
    const result = await ps.send('Runtime.evaluate', {
      expression: js,
      returnByValue: true
    });
    throwIfExceptionDetails(result);
    if (!result.result.value || !result.result.value.found) {
      const zeroRect = result.result.value && result.result.value.zeroRect;
      throw new Error(
        zeroRect
          ? `${label} has a zero-size bounding rect (hidden?): ${selector}`
          : `${label} not found: ${selector}`
      );
    }
    return { x: result.result.value.x, y: result.result.value.y };
  }

  async function click(tabIndexOrWsUrl, selector) {
    const ps = await getPageSession(tabIndexOrWsUrl);

    if (selector && selector.startsWith('dialog::') && dialogs) {
      const state = dialogs.getOpen(ps.sessionId);
      const routed = await tryHandleDialogSelectorForSession({ selector, op: 'click', state, pageSession: ps });
      if (routed.handled) {
        if (routed.error) throw new Error(routed.error);
        if (routed.clearDialog) dialogs.clear(ps.sessionId);
        return routed.result;
      }
    }

    try {
      const { x, y } = await resolveCenter(ps, selector);

      await humanMouseMove(ps, lastMousePos.x, lastMousePos.y, x, y);

      await ps.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x, y, button: 'left', clickCount: 1
      });
      await ps.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x, y, button: 'left', clickCount: 1
      });

      return { clicked: true, x, y };
    } catch (_e) {
      if (dialogs && dialogs.getOpen && dialogs.getOpen(ps.sessionId)) {
        throw _e;
      }
      const js = `(() => {
        const _el = ${getElementSelector(selector)};
        if (!_el) return { found: false };
        _el.click();
        return { found: true };
      })()`;
      const fallbackResult = await ps.send('Runtime.evaluate', {
        expression: js,
        returnByValue: true,
      });
      throwIfExceptionDetails(fallbackResult);
      if (!fallbackResult.result.value || !fallbackResult.result.value.found) {
        throw new Error(`Element not found: ${selector}`);
      }
      return { clicked: true, fallback: true };
    }
  }

  async function hover(tabIndexOrWsUrl, selector) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const { x, y } = await resolveCenter(ps, selector);

    await humanMouseMove(ps, lastMousePos.x, lastMousePos.y, x, y);

    return { hovered: true, x, y };
  }

  async function drag(tabIndexOrWsUrl, sourceSelector, target, options = {}) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const steps = options.steps || 8;

    const src = await resolveCenter(ps, sourceSelector, 'Source element');

    let dst;
    if (typeof target === 'object' && target.x !== undefined && target.y !== undefined) {
      dst = { x: target.x, y: target.y };
    } else {
      dst = await resolveCenter(ps, target, 'Target element');
    }

    await ps.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: src.x, y: src.y, button: 'left', clickCount: 1
    });

    for (let i = 1; i <= steps; i++) {
      const ratio = i / steps;
      await ps.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(src.x + (dst.x - src.x) * ratio),
        y: Math.round(src.y + (dst.y - src.y) * ratio),
        button: 'left'
      });
    }

    await new Promise(resolve => setTimeout(resolve, DRAG_SETTLE_MS));

    await ps.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: Math.round(dst.x),
      y: Math.round(dst.y),
      button: 'left',
      clickCount: 1
    });

    return { dragged: true, from: { x: src.x, y: src.y }, to: { x: dst.x, y: dst.y }, steps };
  }

  async function mouseMove(tabIndexOrWsUrl, x, y, options = {}) {
    const ps = await getPageSession(tabIndexOrWsUrl);

    const fromX = options.fromX !== undefined ? options.fromX : lastMousePos.x;
    const fromY = options.fromY !== undefined ? options.fromY : lastMousePos.y;

    await humanMouseMove(ps, fromX, fromY, x, y);

    return { moved: true, x, y };
  }

  async function scroll(tabIndexOrWsUrl, options = {}) {
    const ps = await getPageSession(tabIndexOrWsUrl);

    let x = options.x || 100;
    let y = options.y || 100;

    if (options.selector) {
      const js = `
        (() => {
          const el = ${getElementSelector(options.selector)};
          if (!el) return { found: false };
          const rect = el.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            found: true
          };
        })()
      `;
      const result = await ps.send('Runtime.evaluate', {
        expression: js,
        returnByValue: true
      });
      throwIfExceptionDetails(result);
      if (result.result.value && result.result.value.found) {
        x = result.result.value.x;
        y = result.result.value.y;
      }
    }

    await ps.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: Math.round(x),
      y: Math.round(y),
      deltaX: options.deltaX || 0,
      deltaY: options.deltaY || 0
    });

    return { scrolled: true, x, y, deltaX: options.deltaX || 0, deltaY: options.deltaY || 0 };
  }

  async function doubleClick(tabIndexOrWsUrl, selector) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const { x, y } = await resolveCenter(ps, selector);

    await humanMouseMove(ps, lastMousePos.x, lastMousePos.y, x, y);

    await ps.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', clickCount: 1
    });
    await ps.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', clickCount: 1
    });
    await ps.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', clickCount: 2
    });
    await ps.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', clickCount: 2
    });

    return { doubleClicked: true, x, y };
  }

  async function rightClick(tabIndexOrWsUrl, selector) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const { x, y } = await resolveCenter(ps, selector);

    await humanMouseMove(ps, lastMousePos.x, lastMousePos.y, x, y);

    await ps.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'right', clickCount: 1
    });
    await ps.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'right', clickCount: 1
    });

    return { rightClicked: true, x, y };
  }

  return { click, hover, drag, mouseMove, scroll, doubleClick, rightClick };
}

export { attachMouse };
