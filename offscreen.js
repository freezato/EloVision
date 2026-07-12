'use strict';

const cseMaiaPort = chrome.runtime.connect({ name: 'cse-maia-offscreen' });
const cseMaiaEngines = new Map();

function cseSendMaia(clientId, message) {
  try {
    cseMaiaPort.postMessage({ clientId, message });
  } catch {}
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
  };
  worker.onmessageerror = () => {
    cseSendMaia(clientId, { type: 'error', message: 'Maia worker message could not be decoded' });
  };

  cseMaiaEngines.set(clientId, worker);
  return worker;
}

function cseStopMaiaEngine(clientId) {
  const worker = cseMaiaEngines.get(clientId);
  if (!worker) return;
  try { worker.terminate(); } catch {}
  cseMaiaEngines.delete(clientId);
}

cseMaiaPort.onMessage.addListener(payload => {
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
});

cseMaiaPort.onDisconnect.addListener(() => {
  for (const clientId of cseMaiaEngines.keys()) cseStopMaiaEngine(clientId);
});
