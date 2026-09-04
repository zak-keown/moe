import { chromeHttpAt } from './chrome-launcher-helpers.mjs';

function attachTabs({ state, _chromeHttp }) {
  const CHROME_DEBUG_HOST = state.hostOverride.getHost();
  const { rewriteWsUrl } = state;

  async function chromeHttp(httpPath, method = 'GET') {
    if (_chromeHttp) return _chromeHttp(httpPath, method);
    return chromeHttpAt(CHROME_DEBUG_HOST, state.activePort, httpPath, method);
  }

  async function resolveWsUrl(wsUrlOrIndex) {
    if (typeof wsUrlOrIndex === 'string' && wsUrlOrIndex.startsWith('ws://')) {
      return rewriteWsUrl(wsUrlOrIndex, CHROME_DEBUG_HOST, state.activePort);
    }

    const index = typeof wsUrlOrIndex === 'number' ? wsUrlOrIndex : parseInt(wsUrlOrIndex);
    if (!isNaN(index)) {
      const tabs = await chromeHttp('/json');
      if (!Array.isArray(tabs)) {
        throw new Error('Chrome DevTools returned an invalid response — is Chrome running?');
      }
      const pageTabs = tabs.filter(t => t.type === 'page');

      if (pageTabs.length === 0) {
        const newTabInfo = await newTab();
        return newTabInfo.webSocketDebuggerUrl;
      }

      if (index < 0 || index >= pageTabs.length) {
        throw new Error(`Tab index ${index} out of range (0-${pageTabs.length - 1})`);
      }
      return pageTabs[index].webSocketDebuggerUrl;
    }

    throw new Error(`Invalid tab specifier: ${wsUrlOrIndex}`);
  }

  async function getTabs() {
    const tabs = await chromeHttp('/json');
    if (!Array.isArray(tabs)) {
      return [];
    }
    return tabs
      .filter(tab => tab.type === 'page')
      .map(tab => ({
        ...tab,
        webSocketDebuggerUrl: rewriteWsUrl(tab.webSocketDebuggerUrl, CHROME_DEBUG_HOST, state.activePort)
      }));
  }

  async function newTab(url = 'about:blank') {
    const encoded = encodeURIComponent(url);
    const tab = await chromeHttp(`/json/new?${encoded}`, 'PUT');
    if (tab && typeof tab === 'object') {
      tab.webSocketDebuggerUrl = rewriteWsUrl(tab.webSocketDebuggerUrl, CHROME_DEBUG_HOST, state.activePort);
    }
    return tab;
  }

  async function closeTab(tabIndexOrWsUrl) {
    const wsUrl = await resolveWsUrl(tabIndexOrWsUrl);
    const tabs = await chromeHttp('/json');
    if (!Array.isArray(tabs)) return;
    const tab = tabs.find(t => t.webSocketDebuggerUrl === wsUrl);
    if (tab) {
      await state.pageSessionResolver?.release(tab.id);
      await chromeHttp(`/json/close/${tab.id}`, 'GET');
    }
  }

  return { chromeHttp, resolveWsUrl, getTabs, newTab, closeTab };
}

function createPageSessionResolver({ bridge }) {
  const cache = new Map();
  async function resolve(tab) {
    if (!tab || !tab.id) throw new Error('createPageSessionResolver: tab.id is required');
    const cached = cache.get(tab.id);
    if (cached) return cached;
    const ps = await bridge.attachPageSession(tab.id);
    cache.set(tab.id, ps);
    return ps;
  }
  resolve.release = async (tabId) => {
    const ps = cache.get(tabId);
    if (!ps) return;
    cache.delete(tabId);
    try { await ps.detach(); } catch { /* best-effort */ }
  };
  resolve.prime = (targetId, ps) => {
    if (!cache.has(targetId)) cache.set(targetId, ps);
  };
  resolve.peek = (tabId) => cache.get(tabId) || null;
  resolve.releaseAll = () => { cache.clear(); };
  return resolve;
}

export { attachTabs, createPageSessionResolver };
