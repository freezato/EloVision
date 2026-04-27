chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'cse-fetch-json' || typeof message.url !== 'string') {
    return;
  }

  const headers = (message.headers && typeof message.headers === 'object')
    ? message.headers
    : { Accept: 'application/json' };

  fetch(message.url, { method: 'GET', headers })
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
        error: err?.message || String(err),
      });
    });

  return true;
});
