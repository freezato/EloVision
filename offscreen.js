'use strict';

const CSE_MAIA_HEARTBEAT_MS = 20 * 1000;
const cseMaiaEngines = new Map();
let cseMaiaPort = null;
let cseMaiaReconnectTimer = null;
let cseMaiaReconnectAttempt = 0;
let cseMaiaHeartbeatTimer = null;

function cseSyncMaiaHeartbeat() {
  const shouldRun = !!(cseMaiaPort && cseMaiaEngines.size);
  if (!shouldRun && cseMaiaHeartbeatTimer) {
    clearInterval(cseMaiaHeartbeatTimer);
    cseMaiaHeartbeatTimer = null;
    return;
  }
  if (shouldRun && !cseMaiaHeartbeatTimer) {
    cseMaiaHeartbeatTimer = setInterval(() => {
      const port = cseMaiaPort;
      if (!port || !cseMaiaEngines.size) return cseSyncMaiaHeartbeat();
      try { port.postMessage({ type: 'heartbeat' }); } catch {}
    }, CSE_MAIA_HEARTBEAT_MS);
  }
}

function cseScheduleMaiaReconnect() {
  if (cseMaiaPort || cseMaiaReconnectTimer) return;
  const delay = Math.min(2000, 150 * (2 ** Math.min(cseMaiaReconnectAttempt, 4)));
  cseMaiaReconnectAttempt += 1;
  cseMaiaReconnectTimer = setTimeout(() => {
    cseMaiaReconnectTimer = null;
    cseConnectMaiaPort();
  }, delay);
}

function cseConnectMaiaPort() {
  if (cseMaiaPort) return cseMaiaPort;

  let port;
  try {
    port = chrome.runtime.connect({ name: 'cse-maia-offscreen' });
  } catch {
    cseScheduleMaiaReconnect();
    return null;
  }

  cseMaiaPort = port;
  cseMaiaReconnectAttempt = 0;
  port.onMessage.addListener(cseHandleMaiaPortMessage);
  port.onDisconnect.addListener(() => {
    if (cseMaiaPort !== port) return;
    const hadActiveEngines = cseMaiaEngines.size > 0;
    cseMaiaPort = null;
    for (const clientId of Array.from(cseMaiaEngines.keys())) cseStopMaiaEngine(clientId);
    cseSyncMaiaHeartbeat();
    if (hadActiveEngines) cseScheduleMaiaReconnect();
  });
  cseSyncMaiaHeartbeat();
  return port;
}

function cseSendMaia(clientId, message) {
  const port = cseMaiaPort;
  if (!port) return false;
  try {
    port.postMessage({ clientId, message });
    return true;
  } catch {
    if (cseMaiaPort === port) {
      cseMaiaPort = null;
      cseSyncMaiaHeartbeat();
      cseScheduleMaiaReconnect();
    }
    return false;
  }
}

function cseCreateMaiaEngine(clientId) {
  const worker = new Worker(
    chrome.runtime.getURL('modules/maia/maia.js'),
    { type: 'module', name: 'cse-maia-' + clientId }
  );

  worker.onmessage = event => {
    cseSendMaia(clientId, { type: 'message', data: event.data });
  };
  worker.onerror = event => {
    const message = event?.message || 'Maia module worker error';
    console.error('[CSE][Maia offscreen]', message, event);
    cseSendMaia(clientId, { type: 'error', message });
    cseStopMaiaEngine(clientId, worker);
  };
  worker.onmessageerror = () => {
    cseSendMaia(clientId, { type: 'error', message: 'Maia worker message could not be decoded' });
    cseStopMaiaEngine(clientId, worker);
  };

  cseMaiaEngines.set(clientId, worker);
  cseSyncMaiaHeartbeat();
  return worker;
}

function cseStopMaiaEngine(clientId, expectedWorker = null) {
  const worker = cseMaiaEngines.get(clientId);
  if (!worker || (expectedWorker && worker !== expectedWorker)) return;
  try { worker.terminate(); } catch {}
  cseMaiaEngines.delete(clientId);
  cseSyncMaiaHeartbeat();
}

function cseHandleMaiaPortMessage(payload) {
  const clientId = payload?.clientId;
  const message = payload?.message;
  if (!clientId || !message) return;

  if (message.type === 'terminate') {
    cseStopMaiaEngine(clientId);
    return;
  }
  if (message.type !== 'command') return;

  try {
    const worker = cseMaiaEngines.get(clientId) || cseCreateMaiaEngine(clientId);
    worker.postMessage(message.data);
  } catch (error) {
    const detail = error?.message || String(error);
    console.error('[CSE][Maia offscreen] Unable to start engine:', detail);
    cseSendMaia(clientId, { type: 'error', message: detail });
    cseStopMaiaEngine(clientId);
  }
}

cseConnectMaiaPort();
