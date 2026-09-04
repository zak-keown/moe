export const MIN_RECONNECT_MS = 500;
export const MAX_RECONNECT_MS = 30000;
export const TOMBSTONE_AFTER_MS = 15000;

export function nextReconnectDelay(current, max) {
	return Math.min(current * 2, max);
}

export const helperScript = `(function() {
  var MIN_RECONNECT_MS = 500;
  var MAX_RECONNECT_MS = 30000;
  var TOMBSTONE_AFTER_MS = 15000;

  function nextReconnectDelay(current, max) {
    return Math.min(current * 2, max);
  }

  if (typeof window === 'undefined') return;

  var ws = null;
  var eventQueue = [];
  var reconnectDelay = MIN_RECONNECT_MS;
  var reconnectTimer = null;
  var disconnectedSince = null;
  var everConnected = false;
  var tombstoneShown = false;

  function sessionKey() {
    try {
      return window.sessionStorage && window.sessionStorage.getItem('brainstorm-session-key');
    } catch (_e) {}
    return null;
  }

  function websocketUrl() {
    var key = sessionKey();
    return 'ws://' + window.location.host + (key ? '/?key=' + encodeURIComponent(key) : '');
  }

  function reloadAfterRecovery() {
    var key = sessionKey();
    if (key) {
      window.location.replace('/?key=' + encodeURIComponent(key));
    } else {
      window.location.reload();
    }
  }

  function setStatus(state) {
    var el = document.querySelector('.status');
    if (!el) return;
    var map = {
      connecting:   ['Connecting\\u2026',   'var(--text-tertiary)'],
      connected:    ['Connected',     'var(--success)'],
      reconnecting: ['Reconnecting\\u2026', 'var(--warning)'],
      disconnected: ['Disconnected',  'var(--error)']
    };
    var entry = map[state] || map.disconnected;
    el.textContent = entry[0];
    el.style.setProperty('--status-color', entry[1]);
  }

  function showTombstone() {
    if (tombstoneShown) return;
    tombstoneShown = true;
    var el = document.createElement('div');
    el.id = 'bs-tombstone';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;' +
      'align-items:center;justify-content:center;padding:2rem;text-align:center;' +
      'background:rgba(20,20,22,0.92);color:#f5f5f7;font-family:system-ui,sans-serif';
    el.innerHTML = '<div style="max-width:480px">' +
      '<h2 style="margin:0 0 .5rem;font-weight:600">Companion paused</h2>' +
      '<p style="margin:0;opacity:.85">This brainstorm companion has stopped. ' +
      'Ask your coding agent to bring it back \\u2014 this page reconnects automatically.</p></div>';
    if (document.body) document.body.appendChild(el);
  }

  function connect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    setStatus(everConnected ? 'reconnecting' : 'connecting');
    ws = new WebSocket(websocketUrl());

    ws.onopen = function() {
      var recovered = tombstoneShown;
      everConnected = true;
      disconnectedSince = null;
      reconnectDelay = MIN_RECONNECT_MS;
      tombstoneShown = false;
      setStatus('connected');
      eventQueue.forEach(function(e) { ws.send(JSON.stringify(e)); });
      eventQueue = [];
      if (recovered) reloadAfterRecovery();
    };

    ws.onmessage = function(msg) {
      var data;
      try { data = JSON.parse(msg.data); } catch (_e) { return; }
      if (data.type === 'reload') window.location.reload();
    };

    ws.onclose = function() {
      ws = null;
      if (disconnectedSince === null) disconnectedSince = Date.now();
      if (Date.now() - disconnectedSince >= TOMBSTONE_AFTER_MS) {
        setStatus('disconnected');
        showTombstone();
      } else {
        setStatus('reconnecting');
      }
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = nextReconnectDelay(reconnectDelay, MAX_RECONNECT_MS);
    };

    ws.onerror = function() { try { ws.close(); } catch (_e) {} };
  }

  function sendEvent(event) {
    event.timestamp = Date.now();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    } else {
      eventQueue.push(event);
    }
  }

  document.addEventListener('click', function(e) {
    var target = e.target.closest('[data-choice]');
    if (!target) return;
    sendEvent({
      type: 'click',
      text: target.textContent.trim(),
      choice: target.dataset.choice,
      id: target.id || null
    });
  });

  window.selectedChoice = null;

  window.toggleSelect = function(el) {
    var container = el.closest('.options') || el.closest('.cards');
    var multi = container && container.dataset.multiselect !== undefined;
    if (container && !multi) {
      container.querySelectorAll('.option, .card').forEach(function(o) { o.classList.remove('selected'); });
    }
    if (multi) {
      el.classList.toggle('selected');
    } else {
      el.classList.add('selected');
    }
    window.selectedChoice = el.dataset.choice;
  };

  window.brainstorm = {
    send: sendEvent,
    choice: function(value, metadata) { sendEvent(Object.assign({ type: 'choice', value: value }, metadata || {})); }
  };

  connect();
})();`;
