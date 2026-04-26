// Chess.com Opponent Stats Extension
// Fetches opponent stats from chess.com public API

const CACHE = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const panelByUsername = new Map();
const injectedUsernameEls = new WeakSet();

// ─── Utility ────────────────────────────────────────────────────────────────

function now() { return Date.now(); }

function daysAgo(days) {
  return Math.floor((now() - days * 86400000) / 1000);
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function cachedFetch(url) {
  if (CACHE[url] && now() - CACHE[url].ts < CACHE_TTL) return CACHE[url].data;
  const data = await fetchJSON(url);
  CACHE[url] = { ts: now(), data };
  return data;
}

// ─── Chess.com API ───────────────────────────────────────────────────────────

async function getPlayerStats(username) {
  return cachedFetch(`https://api.chess.com/pub/player/${username}/stats`);
}

async function getPlayerMonthArchives(username) {
  const data = await cachedFetch(`https://api.chess.com/pub/player/${username}/games/archives`);
  return data.archives || [];
}

async function getGamesFromArchive(url) {
  try {
    const data = await cachedFetch(url);
    return data.games || [];
  } catch { return []; }
}

async function getRecentGames(username, days) {
  const archives = await getPlayerMonthArchives(username);
  const cutoff = daysAgo(days);
  const userLower = username.toLowerCase();

  // Determine which archives to fetch (current + previous months as needed)
  const relevantArchives = archives.slice(-Math.min(3, archives.length));

  const allGames = [];
  for (const archiveUrl of relevantArchives) {
    const games = await getGamesFromArchive(archiveUrl);
    for (const g of games) {
      if (g.end_time >= cutoff) allGames.push({ ...g, _username: userLower });
    }
  }
  return allGames;
}

function calcWLR(games, username) {
  let wins = 0, losses = 0, draws = 0;
  const user = username.toLowerCase();
  for (const g of games) {
    const white = (g.white?.username || '').toLowerCase();
    const isWhite = white === user;
    const result = isWhite ? g.white?.result : g.black?.result;
    if (result === 'win') wins++;
    else if (['checkmated', 'timeout', 'resigned', 'lose', 'abandoned'].includes(result)) losses++;
    else draws++;
  }
  const total = wins + losses + draws;
  const wlr = losses === 0 ? (wins > 0 ? '∞' : '—') : (wins / losses).toFixed(2);
  return { wins, losses, draws, total, wlr };
}

function getPeakRating(stats) {
  const modes = ['chess_rapid', 'chess_blitz', 'chess_bullet', 'chess_daily'];
  let peak = 0;
  let peakMode = '—';
  for (const mode of modes) {
    const best = stats?.[mode]?.best?.rating;
    if (best && best > peak) { peak = best; peakMode = mode.replace('chess_', ''); }
  }
  return { peak, peakMode };
}

function getCurrentRating(stats) {
  const modes = ['chess_rapid', 'chess_blitz', 'chess_bullet'];
  const result = {};
  for (const mode of modes) {
    const last = stats?.[mode]?.last?.rating;
    if (last) result[mode.replace('chess_', '')] = last;
  }
  return result;
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function createPanel(username) {
  const panel = document.createElement('div');
  panel.className = 'cse-panel';
  panel.innerHTML = `
    <div class="cse-header">
      <span class="cse-title">♟ <a href="https://www.chess.com/member/${username}" target="_blank">${username}</a></span>
      <button class="cse-close" title="Chiudi">✕</button>
    </div>
    <div class="cse-loading">
      <div class="cse-spinner"></div>
      <span>Caricamento statistiche…</span>
    </div>
    <div class="cse-content" style="display:none"></div>
  `;
  panel.querySelector('.cse-close').addEventListener('click', () => {
    panelByUsername.delete(username);
    panel.remove();
  });
  document.body.appendChild(panel);
  makeDraggable(panel);
  panelByUsername.set(username, panel);
  return panel;
}

function renderStats(panel, username, stats1, stats7, stats30, playerStats) {
  const { peak, peakMode } = getPeakRating(playerStats);
  const currentRatings = getCurrentRating(playerStats);

  const ratingHTML = Object.entries(currentRatings).map(([mode, rating]) =>
    `<span class="cse-badge">${mode}: <b>${rating}</b></span>`
  ).join('');

  const peakHTML = peak > 0
    ? `<span class="cse-badge cse-peak">🏆 Peak ${peakMode}: <b>${peak}</b></span>`
    : '';

  const periodRow = (label, data) => {
    const pct = data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0;
    return `
      <tr>
        <td class="cse-period">${label}</td>
        <td class="cse-w">✅ ${data.wins}</td>
        <td class="cse-l">❌ ${data.losses}</td>
        <td class="cse-d">🤝 ${data.draws}</td>
        <td class="cse-wlr">${data.wlr}</td>
        <td class="cse-pct">${data.total > 0 ? pct + '%' : '—'}</td>
      </tr>`;
  };

  const content = panel.querySelector('.cse-content');
  content.innerHTML = `
    <div class="cse-ratings">${ratingHTML}${peakHTML}</div>
    <table class="cse-table">
      <thead>
        <tr>
          <th>Periodo</th>
          <th title="Vittorie">✅</th>
          <th title="Sconfitte">❌</th>
          <th title="Patte">🤝</th>
          <th title="Win/Loss Ratio">WLR</th>
          <th title="Win Rate">Win%</th>
        </tr>
      </thead>
      <tbody>
        ${periodRow('1 giorno', stats1)}
        ${periodRow('7 giorni', stats7)}
        ${periodRow('30 giorni', stats30)}
      </tbody>
    </table>
    <div class="cse-footer">Dati via chess.com API · <span class="cse-time">${new Date().toLocaleTimeString('it-IT')}</span></div>
  `;

  panel.querySelector('.cse-loading').style.display = 'none';
  content.style.display = 'block';
}

function renderError(panel, message) {
  panel.querySelector('.cse-loading').innerHTML = `<span class="cse-error">⚠️ ${message}</span>`;
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────

function makeDraggable(el) {
  const header = el.querySelector('.cse-header');
  let startX, startY, startLeft, startTop;

  header.addEventListener('mousedown', e => {
    if (e.target.classList.contains('cse-close')) return;
    startX = e.clientX; startY = e.clientY;
    const rect = el.getBoundingClientRect();
    startLeft = rect.left; startTop = rect.top;
    el.style.right = 'auto';

    function onMove(e) {
      el.style.left = (startLeft + e.clientX - startX) + 'px';
      el.style.top = (startTop + e.clientY - startY) + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ─── Main Logic ───────────────────────────────────────────────────────────────

async function loadStatsForUser(username) {
  const existingPanel = panelByUsername.get(username);
  if (existingPanel) {
    existingPanel.remove();
    panelByUsername.delete(username);
  }

  const panel = createPanel(username);

  try {
    const [playerStats, games30] = await Promise.all([
      getPlayerStats(username),
      getRecentGames(username, 30)
    ]);

    const cutoff7 = daysAgo(7);
    const cutoff1 = daysAgo(1);

    const games7 = games30.filter(g => g.end_time >= cutoff7);
    const games1 = games30.filter(g => g.end_time >= cutoff1);

    const stats1 = calcWLR(games1, username);
    const stats7 = calcWLR(games7, username);
    const stats30 = calcWLR(games30, username);

    renderStats(panel, username, stats1, stats7, stats30, playerStats);
  } catch (err) {
    renderError(panel, `Impossibile caricare le stats per "${username}"`);
    console.error('[ChessStats]', err);
  }
}

// ─── Evaluation Bar ───────────────────────────────────────────────────────────

let evalBarPanel = null;
let evalUpdateInterval = null;
let lastEvalFen = null;
let currentBestMove = null;
let bestMoveOverlay = null;
let evalToggleBtn = null;
let arrowsToggleBtn = null;
let arrowsEnabled = true; // Toggle per le frecce
const STOCKFISH_ONLINE_DEPTH = 15;
const FEN_SEARCH_MAX_DEPTH = 3;
const FEN_SEARCH_MAX_NODES = 250;
const EVAL_CACHE_TTL = 12 * 1000;

// ── FEN extraction ────────────────────────────────────────────

function isFen(s) {
  return !!normalizeFen(s);
}

function normalizeTurn(value) {
  if (typeof value !== 'string') return null;
  const turn = value.trim().toLowerCase();
  if (turn === 'w' || turn === 'white') return 'w';
  if (turn === 'b' || turn === 'black') return 'b';
  return null;
}

function normalizeCastlingRights(value) {
  if (typeof value !== 'string' || !value.trim() || value === '-') return '-';
  const rights = ['K', 'Q', 'k', 'q'].filter(flag => value.includes(flag)).join('');
  return rights || '-';
}

function expandFenBoard(boardPart) {
  if (typeof boardPart !== 'string') return null;
  const ranks = boardPart.split('/');
  if (ranks.length !== 8) return null;

  const board = [];
  for (const rank of ranks) {
    const row = [];
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < parseInt(ch, 10); i++) row.push(null);
      } else if (/[prnbqkPRNBQK]/.test(ch)) {
        row.push(ch);
      } else {
        return null;
      }
    }
    if (row.length !== 8) return null;
    board.push(row);
  }
  return board;
}

function getCastlingRightsFromBoard(board) {
  if (!Array.isArray(board) || board.length !== 8) return '-';
  const rights = [];
  if (board[7]?.[4] === 'K' && board[7]?.[7] === 'R') rights.push('K');
  if (board[7]?.[4] === 'K' && board[7]?.[0] === 'R') rights.push('Q');
  if (board[0]?.[4] === 'k' && board[0]?.[7] === 'r') rights.push('k');
  if (board[0]?.[4] === 'k' && board[0]?.[0] === 'r') rights.push('q');
  return rights.join('') || '-';
}

function estimateCastlingRights(boardPart) {
  const board = expandFenBoard(boardPart);
  return board ? getCastlingRightsFromBoard(board) : '-';
}

function getPlyCountFromMoveList() {
  const plyAttrs = ['data-ply', 'data-ply-index', 'data-move-index'];
  let maxIndexedPly = -1;

  for (const attr of plyAttrs) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      const raw = el.getAttribute(attr);
      const ply = parseInt(raw, 10);
      if (!Number.isNaN(ply)) maxIndexedPly = Math.max(maxIndexedPly, ply);
    }
  }
  // chess.com ply attributes are 1-based (first white move = ply 1).
  // maxIndexedPly IS the number of completed half-moves, no +1 needed.
  if (maxIndexedPly >= 0) return maxIndexedPly;

  const scopes = Array.from(document.querySelectorAll(
    '.vertical-move-list, .vertical-move-list-component, .move-list, .move-list-component, [data-cy="move-list"], .notation-window, [class*="notation"]'
  ));
  const moveSelectors = '.move-text-component, .move-node, .move-node-component, [class*="move-text"], [class*="move-node"]';
  let bestCount = 0;

  for (const scope of scopes.length ? scopes : [document]) {
    try {
      bestCount = Math.max(bestCount, scope.querySelectorAll(moveSelectors).length);
    } catch {}
  }

  return bestCount || null;
}

function estimateFullmoveNumber() {
  const plyCount = getPlyCountFromMoveList();
  return Math.max(1, Math.floor((plyCount || 0) / 2) + 1);
}

function findTurnInObject(root, maxDepth = 2, maxNodes = 120) {
  if (!root || (typeof root !== 'object' && typeof root !== 'function')) return null;

  const seen = new WeakSet();
  const stack = [{ value: root, depth: 0 }];
  let visited = 0;

  while (stack.length && visited < maxNodes) {
    const { value, depth } = stack.pop();
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    visited++;

    for (const key of ['turn', 'sideToMove', 'colorToMove', 'activeColor', 'playerToMove']) {
      try {
        const raw = typeof value[key] === 'function' ? value[key]() : value[key];
        const turn = normalizeTurn(raw);
        if (turn) return turn;
      } catch {}
    }

    if (depth >= maxDepth) continue;

    let keys = [];
    try { keys = Object.keys(value); } catch {}
    for (const key of keys) {
      if (!/(turn|move|color|side)/i.test(key)) continue;
      try {
        const child = value[key];
        const turn = normalizeTurn(child);
        if (turn) return turn;
        if (child && (typeof child === 'object' || typeof child === 'function')) {
          stack.push({ value: child, depth: depth + 1 });
        }
      } catch {}
    }
  }

  return null;
}

// ── Active clock detection (most reliable for live online games) ──────────────
// chess.com adds 'clock-player-turn' to the clock element of whoever is to move.
function detectTurnFromActiveClock() {
  // Possible selectors for the currently-ticking clock
  const candidates = [
    document.querySelector('.clock-component.clock-player-turn'),
    document.querySelector('[class*="clock-player-turn"]'),
    document.querySelector('.player-clock.clock-player-turn'),
    document.querySelector('[class*="clock"][class*="player-turn"]')
  ].filter(Boolean);

  if (!candidates.length) return null;

  const boardEl = getBoardElement();
  const flipped  = boardEl ? isBoardFlipped(boardEl) : false;

  for (const clockEl of candidates) {
    const rect = clockEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    // Determine whether this clock is in the bottom half of the viewport.
    // Bottom = local player's side on a normal (white-at-bottom) board.
    const boardRect  = boardEl ? boardEl.getBoundingClientRect() : null;
    const midY       = boardRect
      ? boardRect.top + boardRect.height / 2
      : window.innerHeight / 2;
    const isBottom   = rect.top + rect.height / 2 > midY;

    // Without flip: bottom = white's clock → white to move.
    // With flip (playing black): bottom = black's clock → black to move.
    if (!flipped) return isBottom ? 'w' : 'b';
    else          return isBottom ? 'b' : 'w';
  }

  return null;
}

function detectSideToMove() {
  // ── Priority 0: active clock (most reliable for live games) ──────────────
  const clockTurn = detectTurnFromActiveClock();
  if (clockTurn) return clockTurn;

  // ── Priority 1: board element attributes / JS state ──────────────────────
  const boardEls = document.querySelectorAll('chess-board, wc-chess-board, [data-turn], [data-side-to-move]');

  for (const el of boardEls) {
    const turnCandidates = [
      el.getAttribute?.('turn'),
      el.getAttribute?.('data-turn'),
      el.getAttribute?.('data-side-to-move'),
      el.dataset?.turn,
      el.dataset?.sideToMove
    ];

    for (const candidate of turnCandidates) {
      const turn = normalizeTurn(candidate);
      if (turn) return turn;
    }

    const turnFromState = findTurnInObject(el);
    if (turnFromState) return turnFromState;
  }

  // ── Priority 2: ply count from move list ─────────────────────────────────
  // After N completed plies: N=0 → white, N=1 → black, N=2 → white …
  const plyCount = getPlyCountFromMoveList();
  if (Number.isInteger(plyCount) && plyCount >= 0) return plyCount % 2 === 0 ? 'w' : 'b';

  return 'w';
}

function normalizeFen(rawFen, options = {}) {
  if (typeof rawFen !== 'string') return null;

  const compact = rawFen.trim().replace(/\s+/g, ' ');
  if (!compact) return null;

  const parts = compact.split(' ');
  const boardPart = parts[0];
  if (!expandFenBoard(boardPart)) return null;

  const turn = normalizeTurn(parts[1]) || options.turn || detectSideToMove();
  const castling = normalizeCastlingRights(parts[2] || options.castling || estimateCastlingRights(boardPart));
  const enPassant = /^(-|[a-h][36])$/.test(parts[3] || '') ? parts[3] : '-';
  const halfmove = /^\d+$/.test(parts[4] || '') ? parts[4] : '0';
  const fullmove = /^\d+$/.test(parts[5] || '') ? parts[5] : String(options.fullmove || estimateFullmoveNumber());

  return [boardPart, turn, castling, enPassant, halfmove, fullmove].join(' ');
}

function tryGetFen(candidate, options = {}) {
  try {
    if (typeof candidate === 'function') return normalizeFen(candidate(), options);
    return normalizeFen(candidate, options);
  } catch {
    return null;
  }
}

function findFenInObject(root, maxDepth = FEN_SEARCH_MAX_DEPTH, maxNodes = FEN_SEARCH_MAX_NODES) {
  if (!root || (typeof root !== 'object' && typeof root !== 'function')) return null;

  const seen = new WeakSet();
  const stack = [{ value: root, depth: 0 }];
  let visited = 0;

  while (stack.length && visited < maxNodes) {
    const { value, depth } = stack.pop();
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    visited++;

    const directReaders = [
      () => value.getFEN?.(),
      () => value.getFen?.(),
      () => value.fen?.(),
      () => value.fen,
      () => value.currentFen,
      () => value.position
    ];

    for (const read of directReaders) {
      const fen = tryGetFen(read);
      if (fen) return fen;
    }

    if (depth >= maxDepth) continue;

    let keys = [];
    try { keys = Object.keys(value); } catch {}
    for (const key of keys) {
      if (key.startsWith('__react')) continue;
      let child;
      try { child = value[key]; } catch { continue; }

      if (typeof child === 'string') {
        const fen = normalizeFen(child);
        if (fen) return fen;
        continue;
      }

      if (!child || (typeof child !== 'object' && typeof child !== 'function')) continue;
      if (depth > 0 && !/(fen|game|position|state|controller|board|chess)/i.test(key)) continue;
      stack.push({ value: child, depth: depth + 1 });
    }
  }

  return null;
}

function getFenFromPage() {
  // inferredTurn is used only when a FEN has no explicit turn field.
  // Clock detection is now the highest priority inside detectSideToMove().
  const inferredTurn = detectSideToMove();

  // ── Method 1: Direct JS properties on the custom element ──────
  // chess.com exposes game state on chess-board / wc-chess-board.
  // We also look for playerColor so we can pass it to normalizeFen as a hint
  // when the FEN string itself lacks a turn field.
  for (const sel of ['chess-board', 'wc-chess-board']) {
    const el = document.querySelector(sel);
    if (!el) continue;

    // Try to read the player's color from the element for use as a cross-check
    let elemTurnHint = null;
    try {
      for (const src of [el, el.game, el.controller]) {
        if (!src) continue;
        for (const key of ['turn', 'sideToMove', 'colorToMove', 'activeColor']) {
          try {
            const raw = typeof src[key] === 'function' ? src[key]() : src[key];
            const t = normalizeTurn(raw);
            if (t) { elemTurnHint = t; break; }
          } catch {}
        }
        if (elemTurnHint) break;
      }
    } catch {}

    const turnHint = elemTurnHint || inferredTurn;

    try {
      if (el.game) {
        const fen = findFenInObject(el.game, FEN_SEARCH_MAX_DEPTH, FEN_SEARCH_MAX_NODES);
        if (fen) return fen;
      }
      if (el.controller) {
        const fen = findFenInObject(el.controller, FEN_SEARCH_MAX_DEPTH, FEN_SEARCH_MAX_NODES);
        if (fen) return fen;
      }
      const fen = findFenInObject(el, FEN_SEARCH_MAX_DEPTH, FEN_SEARCH_MAX_NODES);
      if (fen) return fen;
    } catch {}

    // ── Method 2: attribute "fen" on the element itself ──────────
    for (const attr of ['fen', 'data-fen']) {
      const attrFen = normalizeFen(el.getAttribute(attr), { turn: turnHint });
      if (attrFen) return attrFen;
    }
  }

  // ── Method 3: any element with a fen attribute ────────────────
  for (const el of document.querySelectorAll('[fen], [data-fen]')) {
    const fen = normalizeFen(el.getAttribute('fen') || el.getAttribute('data-fen'), { turn: inferredTurn });
    if (fen) return fen;
  }

  // ── Method 4: scan window for game objects ────────────────────
  try {
    for (const key of Object.keys(window)) {
      if (!/(fen|game|chess|board|state|move)/i.test(key)) continue;
      try {
        const fen = findFenInObject(window[key], 2, 120);
        if (fen) return fen;
      } catch {}
    }
  } catch {}

  // ── Method 5: URL param ───────────────────────────────────────
  const m = location.href.match(/[?&]fen=([^&#]+)/);
  if (m) {
    const fen = normalizeFen(decodeURIComponent(m[1]), { turn: inferredTurn });
    if (fen) return fen;
  }

  // ── Method 6: read pieces from Shadow DOM ─────────────────────
  return fenFromPieces();
}

function fenFromPieces() {
  // chess.com renders pieces inside the shadow root of chess-board.
  // Try both shadow root and regular DOM.
  const roots = [];
  for (const sel of ['chess-board', 'wc-chess-board']) {
    const el = document.querySelector(sel);
    if (el) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
      roots.push(el); // also try the element itself (some versions don't use shadow)
    }
  }
  roots.push(document); // fallback

  const pieceMap = {
    wp:'P', wr:'R', wn:'N', wb:'B', wq:'Q', wk:'K',
    bp:'p', br:'r', bn:'n', bb:'b', bq:'q', bk:'k'
  };

  let pieceEls = null;
  for (const root of roots) {
    try {
      // chess.com piece classes: "piece wp square-14" (file=1, rank=4)
      const els = root.querySelectorAll('[class*="square-"]');
      const filtered = Array.from(els).filter(el => {
        const cls = el.className || '';
        return (cls.includes(' wp') || cls.includes(' bp') ||
                cls.includes(' wr') || cls.includes(' br') ||
                cls.includes(' wn') || cls.includes(' bn') ||
                cls.includes(' wb') || cls.includes(' bb') ||
                cls.includes(' wq') || cls.includes(' bq') ||
                cls.includes(' wk') || cls.includes(' bk'));
      });
      if (filtered.length >= 2) { pieceEls = filtered; break; }
    } catch {}
  }

  if (!pieceEls || !pieceEls.length) return null;

  const board = Array.from({ length: 8 }, () => Array(8).fill(null));

  // Detect board flip using the same unified function used everywhere else
  const boardEl = document.querySelector('chess-board, wc-chess-board');
  const flipped = boardEl ? isBoardFlipped(boardEl) : false;

  for (const el of pieceEls) {
    const classes = Array.from(el.classList);

    // Find piece type (e.g. "wp", "bn")
    const pieceClass = classes.find(c => pieceMap[c]);
    if (!pieceClass) continue;

    // Find square (e.g. "square-14" → file=1, rank=4)
    const sqClass = classes.find(c => /^square-\d{2}$/.test(c));
    if (!sqClass) continue;

    const file = parseInt(sqClass[sqClass.length - 2]) - 1; // 0-based
    const rank = parseInt(sqClass[sqClass.length - 1]) - 1; // 0-based

    if (file < 0 || file > 7 || rank < 0 || rank > 7) continue;

    // In FEN, row 0 = rank 8 (top). square-X8 = rank 8 = row 0.
    // chess.com square-XY: X=file(1-8), Y=rank(1-8)
    const col = flipped ? 7 - file : file;
    const row = flipped ? rank : 7 - rank;

    board[row][col] = pieceMap[pieceClass];
  }

  // Detect whose turn from the move list (look for last move indicator)
  // If the last move highlights are on white pieces, it's black's turn and vice versa
  const turn = detectSideToMove();
  try {
    // chess.com adds class "black" to the board when it's black's turn for computer games
    const boardEl = document.querySelector('chess-board, wc-chess-board');
    if (boardEl) {
      const orientation = boardEl.getAttribute('orientation') || '';
      // If we're playing as black, it might be white's turn after black moves, etc.
      // Simpler: check the highlighted squares — the last move was made by the opposite color
      const highlighted = (boardEl.shadowRoot || boardEl).querySelectorAll('[class*="highlight"]');
      // fallback: keep 'w'
    }
  } catch {}

  const ranks = board.map(row => {
    let s = '', empty = 0;
    for (const cell of row) {
      if (!cell) { empty++; }
      else { if (empty) { s += empty; empty = 0; } s += cell; }
    }
    if (empty) s += empty;
    return s;
  });

  const boardPart = ranks.join('/');
  const castling = getCastlingRightsFromBoard(board);
  const fen = normalizeFen(`${boardPart} ${turn} ${castling} - 0 ${estimateFullmoveNumber()}`, {
    turn,
    castling
  });

  if (!fen || !fen.includes('K') || !fen.includes('k')) return null;
  return fen;
}

// ── Stockfish eval API ────────────────────────────────────────
let evalAbortController = null;
const evalCache = new Map();
let evalRequestSeq = 0;

function getCachedEval(fen) {
  const entry = evalCache.get(fen);
  if (!entry) return null;
  if (now() - entry.ts > EVAL_CACHE_TTL) {
    evalCache.delete(fen);
    return null;
  }
  return entry.value;
}

function setCachedEval(fen, value) {
  evalCache.set(fen, { ts: now(), value });
}

async function fetchEval(fen) {
  const cached = getCachedEval(fen);
  if (cached) return cached;

  // Cancel any in-flight request for a previous position
  if (evalAbortController) evalAbortController.abort();
  evalAbortController = new AbortController();
  const signal = evalAbortController.signal;
  const turn = fen.split(' ')[1] || 'w';

  // Primary: stockfish.online — real Stockfish engine, depth 15
  try {
    const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${STOCKFISH_ONLINE_DEPTH}`;
    const res = await fetch(url, { signal });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        const bestMove = extractUciMove(data.bestmove);
        if (data.mate !== null && data.mate !== undefined && data.mate !== 0) {
          const result = { cp: null, mate: turn === 'w' ? data.mate : -data.mate, bestMove };
          setCachedEval(fen, result);
          return result;
        }
        const cpRaw = Math.round(parseFloat(data.evaluation) * 100);
        const cp = turn === 'w' ? cpRaw : -cpRaw;
        if (!isNaN(cp)) {
          const result = { cp, mate: null, bestMove };
          setCachedEval(fen, result);
          return result;
        }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return null; // newer position superseded this one
  }

  // Fallback: Lichess cloud-eval (instant if cached, 404 if not)
  try {
    const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=1`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal });
    if (res.ok) {
      const data = await res.json();
      const pv = data.pvs && data.pvs[0];
      if (pv) {
        const bestMove = extractUciMove(pv.moves);
        if (pv.mate !== undefined) {
          const result = { cp: null, mate: turn === 'w' ? pv.mate : -pv.mate, bestMove };
          setCachedEval(fen, result);
          return result;
        }
        if (pv.cp  !== undefined) {
          const result = { cp: turn === 'w' ? pv.cp : -pv.cp, mate: null, bestMove };
          setCachedEval(fen, result);
          return result;
        }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return null;
  }

  return null;
}

// ── Bar rendering ─────────────────────────────────────────────
function extractUciMove(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/\b([a-h][1-8][a-h][1-8][qrbn]?)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function getBoardElement() {
  const boardCandidates = Array.from(document.querySelectorAll('chess-board, wc-chess-board'));
  const directBoard = boardCandidates.find(el => {
    try {
      const rect = el.getBoundingClientRect();
      return rect.width > 40 && rect.height > 40;
    } catch {
      return false;
    }
  });
  if (directBoard) return directBoard;

  // Fallback: locate the board inside layout containers (if chess.com changes markup).
  const containers = Array.from(document.querySelectorAll('.board-layout-chessboard'));
  for (const container of containers) {
    const nested = container.querySelector('chess-board, wc-chess-board');
    if (!nested) continue;
    try {
      const rect = nested.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) return nested;
    } catch {}
  }

  return null;
}

// Single source-of-truth for board orientation.
// Returns 'b' (playing as black = board flipped), 'w' (playing as white), or null if unknown.
// NEVER calls getPlayerSide() to avoid circular dependency.
function _detectOrientationColor(boardEl) {
  if (!boardEl) return null;

  // ── 1. HTML attribute (most explicit — chess.com sets orientation="black" for live games) ──
  const orientAttr = (
    boardEl.getAttribute?.('orientation') ||
    boardEl.getAttribute?.('data-orientation') ||
    boardEl.dataset?.orientation || ''
  ).toLowerCase();
  if (orientAttr === 'black' || orientAttr === 'b') return 'b';
  if (orientAttr === 'white' || orientAttr === 'w') return 'w';

  // ── 2. JS property (wc-chess-board is a Web Component — the Lit property may differ from attribute) ──
  try {
    const orientProp = (typeof boardEl.orientation === 'string') ? boardEl.orientation.toLowerCase() : null;
    if (orientProp === 'black' || orientProp === 'b') return 'b';
    if (orientProp === 'white' || orientProp === 'w') return 'w';
  } catch {}

  // ── 3. Player/my color properties on the element or its game object ──
  try {
    for (const src of [boardEl, boardEl.game, boardEl.controller].filter(Boolean)) {
      for (const key of ['myColor', 'playerColor', 'mySide', 'playerSide', 'userColor', 'localColor']) {
        try {
          const val = typeof src[key] === 'function' ? src[key]() : src[key];
          const t = normalizeTurn(val);
          if (t) return t;
        } catch {}
      }
    }
  } catch {}

  // ── 4. Boolean flipped property ──
  try {
    if (boardEl.flipped === true)  return 'b';
    if (boardEl.flipped === false) return 'w';
  } catch {}

  // ── 5. flipped HTML attribute ──
  const flippedAttr = boardEl.getAttribute?.('flipped');
  if (flippedAttr === '' || flippedAttr === 'true') return 'b';
  if (flippedAttr === 'false') return 'w';

  // ── 6. CSS class ──
  if (
    boardEl.classList?.contains('board-flipped') ||
    document.querySelector('.flipped-board, [class*="board-flipped"]')
  ) return 'b';

  // ── 7. Username position: if the logged-in user is at the TOP, they're playing black ──
  const me = getLoggedInUsername();
  if (me) {
    for (const [panelCls, color] of [['top', 'b'], ['bottom', 'w']]) {
      const panel = document.querySelector(
        `[class*="player-${panelCls}"], [class*="board-player-${panelCls}"]`
      );
      if (!panel) continue;
      const found = Array.from(
        panel.querySelectorAll('[data-username], .user-username-component, .player-tagline-username')
      ).some(el =>
        (el.dataset?.username || el.textContent?.trim().split(/\s/)[0] || '').toLowerCase() === me
      );
      if (found) return color;
    }
  }

  return null; // genuinely unknown
}

function isBoardFlipped(boardEl = getBoardElement()) {
  const color = _detectOrientationColor(boardEl);
  if (color === 'b') return true;
  if (color === 'w') return false;
  return false; // safe default: assume normal orientation
}

function getExplicitBoardFlipState(boardEl = getBoardElement()) {
  const color = _detectOrientationColor(boardEl);
  if (color === 'b') return true;
  if (color === 'w') return false;
  return null;
}

function squareToViewportPoint(square, rect, flipped) {
  if (!/^[a-h][1-8]$/i.test(square)) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  const size = Math.min(rect.width, rect.height);
  const left = rect.left + (rect.width - size) / 2;
  const top = rect.top + (rect.height - size) / 2;
  const cell = size / 8;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;

  return {
    x: left + (col + 0.5) * cell,
    y: top + (row + 0.5) * cell,
    cell
  };
}

function ensureBestMoveOverlay() {
  if (bestMoveOverlay && bestMoveOverlay.isConnected) return bestMoveOverlay;

  const overlay = document.createElement('div');
  overlay.className = 'cse-bestmove-overlay';
  // Two arrow groups: "my" (blue) and "opp" (red)
  overlay.innerHTML = `
    <svg class="cse-bestmove-svg" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="cse-arrow-my"  markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" fill="rgba(60,130,255,0.92)"/>
        </marker>
        <marker id="cse-arrow-opp" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" fill="rgba(255,70,70,0.92)"/>
        </marker>
      </defs>
      <!-- my arrow (blue) -->
      <circle class="cse-arrow-start" id="cse-my-start" cx="0" cy="0" r="0"
        fill="rgba(60,130,255,0.25)" stroke="rgba(60,130,255,0.9)" stroke-width="2"/>
      <line id="cse-my-line" x1="0" y1="0" x2="0" y2="0"
        stroke="rgba(60,130,255,0.88)" stroke-linecap="round"
        marker-end="url(#cse-arrow-my)"/>
      <!-- opponent arrow (red) -->
      <circle class="cse-arrow-start" id="cse-opp-start" cx="0" cy="0" r="0"
        fill="rgba(255,70,70,0.25)" stroke="rgba(255,70,70,0.9)" stroke-width="2"/>
      <line id="cse-opp-line" x1="0" y1="0" x2="0" y2="0"
        stroke="rgba(255,70,70,0.88)" stroke-linecap="round"
        marker-end="url(#cse-arrow-opp)"/>
    </svg>
  `;
  document.body.appendChild(overlay);
  bestMoveOverlay = overlay;
  return overlay;
}

function hideBestMoveOverlay() {
  if (bestMoveOverlay) bestMoveOverlay.classList.remove('cse-bestmove-visible');
}

function clearBestMoveOverlay() {
  currentBestMove = null;
  hideBestMoveOverlay();
}

// ── Who am I? ─────────────────────────────────────────────────
function getLoggedInUsername() {
  // 1. chess.com global objects
  try {
    const candidates = [
      window.user?.username, window.user?.name,
      window.settings?.username, window.chesscom?.user?.username,
      window.GLOBALS?.user?.username
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.length > 1) return c.toLowerCase();
    }
  } catch {}

  // 2. Meta/data attribute marked as self
  for (const sel of ['meta[name="user"]', '[data-username][data-is-self]']) {
    const el = document.querySelector(sel);
    if (el) {
      const u = el.getAttribute('content') || el.getAttribute('data-username');
      if (u) return u.toLowerCase();
    }
  }

  // 3. Nav profile link  /member/Username  or  /profile/Username
  for (const a of document.querySelectorAll('a[href*="/member/"], a[href*="/profile/"]')) {
    const m = a.href.match(/\/(member|profile)\/([^/?#]+)/i);
    if (m && m[2].length > 1) return m[2].toLowerCase();
  }

  return null;
}

// Returns 'w' or 'b' (the side the local player is playing), or null.
function getPlayerSide(boardEl = getBoardElement()) {
  if (!boardEl) return null;

  // A/A2/B/C/D: use the shared orientation detector (checks attributes, JS props, username pos, etc.)
  const color = _detectOrientationColor(boardEl);
  if (color) return color;

  // Last resort: fallback to isBoardFlipped (no circular dep since _detectOrientationColor is the shared core)
  return isBoardFlipped(boardEl) ? 'b' : 'w';
}

function shouldDisplayBestMoveArrow(boardEl = getBoardElement()) {
  // Show arrow only when it is the player's turn to move.
  // If we cannot determine the player's side, always show.
  if (!boardEl || !lastEvalFen) return true;

  const fenTurn = normalizeTurn(lastEvalFen.split(' ')[1]);
  const playerSide = getPlayerSide(boardEl);
  if (!fenTurn || !playerSide) return true;
  return fenTurn === playerSide;
}

function drawArrow(svg, lineId, startId, x1, y1, x2, y2, cell) {
  const line  = svg.querySelector('#' + lineId);
  const circ  = svg.querySelector('#' + startId);
  if (!line || !circ) return;

  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const pad    = cell * 0.14;
  const lw     = Math.max(3, cell * 0.11);
  const mkSize = lw * 2.5;        // marker scales with line width
  const r      = Math.max(3, cell * 0.11);

  // Shorten end so the line stops before the marker
  const x1p = x1 + ux * pad;
  const y1p = y1 + uy * pad;
  const x2p = x2 - ux * (mkSize * 0.9);
  const y2p = y2 - uy * (mkSize * 0.9);

  line.setAttribute('x1', x1p); line.setAttribute('y1', y1p);
  line.setAttribute('x2', x2p); line.setAttribute('y2', y2p);
  line.setAttribute('stroke-width', String(lw));
  line.setAttribute('marker-end', line.getAttribute('marker-end')); // keep marker
  circ.setAttribute('cx', x1); circ.setAttribute('cy', y1);
  circ.setAttribute('r',  r);
}

function hideArrow(svg, lineId, startId) {
  const line = svg.querySelector('#' + lineId);
  const circ = svg.querySelector('#' + startId);
  if (line) { line.setAttribute('x1', 0); line.setAttribute('y1', 0);
               line.setAttribute('x2', 0); line.setAttribute('y2', 0); }
  if (circ) circ.setAttribute('r', 0);
}

function syncBestMoveOverlay() {
  if (!arrowsEnabled || !currentBestMove) return hideBestMoveOverlay();

  const boardEl = getBoardElement();
  if (!boardEl) return hideBestMoveOverlay();

  const rect = boardEl.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) return hideBestMoveOverlay();

  // Only show arrow when it is MY turn to move
  const playerSide = getPlayerSide(boardEl);
  const fenTurn    = lastEvalFen ? normalizeTurn(lastEvalFen.split(' ')[1]) : null;
  const isMyTurn   = fenTurn && playerSide ? fenTurn === playerSide : false;
  if (!isMyTurn) return hideBestMoveOverlay();

  const from = currentBestMove.slice(0, 2);
  const to   = currentBestMove.slice(2, 4);
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return hideBestMoveOverlay();

  const flipped  = isBoardFlipped(boardEl);
  const startPt  = squareToViewportPoint(from, rect, flipped);
  const endPt    = squareToViewportPoint(to,   rect, flipped);
  if (!startPt || !endPt) return hideBestMoveOverlay();

  const overlay = ensureBestMoveOverlay();
  const svg     = overlay.querySelector('.cse-bestmove-svg');

  overlay.style.left   = '0';
  overlay.style.top    = '0';
  overlay.style.width  = window.innerWidth  + 'px';
  overlay.style.height = window.innerHeight + 'px';
  svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);

  // Always blue — it's always MY move when we reach this point
  drawArrow(svg, 'cse-my-line', 'cse-my-start',
            startPt.x, startPt.y, endPt.x, endPt.y, startPt.cell);
  hideArrow(svg, 'cse-opp-line', 'cse-opp-start');

  overlay.classList.add('cse-bestmove-visible');
}

function setBestMove(bestMove) {
  currentBestMove = extractUciMove(bestMove);
  syncBestMoveOverlay();
}

function cpToWhitePct(cp) {
  // cp is raw centipawns (e.g. 50 = half pawn). Sigmoid tuned to cp units.
  // ±300cp = slight/moderate advantage, ±800cp ≈ decisive
  const pct = 50 + 50 * (2 / (1 + Math.exp(-cp / 200)) - 1);
  return Math.max(2, Math.min(98, pct));
}

function updateEvalBarDisplay(result) {
  const bar = evalBarPanel;
  if (!bar) return;

  const blackSeg = bar.querySelector('[data-cse-part="black"]');
  const whiteSeg = bar.querySelector('[data-cse-part="white"]');
  const scoreEl  = bar.querySelector('[data-cse-part="score"]');

  if (!result) {
    // Could not get eval — show neutral + error indicator
    blackSeg.style.height = '50%';
    whiteSeg.style.height = '50%';
    scoreEl.textContent = '?';
    scoreEl.className = 'cse-eval-score';
    bar.title = 'Eval non disponibile (posizione non trovata o API non raggiungibile)';
    clearBestMoveOverlay();
    return;
  }

  setBestMove(result.bestMove);
  bar.title = result.bestMove ? `Best move: ${result.bestMove}` : '';
  let whitePct, label, cls;

  if (result.mate !== null && result.mate !== undefined) {
    const m = result.mate;
    whitePct = m > 0 ? 97 : 3;
    label = (m > 0 ? '+' : '−') + 'M' + Math.abs(m);
    cls   = m > 0 ? 'cse-eval-white-adv' : 'cse-eval-black-adv';
  } else {
    const cp = result.cp; // raw centipawns
    whitePct = cpToWhitePct(cp);
    const pawns = cp / 100;
    label = (pawns >= 0 ? '+' : '−') + Math.abs(pawns).toFixed(1);
    cls   = cp >  25 ? 'cse-eval-white-adv'
          : cp < -25 ? 'cse-eval-black-adv'
          : '';
  }

  const blackPct = 100 - whitePct;
  blackSeg.style.height = blackPct + '%';
  whiteSeg.style.height = whitePct + '%';
  scoreEl.textContent = label;
  scoreEl.className = 'cse-eval-score ' + cls;
}

function createEvalBar() {
  if (evalBarPanel) return evalBarPanel;

  const bar = document.createElement('div');
  bar.className = 'cse-eval-bar-root';
  bar.innerHTML = `
    <div class="cse-eval-drag-handle" id="cse-eval-drag" title="Trascina per spostare">⠿</div>
    <div class="cse-eval-inner" id="cse-eval-inner">
      <div class="cse-eval-black" data-cse-part="black" style="height:50%"></div>
      <div class="cse-eval-white" data-cse-part="white" style="height:50%"></div>
    </div>
    <div class="cse-eval-score" data-cse-part="score">…</div>
    <div class="cse-eval-label">Eval</div>
    <button class="cse-eval-close" id="cse-eval-close-btn" title="Chiudi">✕</button>
  `;
  document.body.appendChild(bar);

  bar.querySelector('#cse-eval-close-btn').addEventListener('click', removeEvalBar);
  makeEvalBarDraggable(bar);

  evalBarPanel = bar;
  return bar;
}

function makeEvalBarDraggable(bar) {
  const handle = bar.querySelector('#cse-eval-drag');
  let startX, startY, startLeft, startTop;

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const rect = bar.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startLeft = rect.left; startTop = rect.top;

    // Switch from right-anchored to left-anchored positioning
    bar.style.right = 'auto';
    bar.style.left = rect.left + 'px';
    bar.style.top  = rect.top  + 'px';
    bar.style.transform = 'none';

    function onMove(e) {
      bar.style.left = (startLeft + e.clientX - startX) + 'px';
      bar.style.top  = (startTop  + e.clientY - startY) + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

function removeEvalBar() {
  if (evalUpdateInterval) { clearInterval(evalUpdateInterval); evalUpdateInterval = null; }
  evalRequestSeq++;
  if (evalBarPanel) { evalBarPanel.remove(); evalBarPanel = null; }
  clearBestMoveOverlay();
  lastEvalFen = null;
  if (evalToggleBtn) evalToggleBtn.classList.remove('cse-eval-active');
}

let evalPending = false;

async function tickEvalBar() {
  const bar = evalBarPanel;
  if (!bar) return;

  const fen = getFenFromPage();

  if (!fen) {
    evalRequestSeq++;
    lastEvalFen = null;
    bar.querySelector('[data-cse-part="score"]').textContent = '?';
    bar.title = 'Posizione non trovata sulla board';
    hideBestMoveOverlay();
    return;
  }

  if (fen === lastEvalFen) {
    // Position unchanged — just keep overlay in sync (board may have scrolled/resized)
    syncBestMoveOverlay();
    return;
  }
  lastEvalFen = fen;
  const requestSeq = ++evalRequestSeq;
  bar.title = '';

  const scoreEl = bar.querySelector('[data-cse-part="score"]');
  scoreEl.textContent = '…';
  scoreEl.className = 'cse-eval-score cse-eval-thinking';

  const result = await fetchEval(fen);
  if (requestSeq !== evalRequestSeq || lastEvalFen !== fen) return;

  updateEvalBarDisplay(result);
}

function toggleEvalBar() {
  const btn = evalToggleBtn;
  if (evalBarPanel?.isConnected) {
    removeEvalBar();
    return;
  }
  createEvalBar();
  if (btn) btn.classList.add('cse-eval-active');
  tickEvalBar();
  evalUpdateInterval = setInterval(tickEvalBar, 1000);
}

// ─── Eval Toggle Button ────────────────────────────────────────────────────────

function injectEvalToggleButton() {
  if (evalToggleBtn?.isConnected) return;

  const btn = document.createElement('button');
  btn.className = 'cse-eval-toggle-btn';
  btn.title = 'Mostra/nascondi Evaluation Bar';
  btn.textContent = '🧠 Eval';
  btn.addEventListener('click', toggleEvalBar);
  document.body.appendChild(btn);
  evalToggleBtn = btn;
}

// ─── Inject Buttons ───────────────────────────────────────────────────────────

function addStatsButton(usernameEl, username) {
  if (!username || injectedUsernameEls.has(usernameEl)) return;
  injectedUsernameEls.add(usernameEl);

  const btn = document.createElement('button');
  btn.className = 'cse-btn';
  btn.title = `Mostra statistiche di ${username}`;
  btn.textContent = '📈';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    loadStatsForUser(username);
  });
  usernameEl.style.position = 'relative';
  usernameEl.appendChild(btn);
}

function extractUsername(el) {
  // Try data attributes first
  const user = el.dataset.username || el.dataset.user || el.getAttribute('data-player-username');
  if (user) return user.toLowerCase();
  // Fallback: text content (strip whitespace/icons)
  const text = el.textContent.trim().split(/\s/)[0];
  return text.length > 2 ? text.toLowerCase() : null;
}

function scanAndInject() {
  // Selectors for player name elements across chess.com pages
  const selectors = [
    '[data-username]',
    '.user-username-component',
    '.player-tagline-username',
    '.cc-user-display-name',
    '.username',
    '.game-over-username-component',
    '.lobby-player-username',
    '.opponents-username'
  ];

  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => {
      const username = extractUsername(el);
      if (username) addStatsButton(el, username);
    });
  }
}

// ─── Observer ────────────────────────────────────────────────────────────────

function injectArrowsToggleButton() {
  if (arrowsToggleBtn?.isConnected) return;

  const btn = document.createElement('button');
  btn.className = 'cse-arrows-toggle-btn cse-arrows-active';
  btn.title = 'Mostra/nascondi frecce della miglior mossa';
  btn.textContent = '➤ Arrows';
  btn.addEventListener('click', () => {
    arrowsEnabled = !arrowsEnabled;
    btn.classList.toggle('cse-arrows-active', arrowsEnabled);
    if (!arrowsEnabled) hideBestMoveOverlay();
    else syncBestMoveOverlay();
  });
  document.body.appendChild(btn);
  arrowsToggleBtn = btn;
}

function scanAndInjectEval() {
  // Only show eval button if a chess board is visible on the page
  const hasBoard = document.querySelector(
    'chess-board, wc-chess-board, .board-layout-chessboard, [data-fen]'
  );
  if (hasBoard) {
    injectEvalToggleButton();
    injectArrowsToggleButton();
  }
}

window.addEventListener('resize', syncBestMoveOverlay);
window.addEventListener('scroll', syncBestMoveOverlay, true);

const observer = new MutationObserver(() => { scanAndInject(); scanAndInjectEval(); syncBestMoveOverlay(); });
observer.observe(document.body, { childList: true, subtree: true });
scanAndInject();
scanAndInjectEval();

// Re-scan on navigation (SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(scanAndInject, 1000);
  }
}).observe(document, { subtree: true, childList: true });
