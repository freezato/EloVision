'use strict';

// Run directly with: node --test tests/maia-regression.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function createChromeEvent() {
  const listeners = new Set();
  return {
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    },
    hasListener(listener) {
      return listeners.has(listener);
    },
    dispatch(value) {
      for (const listener of [...listeners]) listener(value);
    },
  };
}

function createPort(name, onPostMessage = null) {
  const port = {
    name,
    onMessage: createChromeEvent(),
    onDisconnect: createChromeEvent(),
    posted: [],
    disconnected: false,
    postMessage(payload) {
      if (port.disconnected) throw new Error(`Port ${name} is disconnected`);
      port.posted.push(payload);
      onPostMessage?.(payload, port);
    },
    disconnect() {
      if (port.disconnected) return;
      port.disconnected = true;
      port.onDisconnect.dispatch();
    },
    drop() {
      port.disconnect();
    },
  };
  return port;
}

async function flushMicrotasks(turns = 12) {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

function createImmediateTimers() {
  let nextId = 0;
  const cancelled = new Set();
  return {
    setTimeout(callback) {
      const id = ++nextId;
      queueMicrotask(() => {
        if (!cancelled.has(id)) callback();
      });
      return id;
    },
    clearTimeout(id) {
      cancelled.add(id);
    },
  };
}

function createManualTimers() {
  let nextId = 0;
  const pending = new Map();
  return {
    setTimeout(callback, delay = 0) {
      const id = ++nextId;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    runNext() {
      const entry = [...pending.entries()].sort((a, b) => a[0] - b[0])[0];
      assert.ok(entry, 'expected a pending timer');
      pending.delete(entry[0]);
      entry[1].callback();
      return entry[1].delay;
    },
    get size() {
      return pending.size;
    },
  };
}

function deepContains(value, expected) {
  if (value === expected) return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(item => deepContains(item, expected));
}

function loadBackground({
  getContexts = async () => [],
  createDocument = async () => {},
  closeDocument = async () => {},
  timers = { setTimeout, clearTimeout },
} = {}) {
  const onMessage = createChromeEvent();
  const onConnect = createChromeEvent();
  const context = {
    AbortController,
    URL,
    chrome: {
      runtime: {
        onMessage,
        onConnect,
        getURL: relativePath => `chrome-extension://maia-test/${relativePath}`,
        getContexts,
      },
      offscreen: {
        createDocument,
        closeDocument,
      },
    },
    clients: undefined,
    console,
    fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(readRepoFile('background.js'), context, { filename: 'background.js' });
  return { context, onConnect, onMessage };
}

function loadOffscreen({ timers = createImmediateTimers() } = {}) {
  const ports = [];
  let intervalId = 0;
  const intervals = new Map();
  class FakeWorker {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.messages = [];
      this.terminated = false;
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
  }
  const context = {
    Worker: FakeWorker,
    chrome: {
      runtime: {
        connect({ name }) {
          const port = createPort(name);
          ports.push(port);
          return port;
        },
        getURL: relativePath => `chrome-extension://maia-test/${relativePath}`,
      },
    },
    clearTimeout: timers.clearTimeout,
    clearInterval: id => intervals.delete(id),
    console,
    setInterval: (callback, delay) => {
      const id = ++intervalId;
      intervals.set(id, { callback, delay });
      return id;
    },
    setTimeout: timers.setTimeout,
  };
  vm.createContext(context);
  vm.runInContext(readRepoFile('offscreen.js'), context, { filename: 'offscreen.js' });
  return { context, intervals, ports };
}

function loadMaiaWorker() {
  const messages = [];
  const engine = {
    goZero: async () => ({
      bestmove: 'e2e4',
      lines: [[{ moves: ['e2e4'], score: 12 }]],
    }),
    quit() {},
    reset() {},
    stop() {},
  };
  const context = {
    Blob,
    URL,
    Uint8Array,
    __makeZerofish: async () => engine,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    close() {},
    console,
    fetch: async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      text: async () => 'AA==',
    }),
    self: {
      onmessage: null,
      postMessage(message) {
        messages.push(message);
      },
    },
  };
  vm.createContext(context);
  const source = readRepoFile('modules/maia/maia.js')
    .replace("import makeZerofish from './zerofish.js';", 'const makeZerofish = globalThis.__makeZerofish;')
    .replace('import.meta.url', "'chrome-extension://maia-test/modules/maia/maia.js'")
    .replace('const wasmUrlPromise = decodeWasm();', "const wasmUrlPromise = Promise.resolve('mock.wasm');");
  vm.runInContext(source, context, { filename: 'maia.worker.js' });
  return {
    messages,
    send(data) {
      context.self.onmessage({ data });
    },
  };
}

function commandFromPayload(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.command === 'string') return payload.command;
  return commandFromPayload(payload.data) || commandFromPayload(payload.message);
}

