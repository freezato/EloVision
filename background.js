const csePendingFetchByKey = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'cse-fetch-json' || typeof message.url !== 'string') {
    return;
  }

  const headers = (message.headers && typeof message.headers === 'object')
    ? message.headers
    : { Accept: 'application/json' };
  const abortKey = typeof message.abortKey === 'string' && message.abortKey.trim()
    ? message.abortKey.trim()
    : null;
  const timeoutMs = Number.isFinite(message.timeoutMs) ? Math.max(0, Math.round(message.timeoutMs)) : 0;

  let controller = null;
  let timeoutId = null;
  if (abortKey) {
    const previous = csePendingFetchByKey.get(abortKey);
    if (previous) {
      try { previous.abort(); } catch {}
    }
    controller = new AbortController();
    csePendingFetchByKey.set(abortKey, controller);
  }
  if (controller && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, timeoutMs);
  }

  fetch(message.url, { method: 'GET', headers, signal: controller?.signal })
    .then(async (res) => {
      let data = null;
      let text = '';
      try {
        text = await res.text();
        if (text) data = JSON.parse(text);
      } catch {}

      sendResponse({
        ok: res.ok,
        status: res.status,
        data,
      });
    })
    .catch((err) => {
      sendResponse({
        ok: false,
        status: 0,
        aborted: err?.name === 'AbortError',
        error: err?.message || String(err),
      });
    })
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
      if (abortKey && csePendingFetchByKey.get(abortKey) === controller) {
        csePendingFetchByKey.delete(abortKey);
      }
    });

  return true;
});


const cseMaiaClients = new Map();
let cseMaiaOffscreenPort = null;
let cseMaiaClientSeq = 0;
const cseMaiaQueue = [];
const cseMaiaOffscreenWaiters = new Set();
const CSE_MAIA_OFFSCREEN_CONNECT_TIMEOUT_MS = 1800;
const CSE_MAIA_MAX_QUEUED_COMMANDS_PER_CLIENT = 32;
let cseMaiaEnsureOffscreenPromise = null;

async function cseHasMaiaOffscreen() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    });
    return contexts.length > 0;
  }

  if (typeof chrome.offscreen?.hasDocument === 'function') {
    return chrome.offscreen.hasDocument();
  }

  if (typeof clients !== 'undefined' && typeof clients.matchAll === 'function') {
    const matchedClients = await clients.matchAll();
    return matchedClients.some(client => client.url === offscreenUrl);
  }

  return false;
}

function cseWaitForMaiaOffscreenPort(timeoutMs = CSE_MAIA_OFFSCREEN_CONNECT_TIMEOUT_MS) {
  if (cseMaiaOffscreenPort) return Promise.resolve(cseMaiaOffscreenPort);

  return new Promise(resolve => {
    const waiter = { resolve, timeoutId: 0 };
    waiter.timeoutId = setTimeout(() => {
      cseMaiaOffscreenWaiters.delete(waiter);
      resolve(null);
    }, timeoutMs);
    cseMaiaOffscreenWaiters.add(waiter);
  });
}

function cseResolveMaiaOffscreenWaiters(port) {
  for (const waiter of cseMaiaOffscreenWaiters) {
    clearTimeout(waiter.timeoutId);
    waiter.resolve(port);
  }
  cseMaiaOffscreenWaiters.clear();
}

async function cseCreateMaiaOffscreen() {
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Run the bundled local Maia LC0 WebAssembly engine.',
  });
}

async function cseEnsureMaiaOffscreenImpl() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error('chrome.offscreen API unavailable');
  }
  if (cseMaiaOffscreenPort) return cseMaiaOffscreenPort;

  if (!await cseHasMaiaOffscreen()) {
    await cseCreateMaiaOffscreen();
  }

  let port = await cseWaitForMaiaOffscreenPort();
  if (port) return port;

  // An offscreen document can outlive the MV3 service worker that created it.
  // If it did not reconnect, replace that orphan instead of queueing forever.
  if (cseMaiaOffscreenPort) return cseMaiaOffscreenPort;
  if (typeof chrome.offscreen.closeDocument === 'function' && await cseHasMaiaOffscreen()) {
    try { await chrome.offscreen.closeDocument(); } catch {}
  }
  if (!await cseHasMaiaOffscreen()) {
    await cseCreateMaiaOffscreen();
  }

  port = await cseWaitForMaiaOffscreenPort();
  if (!port) throw new Error('Maia offscreen document did not connect');
  return port;
}

