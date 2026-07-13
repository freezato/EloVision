import makeZerofish from './zerofish.js';

const baseUrl = new URL('.', import.meta.url);
let weightsUrl = '';
let positionFen = '';
let positionSearchId = null;
let wasmBlobUrl = '';

async function decodeWasm() {
  const encoded = (await (await fetch(new URL('zerofishEngine.wasm.b64', baseUrl))).text()).trim();
  const chunkSize = 32768;
  const chunks = [];
  let total = 0;
  for (let i = 0; i < encoded.length; i += chunkSize) {
    const binary = atob(encoded.slice(i, i + chunkSize));
    const bytes = new Uint8Array(binary.length);
    for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
    chunks.push(bytes);
    total += bytes.length;
  }
  const wasm = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    wasm.set(chunk, offset);
    offset += chunk.length;
  }
  wasmBlobUrl = URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }));
  return wasmBlobUrl;
}

const wasmUrlPromise = decodeWasm();
const enginePromise = (async () => {
  const wasmUrl = await wasmUrlPromise;
  return makeZerofish({
    locator: file => file === 'zerofishEngine.wasm' ? wasmUrl : new URL(file, baseUrl).href,
  });
})();

let weightsPromise = null;
async function loadWeights(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('maia-weights-' + response.status);
  if (url.endsWith('.gz') && typeof DecompressionStream === 'function') {
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return new Uint8Array(await response.arrayBuffer());
}

function post(line, searchId = null) {
  const text = String(line);
  if (Number.isSafeInteger(searchId)) {
    self.postMessage({ line: text, searchId });
    return;
  }
  self.postMessage(text);
}

async function handle(command, searchId = null) {
  const text = String(command || '').trim();
  if (!text) return;
  if (text === 'uci') {
    await enginePromise;
    post('id name Maia Local LC0');
    post('id author EloVision / Zerofish');
    post('uciok');
    return;
  }
  if (text.startsWith('setoption name WeightsFile value ')) {
    weightsUrl = text.slice('setoption name WeightsFile value '.length).trim();
    weightsPromise = loadWeights(weightsUrl);
    return;
  }
  if (text === 'isready') {
    await enginePromise;
    if (weightsPromise) await weightsPromise;
    post('readyok');
    return;
  }
  if (text.startsWith('position fen ')) {
    positionFen = text.slice('position fen '.length).trim();
    positionSearchId = Number.isSafeInteger(searchId) ? searchId : null;
    return;
  }
  if (text.startsWith('go ')) {
    if (!positionFen || !weightsUrl) throw new Error('maia-not-configured');
    const requestSearchId = Number.isSafeInteger(searchId) ? searchId : positionSearchId;
    const requestFen = positionFen;
    const engine = await enginePromise;
    const weights = weightsPromise || loadWeights(weightsUrl);
    const nodesMatch = text.match(/\bnodes\s+(\d+)/);
    const result = await engine.goZero(
      { fen: requestFen },
      {
        multipv: 1,
        nodes: nodesMatch ? Math.max(1, Number(nodesMatch[1])) : 1,
        net: { key: weightsUrl, fetch: async () => await weights },
      }
    );
    const lines = result.lines?.[result.lines.length - 1] || [];
    lines.forEach((line, index) => {
      if (!line?.moves?.length) return;
      post('info depth 1 multipv ' + (index + 1) + ' score cp ' + Math.round(line.score || 0) + ' pv ' + line.moves.join(' '), requestSearchId);
    });
    post('bestmove ' + (result.bestmove || lines[0]?.moves?.[0] || '0000'), requestSearchId);
    return;
  }
  if (text === 'ucinewgame') {
    (await enginePromise).reset();
    return;
  }
  if (text === 'stop') {
    (await enginePromise).stop();
    return;
  }
  if (text === 'quit') {
    (await enginePromise).quit();
    if (wasmBlobUrl) URL.revokeObjectURL(wasmBlobUrl);
    close();
  }
}

let queue = Promise.resolve();
self.onmessage = event => {
  const payload = event.data;
  const command = String(
    payload && typeof payload === 'object' ? payload.command || '' : payload || ''
  ).trim();
  const searchId = payload && typeof payload === 'object' && Number.isSafeInteger(payload.searchId)
    ? payload.searchId
    : null;
  if (command === 'stop') {
    enginePromise.then(engine => engine.stop()).catch(() => {});
    return;
  }
  queue = queue.then(() => handle(command, searchId)).catch(error => {
    post('info string Maia worker error: ' + (error?.message || error), searchId);
  });
};