function emitCoreWorkerLine(port, line, searchId = null, { includeLegacy = false } = {}) {
  if (includeLegacy) {
    port.onMessage.dispatch({ type: 'message', data: line });
  }
  port.onMessage.dispatch({
    type: 'message',
    data: { line, searchId },
    searchId,
  });
}

function loadCoreMaia({ autoReady = true, timers = createManualTimers() } = {}) {
  const fullSource = readRepoFile('modules/core-main.js');
  const start = fullSource.indexOf('let localMaiaWorker = null;');
  const end = fullSource.indexOf('const gameInsightsStockfishJobs = new Map();');
  assert.notEqual(start, -1, 'could not locate the Maia engine state in core-main.js');
  assert.notEqual(end, -1, 'could not locate the end of the Maia engine section in core-main.js');

  const ports = [];
  const connect = () => {
    const port = createPort('cse-maia-client', payload => {
      if (!autoReady) return;
      const command = commandFromPayload(payload);
      if (command !== 'uci' && command !== 'isready') return;
      const response = command === 'uci' ? 'uciok' : 'readyok';
      queueMicrotask(() => emitCoreWorkerLine(port, response, null, { includeLegacy: true }));
    });
    ports.push(port);
    return port;
  };

  const context = {
    AbortController,
    DOMException,
    URL,
    chrome: {
      runtime: {
        connect,
        getURL: relativePath => `chrome-extension://maia-test/${relativePath}`,
        lastError: null,
      },
    },
    clearTimeout: timers.clearTimeout,
    console,
    makeAbortError: () => new DOMException('Aborted', 'AbortError'),
    maiaElo: 1500,
    stockfishProvider: 'local',
    setTimeout: timers.setTimeout,
    MAIA_ELO_MIN: 1100,
    MAIA_ELO_MAX: 1900,
    MAIA_ELO_STEP: 100,
    MAIA_LOCAL_SCRIPT_PATH: 'modules/maia/maia.js',
    MAIA_LOCAL_WEIGHTS_DIR: 'modules/maia/weights',
    MAIA_LOCAL_BOOT_TIMEOUT_MS: 30000,
    MAIA_LOCAL_SEARCH_TIMEOUT_MS: 1800,
    STOCKFISH_LOCAL_MULTI_PV: 4,
    extractUciMove: value => (String(value).match(/[a-h][1-8][a-h][1-8][qrbn]?/) || [null])[0],
    isMoveConsistentWithFen: () => true,
  };
  vm.createContext(context);
  const source = fullSource.slice(start, end) + `
    globalThis.__maiaTestApi = {
      ensureLocalMaiaEngine,
      releaseLocalMaiaEngine,
      runLocalMaiaEval,
      currentSearch: () => localMaiaCurrentSearch,
      currentWorker: () => localMaiaWorker,
      initPromise: () => localMaiaInitPromise,
    };
  `;
  vm.runInContext(source, context, { filename: 'core-main.maia-section.js' });
  return { api: context.__maiaTestApi, context, ports, timers };
}

test('background keeps a replacement offscreen port when the old port disconnects late', async () => {
  const { onConnect } = loadBackground();
  const oldOffscreen = createPort('cse-maia-offscreen');
  const replacementOffscreen = createPort('cse-maia-offscreen');
  onConnect.dispatch(oldOffscreen);
  onConnect.dispatch(replacementOffscreen);

  oldOffscreen.drop();

  const client = createPort('cse-maia-client');
  onConnect.dispatch(client);
  client.onMessage.dispatch({ type: 'command', data: 'uci' });
  await flushMicrotasks();

  assert.ok(
    replacementOffscreen.posted.some(payload => deepContains(payload, 'uci')),
    'the live replacement port must receive commands after the stale port disconnects',
  );
});