function cseEnsureMaiaOffscreen() {
  if (cseMaiaOffscreenPort) return Promise.resolve(cseMaiaOffscreenPort);
  if (cseMaiaEnsureOffscreenPromise) return cseMaiaEnsureOffscreenPromise;

  const promise = cseEnsureMaiaOffscreenImpl().finally(() => {
    if (cseMaiaEnsureOffscreenPromise === promise) cseMaiaEnsureOffscreenPromise = null;
  });
  cseMaiaEnsureOffscreenPromise = promise;
  return promise;
}

function csePurgeQueuedMaiaClient(clientId) {
  for (let i = cseMaiaQueue.length - 1; i >= 0; i--) {
    if (cseMaiaQueue[i]?.clientId === clientId) cseMaiaQueue.splice(i, 1);
  }
}

function cseQueueMaia(payload) {
  if (!cseMaiaClients.has(payload?.clientId)) return;
  let queuedForClient = 0;
  for (const item of cseMaiaQueue) {
    if (item?.clientId === payload.clientId) queuedForClient += 1;
  }
  if (queuedForClient >= CSE_MAIA_MAX_QUEUED_COMMANDS_PER_CLIENT) {
    const oldest = cseMaiaQueue.findIndex(item => item?.clientId === payload.clientId);
    if (oldest >= 0) cseMaiaQueue.splice(oldest, 1);
  }
  cseMaiaQueue.push(payload);
}

function cseFlushMaiaQueue() {
  const port = cseMaiaOffscreenPort;
  if (!port) return;

  while (cseMaiaQueue.length && cseMaiaOffscreenPort === port) {
    const payload = cseMaiaQueue.shift();
    if (!cseMaiaClients.has(payload?.clientId)) continue;
    try {
      port.postMessage(payload);
    } catch {
      cseMaiaQueue.unshift(payload);
      if (cseMaiaOffscreenPort === port) cseMaiaOffscreenPort = null;
      try { port.disconnect(); } catch {}
      break;
    }
  }
}

function cseForwardMaia(payload) {
  if (!cseMaiaClients.has(payload?.clientId)) return;
  const port = cseMaiaOffscreenPort;
  if (port) {
    try {
      port.postMessage(payload);
      return;
    } catch {
      if (cseMaiaOffscreenPort === port) cseMaiaOffscreenPort = null;
      try { port.disconnect(); } catch {}
    }
  }

  cseQueueMaia(payload);
  cseEnsureMaiaOffscreen().catch(error => {
    const client = cseMaiaClients.get(payload.clientId);
    if (client) {
      try { client.postMessage({ type: 'error', message: error?.message || String(error) }); } catch {}
    }
  });
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'cse-maia-offscreen') {
    const previousPort = cseMaiaOffscreenPort;
    cseMaiaOffscreenPort = port;
    cseResolveMaiaOffscreenWaiters(port);
    port.onMessage.addListener(payload => {
      if (payload?.type === 'heartbeat') return;
      const client = cseMaiaClients.get(payload?.clientId);
      if (client) {
        try { client.postMessage(payload.message); } catch {}
      }
    });
    port.onDisconnect.addListener(() => {
      if (cseMaiaOffscreenPort !== port) return;
      cseMaiaOffscreenPort = null;
      for (const client of cseMaiaClients.values()) {
        try { client.postMessage({ type: 'error', message: 'Maia offscreen engine disconnected' }); } catch {}
      }
    });
    cseFlushMaiaQueue();
    if (previousPort && previousPort !== port) {
      try { previousPort.disconnect(); } catch {}
    }
    return;
  }
  if (port.name !== 'cse-maia-client') return;

  const clientId = 'maia-' + (++cseMaiaClientSeq);
  cseMaiaClients.set(clientId, port);
  cseEnsureMaiaOffscreen().catch(error => {
    try { port.postMessage({ type: 'error', message: error?.message || String(error) }); } catch {}
  });

  port.onMessage.addListener(message => {
    if (message?.type === 'ping') {
      try { port.postMessage({ type: 'pong' }); } catch {}
      return;
    }
    cseForwardMaia({ clientId, message });
  });
  port.onDisconnect.addListener(() => {
    cseMaiaClients.delete(clientId);
    csePurgeQueuedMaiaClient(clientId);
    const offscreenPort = cseMaiaOffscreenPort;
    if (offscreenPort) {
      try { offscreenPort.postMessage({ clientId, message: { type: 'terminate' } }); } catch {}
    }
  });
});
