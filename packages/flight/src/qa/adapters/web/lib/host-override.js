// Forked from https://github.com/obra/superpowers-chrome
// Original author: Jesse Vincent
//
// Each Chrome session owns one override instance. Keeping endpoint state here,
// instead of at module scope, prevents concurrent web runs from overwriting
// one another.

const DEFAULT_PORT = 9222;
const DEFAULT_HOST = '127.0.0.1';

// Defaults: if neither `host` nor `port` is supplied, the instance seeds
// from process.env.CHROME_WS_HOST / CHROME_WS_PORT. If either is supplied,
// both are taken from the arguments and `overrideEnabled` is set to true.
// The returned API is:
// `{ getHost, getPort, getBase, isOverrideEnabled, rewriteWsUrl, setDefaults }`.
function createOverride({ host, port } = {}) {
  let instanceHost;
  let instancePort;
  let instanceOverrideEnabled;

  if (host !== undefined || port !== undefined) {
    instanceHost = host !== undefined ? host : DEFAULT_HOST;
    instancePort = port !== undefined ? port : DEFAULT_PORT;
    instanceOverrideEnabled = true;
  } else {
    instanceHost = process.env.CHROME_WS_HOST || DEFAULT_HOST;
    const parsed = parseInt(process.env.CHROME_WS_PORT || `${DEFAULT_PORT}`, 10);
    instancePort = Number.isNaN(parsed) ? DEFAULT_PORT : parsed;
    instanceOverrideEnabled =
      process.env.CHROME_WS_HOST !== undefined || process.env.CHROME_WS_PORT !== undefined;
  }

  function setDefaults(nextHost, nextPort) {
    instanceHost = nextHost;
    instancePort = nextPort;
    instanceOverrideEnabled = true;
  }

  function getHost() {
    return instanceHost;
  }

  function getPort() {
    return instancePort;
  }

  function getBase() {
    return `http://${instanceHost}:${instancePort}`;
  }

  function isOverrideEnabled() {
    return instanceOverrideEnabled;
  }

  function rewriteWsUrl(originalUrl, overrideHost, overridePort) {
    if (!originalUrl || typeof originalUrl !== 'string') {
      return originalUrl;
    }
    if (!instanceOverrideEnabled) {
      return originalUrl;
    }
    const useHost = overrideHost !== undefined ? overrideHost : instanceHost;
    const usePort = overridePort !== undefined ? overridePort : instancePort;
    try {
      const url = new URL(originalUrl);
      url.hostname = useHost;
      url.port = `${usePort}`;
      return url.toString();
    } catch {
      return originalUrl;
    }
  }

  return {
    setDefaults,
    getHost,
    getPort,
    getBase,
    isOverrideEnabled,
    rewriteWsUrl,
  };
}
module.exports = { createOverride };