test('background recreates a stale offscreen context and drains queued commands', async () => {
  const timers = createImmediateTimers();
  let hasDocument = true;
  let createCalls = 0;
  let closeCalls = 0;
  let onConnect;
  const replacementOffscreen = createPort('cse-maia-offscreen');

  const loaded = loadBackground({
    timers,
    getContexts: async () => hasDocument
      ? [{ contextType: 'OFFSCREEN_DOCUMENT', url: 'chrome-extension://maia-test/offscreen.html' }]
      : [],
    closeDocument: async () => {
      closeCalls += 1;
      hasDocument = false;
    },
    createDocument: async () => {
      createCalls += 1;
      hasDocument = true;
      queueMicrotask(() => onConnect.dispatch(replacementOffscreen));
    },
  });
  onConnect = loaded.onConnect;

  const client = createPort('cse-maia-client');
  onConnect.dispatch(client);
  client.onMessage.dispatch({ type: 'command', data: 'uci' });
  await flushMicrotasks(30);

  assert.ok(closeCalls >= 1, 'the stale offscreen document should be closed');
  assert.ok(createCalls >= 1, 'a new offscreen document should be created');
  assert.ok(
    replacementOffscreen.posted.some(payload => deepContains(payload, 'uci')),
    'commands queued while the bridge was absent must reach the replacement port',
  );
});

test('offscreen bridge reconnects its runtime port after disconnect', async () => {
  const { ports } = loadOffscreen();
  assert.equal(ports.length, 1, 'offscreen should connect once at startup');

  // A live client makes the bridge worth reconnecting; an idle offscreen page
  // is allowed to stay disconnected until background recreates it.
  ports[0].onMessage.dispatch({
    clientId: 'maia-test-client',
    message: { type: 'command', data: 'uci' },
  });

  ports[0].drop();
  await flushMicrotasks(20);

  assert.ok(ports.length >= 2, 'offscreen should establish a new bridge port after disconnect');
  assert.equal(ports.at(-1).disconnected, false);
});

test('offscreen sends a heartbeat while a Maia engine is active', () => {
  const { intervals, ports } = loadOffscreen();
  ports[0].onMessage.dispatch({
    clientId: 'maia-heartbeat-client',
    message: { type: 'command', data: 'uci' },
  });

  const heartbeat = [...intervals.values()].find(entry => entry.delay === 20 * 1000);
  assert.ok(heartbeat, 'an active Maia worker should start the service-worker keepalive');
  heartbeat.callback();
  assert.ok(
    ports[0].posted.some(payload => payload?.type === 'heartbeat'),
    'the keepalive must send a message, not merely hold an open Port',
  );
});

test('Maia worker tags search output with the originating searchId', async () => {
  const worker = loadMaiaWorker();
  worker.send('uci');
  worker.send('setoption name WeightsFile value chrome-extension://maia-test/maia-1500.pb.gz');
  worker.send('isready');
  worker.send({
    command: 'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    searchId: 42,
  });
  worker.send({ command: 'go nodes 1', searchId: 42 });
  await flushMicrotasks(30);

  const searchMessages = worker.messages.filter(message => message && typeof message === 'object');
  assert.ok(searchMessages.some(message => message.searchId === 42 && /^info /.test(message.line)));
  assert.ok(searchMessages.some(message => message.searchId === 42 && message.line === 'bestmove e2e4'));
});

test('two concurrent Maia ensure calls share a live initialization attempt', async () => {
  const harness = loadCoreMaia();
  const first = harness.api.ensureLocalMaiaEngine();
  const second = harness.api.ensureLocalMaiaEngine();

  try {
    assert.strictEqual(second, first, 'concurrent callers should share one initialization promise');
    assert.equal(harness.ports.length, 1, 'only one runtime port should be created');
    assert.equal(harness.ports[0].disconnected, false, 'the second ensure must not terminate the booting worker');
    await Promise.all([first, second]);
  } finally {
    first.catch(() => {});
    second.catch(() => {});
    harness.api.releaseLocalMaiaEngine();
  }
});

