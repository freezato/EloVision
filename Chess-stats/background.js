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
