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

let cseMaiaCreatingOffscreen = null;

async function cseHasMaiaOffscreen() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    });
    return contexts.length > 0;
  }

  if (typeof clients !== 'undefined' && typeof clients.matchAll === 'function') {
    const matchedClients = await clients.matchAll();
    return matchedClients.some(client => client.url === offscreenUrl);
  }

  return false;
}

async function cseEnsureMaiaOffscreen() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error('chrome.offscreen API unavailable');
  }
  if (await cseHasMaiaOffscreen()) return;

  if (!cseMaiaCreatingOffscreen) {
    cseMaiaCreatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Run the bundled local Maia LC0 WebAssembly engine.',
    }).finally(() => {
      cseMaiaCreatingOffscreen = null;
    });
  }
  await cseMaiaCreatingOffscreen;
}

function cseForwardMaia(payload) {
  if (cseMaiaOffscreenPort) cseMaiaOffscreenPort.postMessage(payload);
  else cseMaiaQueue.push(payload);
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'cse-maia-offscreen') {
    cseMaiaOffscreenPort = port;
    while (cseMaiaQueue.length) port.postMessage(cseMaiaQueue.shift());
    port.onMessage.addListener(payload => {
      const client = cseMaiaClients.get(payload?.clientId);
      if (client) client.postMessage(payload.message);
    });
    port.onDisconnect.addListener(() => {
      cseMaiaOffscreenPort = null;
      for (const client of cseMaiaClients.values()) {
        try { client.postMessage({ type: 'error', message: 'Maia offscreen engine disconnected' }); } catch {}
      }
    });
    return;
  }
  if (port.name !== 'cse-maia-client') return;

  const clientId = 'maia-' + (++cseMaiaClientSeq);
  cseMaiaClients.set(clientId, port);
  cseEnsureMaiaOffscreen().catch(error => {
    try { port.postMessage({ type: 'error', message: error?.message || String(error) }); } catch {}
  });

  port.onMessage.addListener(message => cseForwardMaia({ clientId, message }));
  port.onDisconnect.addListener(() => {
    cseMaiaClients.delete(clientId);
    cseForwardMaia({ clientId, message: { type: 'terminate' } });
  });
});