test('Maia accepts only the bestmove carrying the active searchId', async () => {
  const harness = loadCoreMaia();
  await harness.api.ensureLocalMaiaEngine();

  const first = harness.api.runLocalMaiaEval(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    1,
    null,
  );
  await flushMicrotasks();
  const firstSearchId = harness.api.currentSearch().id;

  const second = harness.api.runLocalMaiaEval(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
    1,
    null,
  );
  await first;
  await flushMicrotasks();
  const secondSearchId = harness.api.currentSearch().id;
  const activePort = harness.ports.at(-1);
  let secondSettled = false;
  let secondResult = null;
  second.then(result => {
    secondSettled = true;
    secondResult = result;
  });

  try {
    emitCoreWorkerLine(activePort, 'bestmove e2e4', firstSearchId);
    await flushMicrotasks();
    assert.equal(secondSettled, false, 'a late result from the stopped search must be ignored');

    emitCoreWorkerLine(activePort, 'bestmove e7e5', secondSearchId);
    await flushMicrotasks();
    assert.equal(secondSettled, true, 'the active search result should be accepted');
    assert.equal(secondResult?.bestMove, 'e7e5');
  } finally {
    harness.api.releaseLocalMaiaEngine();
    await second.catch(() => null);
  }
});

test('a Maia search timeout hard-resets the engine before the next search', async () => {
  const harness = loadCoreMaia();
  await harness.api.ensureLocalMaiaEngine();
  const firstPort = harness.ports[0];
  const timedOutSearch = harness.api.runLocalMaiaEval(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    1,
    null,
  );
  await flushMicrotasks();

  harness.timers.runNext();
  assert.equal(await timedOutSearch, null);

  const nextSearch = harness.api.runLocalMaiaEval(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    1,
    null,
  );
  await flushMicrotasks();
  try {
    assert.equal(firstPort.disconnected, true, 'a timed-out worker must be terminated, not merely stopped');
    assert.ok(harness.ports.length >= 2, 'the next search must initialize a fresh engine port');
  } finally {
    harness.api.releaseLocalMaiaEngine();
    await nextSearch.catch(() => null);
  }
});

test('a disconnected Maia client port is released and reconnects on the next ensure', async () => {
  const harness = loadCoreMaia();
  await harness.api.ensureLocalMaiaEngine();
  const firstPort = harness.ports[0];

  firstPort.drop();
  await flushMicrotasks();
  assert.equal(harness.api.currentWorker(), null, 'the disconnected bridge must not remain cached');

  const replacement = await harness.api.ensureLocalMaiaEngine();
  try {
    assert.ok(replacement, 'the next ensure should initialize a replacement bridge');
    assert.equal(harness.ports.length, 2);
    assert.equal(harness.ports[1].disconnected, false);
  } finally {
    harness.api.releaseLocalMaiaEngine();
  }
});

test('a tagged Maia runtime error immediately resets the active search', async () => {
  const harness = loadCoreMaia();
  await harness.api.ensureLocalMaiaEngine();
  const pending = harness.api.runLocalMaiaEval(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    1,
    null,
  );
  await flushMicrotasks();
  const searchId = harness.api.currentSearch().id;

  emitCoreWorkerLine(harness.ports.at(-1), 'info string Maia worker error: simulated failure', searchId);
  assert.equal(await pending, null);
  assert.equal(harness.api.currentWorker(), null, 'a failed worker must not be reused');
});

test('releasing Maia during boot settles the old attempt and permits an immediate restart', async () => {
  const harness = loadCoreMaia({ autoReady: false });
  let firstSettled = false;
  const first = harness.api.ensureLocalMaiaEngine();
  first.then(
    () => { firstSettled = true; },
    () => { firstSettled = true; },
  );

  harness.api.releaseLocalMaiaEngine();
  const second = harness.api.ensureLocalMaiaEngine();
  second.catch(() => {});
  await flushMicrotasks();

  try {
    assert.equal(firstSettled, true, 'release should cancel initialization without waiting for the 30s boot timer');
    assert.notStrictEqual(second, first, 'restart must use a new initialization promise');
    assert.equal(harness.ports.length, 2, 'restart must open a new runtime port immediately');
  } finally {
    harness.api.releaseLocalMaiaEngine();
    first.catch(() => {});
  }
});
