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
let lastEvalMoveSourceFen = null;
let currentBestMove = null;
let lastEvalTopMoves = [];
let bestMoveOverlay = null;
let evalToggleBtn = null;
let toolsModal = null;
let guiRefreshInterval = null;
let arrowsEnabled = true; // Toggle per le frecce
let isEvalBarEnabled = false;
let isGuiHudEnabled = false;
let guiHudPanel = null;
let automoveMode = 'blatant'; // 'blatant' | 'legit'
let automoveDelayMin = 1;  // seconds (user configurable)
let automoveDelayMax = 5;  // seconds (user configurable)
let suggestMoveDepth = 15; // depth for SuggestMove/Arrows (user configurable)
const FEN_SEARCH_MAX_DEPTH = 3;
const FEN_SEARCH_MAX_NODES = 250;
const EVAL_CACHE_TTL = 12 * 1000;
const CSE_STATE_KEY = 'cse_mod_state_v1';

function cseReadState() {
  try {
    const raw = localStorage.getItem(CSE_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function cseSaveState() {
  const evalRect = evalBarPanel?.isConnected ? evalBarPanel.getBoundingClientRect() : null;
  const state = {
    favorites: { ...(cseGuiState?.favorites || {}) },
    activeTab: cseGuiState?.activeTab || 'ALL',
    modules: {
      AutoMove: !!isAutomoveEnabled,
      SuggestMove: !!arrowsEnabled,
      EvaluationBar: !!isEvalBarEnabled,
      GUI: !!isGuiHudEnabled,
    },
    settings: {
      automoveMode,
      automoveDelayMin,
      automoveDelayMax,
      suggestMoveDepth,
    },
    evalBarPosition: evalRect ? { left: Math.round(evalRect.left), top: Math.round(evalRect.top) } : null,
  };
  try {
    localStorage.setItem(CSE_STATE_KEY, JSON.stringify(state));
  } catch {}
}

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

function pieceAtFenSquare(board, square) {
  if (!Array.isArray(board) || !/^[a-h][1-8]$/i.test(square)) return null;
  const file = square.toLowerCase().charCodeAt(0) - 97; // a=0
  const rank = parseInt(square[1], 10); // 1..8
  const row = 8 - rank; // rank8 -> row0
  return board[row]?.[file] || null;
}

function isMoveConsistentWithFen(move, fen) {
  if (!move || !fen || typeof fen !== 'string') return false;
  const uci = extractUciMove(move);
  if (!uci || uci.length < 4) return false;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return false;

  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return false;
  const board = expandFenBoard(parts[0]);
  const turn = normalizeTurn(parts[1]);
  if (!board || !turn) return false;

  const fromPiece = pieceAtFenSquare(board, from);
  if (!fromPiece) return false;
  const fromColor = /[A-Z]/.test(fromPiece) ? 'w' : 'b';
  if (fromColor !== turn) return false;

  const toPiece = pieceAtFenSquare(board, to);
  if (toPiece) {
    const toColor = /[A-Z]/.test(toPiece) ? 'w' : 'b';
    if (toColor === fromColor) return false;
  }
  return true;
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
// IMPORTANT: This function must NOT call getPlayerSide() or getExplicitBoardFlipState()
// because both internally call inferPlayerSideFromClockAndTurn → detectSideToMove → here,
// causing infinite recursion (Maximum call stack size exceeded).
// Use _detectOrientationColor() directly instead — it has no circular dependency.
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
  if (!boardEl) return null;

  // Use _detectOrientationColor directly — avoids the circular recursion that
  // would happen if we called getPlayerSide() or getExplicitBoardFlipState().
  const playerSide = _detectOrientationColor(boardEl);

  for (const clockEl of candidates) {
    const rect = clockEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    // Determine whether this clock is in the bottom half of the viewport.
    const boardRect = boardEl ? boardEl.getBoundingClientRect() : null;
    const midY      = boardRect
      ? boardRect.top + boardRect.height / 2
      : window.innerHeight / 2;
    const isBottom  = rect.top + rect.height / 2 > midY;

    if (playerSide) {
      // Active clock is the side TO MOVE.
      // If it's at the bottom and I'm white (white = bottom), then white is to move.
      // If it's at the top and I'm white, then black is to move.
      return isBottom ? playerSide : (playerSide === 'w' ? 'b' : 'w');
    }

    // ── IMPORTANT: Do NOT guess when orientation is unknown. ──
    // On chess.com the local player is ALWAYS at the bottom regardless of color
    // (the board flips so black's pieces are also at the bottom when playing black).
    // Therefore "isBottom=true" tells us nothing about color without knowing orientation.
    // Return null so other detection methods (ply count, highlights, etc.) can decide.
    return null;
  }

  return null;
}

function extractPieceColorFromClassName(className) {
  if (typeof className !== 'string') return null;
  if (/(^|\s)w[pnbrqk](\s|$)/i.test(className)) return 'w';
  if (/(^|\s)b[pnbrqk](\s|$)/i.test(className)) return 'b';
  return null;
}

function detectTurnFromBoardHighlights(boardEl = getBoardElement()) {
  if (!boardEl) return null;
  const roots = [boardEl.shadowRoot, boardEl].filter(Boolean);
  const pieceBySq = new Map();
  const highlighted = [];

  for (const root of roots) {
    let allSqEls = [];
    try { allSqEls = Array.from(root.querySelectorAll('[class*="square-"]')); } catch {}
    for (const el of allSqEls) {
      const cls = typeof el.className === 'string' ? el.className : String(el.className || '');
      const sqMatch = cls.match(/square-(\d)(\d)/);
      if (!sqMatch) continue;
      const sqKey = sqMatch[1] + sqMatch[2];
      const color = extractPieceColorFromClassName(cls);
      if (color) pieceBySq.set(sqKey, color);
      if (/highlight/i.test(cls)) highlighted.push({ sqKey, cls });
    }
  }

  if (!highlighted.length) return null;
  const ranked = highlighted.sort((a, b) => {
    const aScore = /last|move|to/i.test(a.cls) ? 2 : 1;
    const bScore = /last|move|to/i.test(b.cls) ? 2 : 1;
    return bScore - aScore;
  });

  for (const h of ranked) {
    const movedColor = pieceBySq.get(h.sqKey);
    if (movedColor) return movedColor === 'w' ? 'b' : 'w';
  }
  return null;
}

function getActiveClockElement() {
  return [
    document.querySelector('.clock-component.clock-player-turn'),
    document.querySelector('[class*="clock-player-turn"]'),
    document.querySelector('.player-clock.clock-player-turn'),
    document.querySelector('[class*="clock"][class*="player-turn"]')
  ].find(Boolean) || null;
}

function isElementBottomHalf(el, boardEl = getBoardElement()) {
  if (!el) return null;
  try {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    const boardRect = boardEl?.getBoundingClientRect?.();
    const midY = (boardRect && boardRect.height > 40)
      ? boardRect.top + boardRect.height / 2
      : window.innerHeight / 2;
    return rect.top + rect.height / 2 > midY;
  } catch {
    return null;
  }
}

// Infer local player side using currently active clock position + known side-to-move.
// IMPORTANT: Do NOT call detectSideToMove() here — that function calls
// detectTurnFromActiveClock() which calls getPlayerSide() which calls this
// function, causing infinite recursion. Only use lastEvalFen as source of truth.
function inferPlayerSideFromClockAndTurn(boardEl = getBoardElement()) {
  const clockEl = getActiveClockElement();
  if (!clockEl) return null;
  const isBottom = isElementBottomHalf(clockEl, boardEl);
  if (isBottom === null) return null;

  // Only rely on lastEvalFen — never call detectSideToMove() here.
  const fenTurn = normalizeTurn((lastEvalFen || '').split(' ')[1]);
  if (!fenTurn) return null;

  // Active clock belongs to side-to-move.
  // If active clock is bottom, local side == turn; otherwise opposite.
  return isBottom ? fenTurn : (fenTurn === 'w' ? 'b' : 'w');
}

// ── Automove ─────────────────────────────────────────────────────────────────
let isAutomoveEnabled = false;
let automoveTimeout = null;
let automoveUiInterval = null;
let automoveScheduledAt = 0;
let automoveDelayMs = 0;
let automovePlannedMove = null;
let automoveTargetFen = null;
let automoveBlockedKey = null;
let automoveBlockedUntil = 0;
const AUTOMOVE_DEBUG = true;
let lastLoggedPlayerSide = null;
let playerSideCache = { side: null, ts: 0 };

function isSameFenBoardAndTurn(fenA, fenB) {
  if (!fenA || !fenB) return true;
  const a = String(fenA).trim().split(/\s+/);
  const b = String(fenB).trim().split(/\s+/);
  if (a.length < 2 || b.length < 2) return true;
  return a[0] === b[0] && a[1] === b[1];
}

function getFenBoardAndTurn(fen) {
  if (!fen || typeof fen !== 'string') return null;
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2 || !expandFenBoard(parts[0]) || !normalizeTurn(parts[1])) return null;
  return `${parts[0]} ${parts[1]}`;
}

function makeAutomoveBlockKey(fen, move) {
  const boardAndTurn = getFenBoardAndTurn(fen);
  const uci = extractUciMove(move);
  if (!boardAndTurn || !uci) return null;
  return `${boardAndTurn}|${uci}`;
}

function isAutomoveBlockedFor(fen, move) {
  const key = makeAutomoveBlockKey(fen, move);
  if (!key) return false;
  if (automoveBlockedKey !== key) return false;
  if (now() >= automoveBlockedUntil) {
    automoveBlockedKey = null;
    automoveBlockedUntil = 0;
    return false;
  }
  return true;
}

function blockAutomoveFor(fen, move, ms = 7000) {
  const key = makeAutomoveBlockKey(fen, move);
  if (!key) return;
  automoveBlockedKey = key;
  automoveBlockedUntil = now() + ms;
}

function clearAutomoveBlock() {
  automoveBlockedKey = null;
  automoveBlockedUntil = 0;
}

function isMovePlayableNow(move, evalFen = lastEvalFen) {
  const uci = extractUciMove(move);
  if (!uci) return false;
  if (evalFen && !isMoveConsistentWithFen(uci, evalFen)) return false;
  const boardFen = fenFromPieces();
  if (!boardFen) return true;
  if (evalFen && !isSameFenBoardAndTurn(boardFen, evalFen)) return false;
  return isMoveConsistentWithFen(uci, boardFen);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function automoveLog(...args) {
  if (!AUTOMOVE_DEBUG) return;
  console.log('[ChessStats][AutoMove]', ...args);
}

function logDetectedPlayerColor(boardEl = getBoardElement()) {
  const side = getPlayerSide(boardEl);
  if (!side) {
    if (lastLoggedPlayerSide !== 'unknown') {
      lastLoggedPlayerSide = 'unknown';
      console.log('[ChessStats] colore: non rilevato');
    }
    return;
  }
  if (side === lastLoggedPlayerSide) return;
  lastLoggedPlayerSide = side;
  console.log(`[ChessStats] colore: ${side === 'b' ? 'nero' : 'bianco'}`);
}

function detectOrientationFromBoardCoordinates(boardEl) {
  if (!boardEl) return null;
  let rect;
  try {
    rect = boardEl.getBoundingClientRect();
  } catch {
    return null;
  }
  if (!rect || rect.width < 80 || rect.height < 80) return null;

  // Search both the regular DOM AND the board's shadow root.
  // chess.com renders rank/file coordinate labels inside the wc-chess-board
  // shadow DOM, so document.querySelectorAll() alone misses them.
  const searchRoots = [document, boardEl.shadowRoot].filter(Boolean);
  const textNodes = [];
  for (const root of searchRoots) {
    try { textNodes.push(...Array.from(root.querySelectorAll('span, div, [class*="coordinate"]'))); } catch {}
  }

  // Heuristic 1: top-left rank label.
  let topRank = null;
  let topRankY = Infinity;
  for (const el of textNodes) {
    const t = (el.textContent || '').trim();
    if (!/^[1-8]$/.test(t)) continue;
    let r;
    try { r = el.getBoundingClientRect(); } catch { continue; }
    if (r.width === 0 || r.height === 0) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cy < rect.top - 10 || cy > rect.bottom + 10) continue;
    if (cx < rect.left - 34 || cx > rect.left + 46) continue;
    if (cy < topRankY) {
      topRankY = cy;
      topRank = t;
    }
  }
  if (topRank === '1') return 'b';
  if (topRank === '8') return 'w';

  // Heuristic 2: left-most file label on the bottom edge.
  let leftFile = null;
  let leftFileX = Infinity;
  for (const el of textNodes) {
    const t = (el.textContent || '').trim().toLowerCase();
    if (!/^[a-h]$/.test(t)) continue;
    let r;
    try { r = el.getBoundingClientRect(); } catch { continue; }
    if (r.width === 0 || r.height === 0) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < rect.left - 10 || cx > rect.right + 10) continue;
    if (cy < rect.bottom - 44 || cy > rect.bottom + 34) continue;
    if (cx < leftFileX) {
      leftFileX = cx;
      leftFile = t;
    }
  }
  if (leftFile === 'h') return 'b';
  if (leftFile === 'a') return 'w';

  return null;
}

function inferPlayerSideFromPieceDistribution(boardEl = getBoardElement()) {
  if (!boardEl) return null;
  let rect;
  try { rect = boardEl.getBoundingClientRect(); } catch { return null; }
  if (!rect || rect.width < 80 || rect.height < 80) return null;
  const roots = [boardEl.shadowRoot, boardEl].filter(Boolean);
  let bottomW = 0, bottomB = 0, seen = 0;

  for (const root of roots) {
    let els = [];
    try { els = Array.from(root.querySelectorAll('[class*="square-"]')); } catch {}
    for (const el of els) {
      const cls = typeof el.className === 'string' ? el.className : String(el.className || '');
      const color = extractPieceColorFromClassName(cls);
      if (!color) continue;
      let er;
      try { er = el.getBoundingClientRect(); } catch { continue; }
      if (!er || er.width === 0 || er.height === 0) continue;
      const cy = er.top + er.height / 2;
      const bottomHalf = cy > rect.top + rect.height / 2;
      if (!bottomHalf) continue;
      seen++;
      if (color === 'w') bottomW++;
      else bottomB++;
    }
  }

  if (seen < 2) return null;
  if (bottomW === bottomB) return null;
  return bottomB > bottomW ? 'b' : 'w';
}

function getAutomoveCandidateMove() {
  if (lastEvalMoveSourceFen !== lastEvalFen) return null;
  const fallbackRaw = extractUciMove(currentBestMove);
  const fallback = isMovePlayableNow(fallbackRaw, lastEvalFen) ? fallbackRaw : null;
  if (automoveMode !== 'legit') return fallback;
  const pool = Array.from(new Set((lastEvalTopMoves || [])
    .map(extractUciMove)
    .filter(m => isMovePlayableNow(m, lastEvalFen))
  )).slice(0, 3);
  if (!pool.length) return fallback;
  return pool[Math.floor(Math.random() * pool.length)] || fallback;
}

function updateAutomoveModeUI() {
  if (toolsModal?.isConnected) cseRenderGui();
}

function clearAutomoveSchedule(clearTimer = true) {
  if (automoveTimeout) {
    clearTimeout(automoveTimeout);
    automoveTimeout = null;
  }
  automoveScheduledAt = 0;
  automoveDelayMs = 0;
  automovePlannedMove = null;
  automoveTargetFen = null;
  if (clearTimer) {
    const timerEl = document.getElementById('cse-automove-timer');
    if (timerEl) timerEl.textContent = '';
  }
}

function updateAutomoveButtonState() {
  const timerEl = document.getElementById('cse-mc-timer-badge');
  if (timerEl) {
    if (!isAutomoveEnabled || !automoveScheduledAt || automoveDelayMs <= 0) {
      timerEl.textContent = '';
    } else {
      const remainingMs = Math.max(0, automoveDelayMs - (now() - automoveScheduledAt));
      timerEl.textContent = 'ETA ' + (remainingMs / 1000).toFixed(1) + 's';
    }
  }
  if (isGuiHudEnabled) syncGuiHudPanel();
}

function startAutomoveUiTicker() {
  if (automoveUiInterval) return;
  automoveUiInterval = setInterval(updateAutomoveButtonState, 100);
}

function stopAutomoveUiTicker() {
  if (!automoveUiInterval) return;
  clearInterval(automoveUiInterval);
  automoveUiInterval = null;
}

function executeAutomoveMove(bestMove) {
  const boardEl = getBoardElement();
  if (!boardEl || !bestMove || bestMove.length < 4) return false;

  const fromSq = bestMove.substring(0, 2);
  const toSq = bestMove.substring(2, 4);
  const promotion = bestMove.length >= 5 ? bestMove[4].toLowerCase() : undefined;
  const rect = boardEl.getBoundingClientRect();
  const flipped = isBoardFlipped(boardEl);
  const fromPt = squareToViewportPoint(fromSq, rect, flipped);
  const toPt = squareToViewportPoint(toSq, rect, flipped);
  if (!fromPt || !toPt) return false;

  const apiTargets = [boardEl, boardEl?.game, boardEl?.controller].filter(Boolean);
  const apiMethods = ['move', 'makeMove', 'playMove', 'applyMove', 'tryMove'];
  for (const target of apiTargets) {
    for (const method of apiMethods) {
      const fn = target?.[method];
      if (typeof fn !== 'function') continue;
      const argsList = [
        [bestMove],
        [{ from: fromSq, to: toSq, promotion }],
        [fromSq, toSq, promotion],
        [fromSq + toSq + (promotion || '')]
      ];
      for (const args of argsList) {
        try {
          const out = fn.apply(target, args);
          automoveLog('internal api attempt', method, args, out);
          if (out === false) continue;
          return true;
        } catch {}
      }
    }
  }

  const dispatchAtPoint = (type, pt, buttons = 0) => {
    const rawTarget = document.elementFromPoint(pt.x, pt.y);
    const isInsideBoard = !!(rawTarget && (rawTarget === boardEl || boardEl.contains(rawTarget)));
    const target = isInsideBoard ? rawTarget : boardEl;
    if (!target) return false;
    const evt = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: pt.x,
      clientY: pt.y,
      button: 0,
      buttons
    });
    target.dispatchEvent(evt);
    return true;
  };

  // Try pointer + drag-like interaction first.
  dispatchAtPoint('pointermove', fromPt, 0);
  dispatchAtPoint('pointerdown', fromPt, 1);
  dispatchAtPoint('pointermove', toPt, 1);
  dispatchAtPoint('pointerup', toPt, 0);
  dispatchAtPoint('mousemove', fromPt, 0);
  dispatchAtPoint('mousedown', fromPt, 1);
  dispatchAtPoint('mousemove', toPt, 1);
  dispatchAtPoint('mouseup', toPt, 0);

  // Fallback: click source then destination.
  dispatchAtPoint('click', fromPt, 0);
  dispatchAtPoint('click', toPt, 0);
  automoveLog('event fallback sent', { fromSq, toSq, promotion });
  return true;
}

async function performAutomove() {
  if (!isAutomoveEnabled) {
    automoveLog('cancel: disabled');
    clearAutomoveSchedule();
    return;
  }

  const boardEl = getBoardElement();
  if (!boardEl) {
    automoveLog('cancel: no board');
    clearAutomoveSchedule();
    return;
  }

  const playerSide = getPlayerSide(boardEl);
  const turn = detectSideToMove();
  const bestMove = getAutomoveCandidateMove();
  const hasPlannedForCurrentFen = !!(automoveTimeout && automoveTargetFen === lastEvalFen && automovePlannedMove);

  // Keep an already planned move stable for the same FEN to avoid countdown resets
  // (especially in legit mode where candidate can change every eval tick).
  if (hasPlannedForCurrentFen) {
    const plannedBlocked = isAutomoveBlockedFor(automoveTargetFen, automovePlannedMove);
    const plannedPlayable = isMovePlayableNow(automovePlannedMove, automoveTargetFen);
    const turnMismatch = !!(playerSide && turn && playerSide !== turn);

    if (!plannedBlocked && plannedPlayable && !turnMismatch) {
      updateAutomoveButtonState();
      return;
    }

    if (turnMismatch) {
      automoveLog('cancel: planned move dropped because turn changed', {
        playerSide,
        turn,
        move: automovePlannedMove
      });
      clearAutomoveSchedule();
      return;
    }

    automoveLog('reschedule: planned move no longer valid', {
      move: automovePlannedMove,
      plannedBlocked,
      plannedPlayable
    });
    clearAutomoveSchedule(false);
  }

  if (playerSide !== turn || !bestMove || !lastEvalFen || !isMovePlayableNow(bestMove, lastEvalFen)) {
    automoveLog('cancel: preconditions', {
      playerSide,
      turn,
      bestMove,
      lastEvalFen,
      orientationColor: _detectOrientationColor(boardEl),
      activeClock: !!getActiveClockElement()
    });
    clearAutomoveSchedule();
    return;
  }
  if (isAutomoveBlockedFor(lastEvalFen, bestMove)) {
    automoveLog('cancel: move temporarily blocked after recent failed retries', { move: bestMove });
    clearAutomoveSchedule(false);
    updateAutomoveButtonState();
    return;
  }

  const needsReschedule = !automoveTimeout || automoveTargetFen !== lastEvalFen;
  if (!needsReschedule) {
    updateAutomoveButtonState();
    return;
  }

  clearAutomoveSchedule(false);
  automovePlannedMove = bestMove;
  automoveTargetFen = lastEvalFen;
  automoveDelayMs = (automoveDelayMin * 1000) + Math.floor(Math.random() * ((automoveDelayMax - automoveDelayMin) * 1000 + 1));
  automoveScheduledAt = now();
  automoveLog('scheduled', {
    move: automovePlannedMove,
    delayMs: automoveDelayMs,
    side: playerSide,
    mode: automoveMode,
    topMoves: (lastEvalTopMoves || []).slice(0, 3)
  });
  updateAutomoveButtonState();
  startAutomoveUiTicker();

  automoveTimeout = setTimeout(() => {
    automoveTimeout = null;
    const currentBoard = getBoardElement();
    if (!isAutomoveEnabled || !currentBoard) {
      automoveLog('cancel: disabled or board missing at fire time');
      clearAutomoveSchedule();
      return;
    }
    const side = getPlayerSide(currentBoard);
    const nowTurn = detectSideToMove();
    const liveFen = getFenFromPage();
    const liveBoardFen = fenFromPieces();
    if (side !== nowTurn) {
      automoveLog('cancel: not my turn at fire time', { side, nowTurn });
      clearAutomoveSchedule();
      return;
    }
    if (!isSameFenBoardAndTurn(liveFen, automoveTargetFen)) {
      automoveLog('cancel: position changed before move', { liveFen, target: automoveTargetFen });
      clearAutomoveSchedule();
      return;
    }
    if (liveBoardFen && !isSameFenBoardAndTurn(liveBoardFen, automoveTargetFen)) {
      automoveLog('cancel: live board snapshot differs from target', { liveBoardFen, target: automoveTargetFen });
      clearAutomoveSchedule();
      return;
    }
    if (!isMovePlayableNow(automovePlannedMove, automoveTargetFen)) {
      automoveLog('cancel: move no longer playable on current board snapshot', { move: automovePlannedMove });
      clearAutomoveSchedule();
      return;
    }
    const sent = executeAutomoveMove(automovePlannedMove);
    automoveLog('move dispatched', { move: automovePlannedMove, sent });
    if (!sent) {
      blockAutomoveFor(automoveTargetFen, automovePlannedMove);
      clearAutomoveSchedule();
      return;
    }

    // Verify if turn changed; if not, try one more time quickly.
    sleep(220).then(() => {
      const turnAfter = detectSideToMove();
      if (!isAutomoveEnabled) {
        clearAutomoveSchedule();
        return;
      }
      if (turnAfter !== side) {
        automoveLog('success: turn changed after move', { before: side, after: turnAfter });
        clearAutomoveBlock();
        clearAutomoveSchedule();
        return;
      }
      automoveLog('retry: turn unchanged after first dispatch');
      const retrySent = executeAutomoveMove(automovePlannedMove);
      if (!retrySent) {
        automoveLog('retry failed: dispatch not sent');
      }
      blockAutomoveFor(automoveTargetFen, automovePlannedMove);
      clearAutomoveSchedule();
    });
  }, automoveDelayMs);
}

let _detectSideToMoveInProgress = false;

function detectSideToMove() {
  // Recursion guard — if we're already inside this function on the call stack,
  // return null rather than blowing the stack. This prevents cycles where
  // detectTurnFromActiveClock → _detectOrientationColor (or other helpers)
  // end up back here indirectly.
  if (_detectSideToMoveInProgress) return null;
  _detectSideToMoveInProgress = true;
  try {
    return _detectSideToMoveImpl();
  } finally {
    _detectSideToMoveInProgress = false;
  }
}

function _detectSideToMoveImpl() {
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

  // ── Priority 1.5: board highlights (last move destination piece color) ───
  const hlTurn = detectTurnFromBoardHighlights();
  if (hlTurn) return hlTurn;

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
    // Important: FEN coordinates are always white-oriented and MUST NOT depend
    // on the current UI board orientation (flipped when playing black).
    const col = file;
    const row = 7 - rank;

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
  const normalizeTopMoves = (moves) =>
    Array.from(new Set((moves || []).map(extractUciMove).filter(Boolean))).slice(0, 3);

  // Primary: stockfish.online — real Stockfish engine, depth 15
  try {
    const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${suggestMoveDepth}`;
    const res = await fetch(url, { signal });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        const bestMove = extractUciMove(data.bestmove);
        if (data.mate !== null && data.mate !== undefined && data.mate !== 0) {
          const result = { cp: null, mate: turn === 'w' ? data.mate : -data.mate, bestMove, topMoves: normalizeTopMoves([bestMove]) };
          setCachedEval(fen, result);
          return result;
        }
        const cpRaw = Math.round(parseFloat(data.evaluation) * 100);
        const cp = turn === 'w' ? cpRaw : -cpRaw;
        if (!isNaN(cp)) {
          const result = { cp, mate: null, bestMove, topMoves: normalizeTopMoves([bestMove]) };
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
    const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=3`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal });
    if (res.ok) {
      const data = await res.json();
      const topMoves = normalizeTopMoves((data.pvs || []).map(pv => pv.moves));
      const pv = data.pvs && data.pvs[0];
      if (pv) {
        const bestMove = extractUciMove(pv.moves);
        if (pv.mate !== undefined) {
          const result = { cp: null, mate: turn === 'w' ? pv.mate : -pv.mate, bestMove, topMoves: normalizeTopMoves([bestMove, ...topMoves]) };
          setCachedEval(fen, result);
          return result;
        }
        if (pv.cp  !== undefined) {
          const result = { cp: turn === 'w' ? pv.cp : -pv.cp, mate: null, bestMove, topMoves: normalizeTopMoves([bestMove, ...topMoves]) };
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

  // ── 7. White king visual position — most reliable visual indicator ──────────
  // On chess.com the local player's pieces are always at the bottom (the board
  // flips when playing black). So:
  //   white king in BOTTOM half of board → white is at bottom → player is WHITE
  //   white king in TOP half of board    → white is at top   → player is BLACK (flipped board)
  // This works regardless of whether orientation/flipped attributes are set.
  try {
    let boardRect;
    try { boardRect = boardEl.getBoundingClientRect(); } catch {}
    if (boardRect && boardRect.height > 80) {
      const midY = boardRect.top + boardRect.height / 2;
      const roots = [boardEl.shadowRoot, boardEl].filter(Boolean);
      outer: for (const root of roots) {
        let els;
        try { els = root.querySelectorAll('[class*="square-"]'); } catch { continue; }
        for (const el of els) {
          const cls = typeof el.className === 'string' ? el.className : String(el.className || '');
          // Match white king: class list must contain 'wk' as a whole word
          if (!/(?:^|\s)wk(?:\s|$)/.test(cls)) continue;
          let er;
          try { er = el.getBoundingClientRect(); } catch { continue; }
          if (!er || er.width === 0 || er.height === 0) continue;
          const cy = er.top + er.height / 2;
          // White king below midpoint → white at bottom → playing white
          // White king above midpoint → white at top → playing black (flipped)
          const detected = cy > midY ? 'w' : 'b';
          playerSideCache = { side: detected, ts: now() };
          return detected;
        }
      }
    }
  } catch {}

  // ── 8. Board coordinate labels ───────────────────────────────────────────
  // Search both regular DOM and the board's shadow root (chess.com renders
  // rank/file labels inside the web component's shadow root).
  const coordColor = detectOrientationFromBoardCoordinates(boardEl);
  if (coordColor) return coordColor;

  return null; // genuinely unknown
}

function isBoardFlipped(boardEl = getBoardElement()) {
  const playerSide = getPlayerSide(boardEl);
  if (playerSide === 'b') return true;
  if (playerSide === 'w') return false;
  return false; // safe default
}

function getExplicitBoardFlipState(boardEl = getBoardElement()) {
  const playerSide = getPlayerSide(boardEl);
  if (playerSide === 'b') return true;
  if (playerSide === 'w') return false;
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
  if (playerSideCache.side && now() - playerSideCache.ts < 3000) return playerSideCache.side;

  // A/A2/B/C/D: use the shared orientation detector (checks attributes, JS props, username pos, etc.)
  const color = _detectOrientationColor(boardEl);
  if (color) {
    playerSideCache = { side: color, ts: now() };
    return color;
  }

  const inferred = inferPlayerSideFromClockAndTurn(boardEl);
  if (inferred) {
    playerSideCache = { side: inferred, ts: now() };
    return inferred;
  }

  const byPieces = inferPlayerSideFromPieceDistribution(boardEl);
  if (byPieces) {
    playerSideCache = { side: byPieces, ts: now() };
    return byPieces;
  }

  // Do not guess: unknown is safer than assuming white.
  return null;
}

function shouldDisplayBestMoveArrow(boardEl = getBoardElement()) {
  // Show arrow only when it is the player's turn to move.
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
  if (!isMoveConsistentWithFen(currentBestMove, lastEvalFen)) return hideBestMoveOverlay();

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
  if (!result) {
    currentBestMove = null;
    lastEvalTopMoves = [];
    lastEvalMoveSourceFen = null;
    clearBestMoveOverlay();

    if (evalBarPanel?.isConnected) {
      const blackSeg = evalBarPanel.querySelector('[data-cse-part="black"]');
      const whiteSeg = evalBarPanel.querySelector('[data-cse-part="white"]');
      const scoreEl = evalBarPanel.querySelector('[data-cse-part="score"]');
      if (blackSeg && whiteSeg && scoreEl) {
        blackSeg.style.height = '50%';
        whiteSeg.style.height = '50%';
        scoreEl.textContent = '?';
        scoreEl.className = 'cse-eval-score';
      }
      evalBarPanel.title = 'Eval non disponibile (posizione non trovata o API non raggiungibile)';
    }
    return;
  }

  lastEvalMoveSourceFen = lastEvalFen;
  lastEvalTopMoves = Array.isArray(result.topMoves) ? result.topMoves.slice(0, 3) : [];
  setBestMove(result.bestMove);

  let whitePct;
  let label;
  let cls;

  if (result.mate !== null && result.mate !== undefined) {
    const m = result.mate;
    whitePct = m > 0 ? 97 : 3;
    label = (m > 0 ? '+' : '-') + 'M' + Math.abs(m);
    cls = m > 0 ? 'cse-eval-white-adv' : 'cse-eval-black-adv';
  } else {
    const cp = result.cp; // raw centipawns
    whitePct = cpToWhitePct(cp);
    const pawns = cp / 100;
    label = (pawns >= 0 ? '+' : '-') + Math.abs(pawns).toFixed(1);
    cls = cp > 25 ? 'cse-eval-white-adv'
      : cp < -25 ? 'cse-eval-black-adv'
      : '';
  }

  if (evalBarPanel?.isConnected) {
    const blackSeg = evalBarPanel.querySelector('[data-cse-part="black"]');
    const whiteSeg = evalBarPanel.querySelector('[data-cse-part="white"]');
    const scoreEl = evalBarPanel.querySelector('[data-cse-part="score"]');
    if (blackSeg && whiteSeg && scoreEl) {
      const blackPct = 100 - whitePct;
      blackSeg.style.height = blackPct + '%';
      whiteSeg.style.height = whitePct + '%';
      scoreEl.textContent = label;
      scoreEl.className = 'cse-eval-score ' + cls;
    }
    evalBarPanel.title = result.bestMove ? `Best move: ${result.bestMove}` : '';
  }
}
const cseGuiState = {
  activeTab: 'ALL',
  favorites: { AutoMove: false, SuggestMove: false, EvaluationBar: false, GUI: false },
  openSettings: null,
};

function applySavedGuiAndModuleState() {
  const saved = cseReadState();
  if (!saved) return;

  if (saved.favorites && typeof saved.favorites === 'object') {
    cseGuiState.favorites = {
      ...cseGuiState.favorites,
      AutoMove: !!saved.favorites.AutoMove,
      SuggestMove: !!saved.favorites.SuggestMove,
      EvaluationBar: !!saved.favorites.EvaluationBar,
      GUI: !!saved.favorites.GUI,
    };
  }

  if (saved.activeTab === 'ALL' || saved.activeTab === 'FAVORITE') {
    cseGuiState.activeTab = saved.activeTab;
  }

  if (saved.modules && typeof saved.modules === 'object') {
    isAutomoveEnabled = !!saved.modules.AutoMove;
    arrowsEnabled = !!saved.modules.SuggestMove;
    isEvalBarEnabled = !!saved.modules.EvaluationBar;
    isGuiHudEnabled = !!saved.modules.GUI;
  }

  if (saved.settings && typeof saved.settings === 'object') {
    if (saved.settings.automoveMode === 'legit' || saved.settings.automoveMode === 'blatant') automoveMode = saved.settings.automoveMode;
    if (Number.isFinite(saved.settings.automoveDelayMin)) automoveDelayMin = Math.max(1, Math.min(15, Math.round(saved.settings.automoveDelayMin)));
    if (Number.isFinite(saved.settings.automoveDelayMax)) automoveDelayMax = Math.max(1, Math.min(15, Math.round(saved.settings.automoveDelayMax)));
    if (automoveDelayMax < automoveDelayMin) automoveDelayMax = automoveDelayMin;
    if (Number.isFinite(saved.settings.suggestMoveDepth)) suggestMoveDepth = Math.max(1, Math.min(15, Math.round(saved.settings.suggestMoveDepth)));
  }
}

function getSavedEvalBarPosition() {
  const saved = cseReadState();
  const p = saved?.evalBarPosition;
  if (!p || !Number.isFinite(p.left) || !Number.isFinite(p.top)) return null;
  return { left: Math.round(p.left), top: Math.round(p.top) };
}

function clampToViewport(el, left, top) {
  const maxLeft = Math.max(0, window.innerWidth - el.offsetWidth);
  const maxTop = Math.max(0, window.innerHeight - el.offsetHeight);
  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
  };
}

function isEvaluationEngineNeeded() {
  return !!(isEvalBarEnabled || arrowsEnabled || isAutomoveEnabled);
}

function stopEvalEngine() {
  if (evalUpdateInterval) {
    clearInterval(evalUpdateInterval);
    evalUpdateInterval = null;
  }
  evalRequestSeq++;
  clearAutomoveSchedule();
  lastEvalFen = null;
  lastEvalMoveSourceFen = null;
  currentBestMove = null;
  lastEvalTopMoves = [];
  hideBestMoveOverlay();
}

function ensureEvalEngineState(forceTick = false) {
  const needed = isEvaluationEngineNeeded();
  if (!needed) {
    stopEvalEngine();
    return;
  }
  if (!evalUpdateInterval) {
    tickEvalBar();
    evalUpdateInterval = setInterval(tickEvalBar, 1000);
    return;
  }
  if (forceTick) tickEvalBar();
}

function getActiveModuleHudEntries() {
  const entries = [];
  if (isAutomoveEnabled) {
    let timer = '';
    if (automoveScheduledAt && automoveDelayMs > 0) {
      const remainingMs = Math.max(0, automoveDelayMs - (now() - automoveScheduledAt));
      timer = 'ETA ' + (remainingMs / 1000).toFixed(1) + 's';
    }
    entries.push({
      key: 'AutoMove|' + timer,
      html: `AutoMove${timer ? ` <span class="cse-gui-hud-timer">${timer}</span>` : ''}`,
    });
  }
  if (arrowsEnabled) entries.push({ key: 'SuggestMove', html: 'SuggestMove' });
  if (isEvalBarEnabled) entries.push({ key: 'EvaluationBar', html: 'EvaluationBar' });
  if (isGuiHudEnabled) entries.push({ key: 'GUI', html: 'GUI' });
  return entries;
}

function removeGuiHudPanel() {
  if (guiHudPanel?.isConnected) guiHudPanel.remove();
  guiHudPanel = null;
}

function ensureGuiHudPanel() {
  if (guiHudPanel?.isConnected) return guiHudPanel;
  const panel = document.createElement('div');
  panel.className = 'cse-gui-hud';
  panel.innerHTML = '<div class="cse-gui-hud-list"></div>';
  document.body.appendChild(panel);
  guiHudPanel = panel;
  return panel;
}

function syncGuiHudPanel() {
  if (!isGuiHudEnabled) {
    removeGuiHudPanel();
    return;
  }
  const panel = ensureGuiHudPanel();
  const list = panel.querySelector('.cse-gui-hud-list');
  if (!list) return;
  const entries = getActiveModuleHudEntries();
  const safeEntries = entries.length ? entries : [{ key: 'GUI', html: 'GUI' }];
  const signature = safeEntries.map(e => e.key).join('|');
  if (list.dataset.cseSignature === signature) return;
  list.dataset.cseSignature = signature;
  list.innerHTML = safeEntries.map(e => `<div class="cse-gui-hud-item">${e.html}</div>`).join('');
}

function cseRenderGui() {
  const modal = document.getElementById('cse-mc-gui');
  if (!modal) return;
  const tab = cseGuiState.activeTab;

  const mods = [
    { id: 'AutoMove', label: 'AutoMove', active: isAutomoveEnabled, hasSettings: true },
    { id: 'SuggestMove', label: 'SuggestMove', active: arrowsEnabled, hasSettings: true },
    { id: 'EvaluationBar', label: 'Evaluation Bar', active: isEvalBarEnabled, hasSettings: true },
    { id: 'GUI', label: 'GUI', active: isGuiHudEnabled, hasSettings: false },
  ].filter(m => tab === 'ALL' || (tab === 'FAVORITE' && cseGuiState.favorites[m.id]));

  modal.querySelectorAll('.cse-mc-tab').forEach(t => {
    const active = t.dataset.tab === tab;
    t.style.color = active ? '#fff' : '#666';
    t.style.borderBottom = active ? '2px solid #4a9e5c' : '2px solid transparent';
    t.style.fontWeight = active ? '600' : '400';
  });

  const grid = modal.querySelector('#cse-mc-grid');
  grid.innerHTML = '';

  if (mods.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:30px;text-align:center;color:#666;font-size:12px;">No modules in this category</div>';
    return;
  }

  mods.forEach(mod => {
    const isFav = cseGuiState.favorites[mod.id];
    const card = document.createElement('div');
    card.className = 'cse-mc-card';

    const iconMap = {
      AutoMove: { letter: 'A', color: '#4a9e5c' },
      SuggestMove: { letter: 'S', color: '#5b8fc9' },
      EvaluationBar: { letter: 'E', color: '#b58a4a' },
      GUI: { letter: 'G', color: '#d8d8d8' },
    };
    const icon = iconMap[mod.id] || { letter: '?', color: '#888' };

    card.innerHTML = `
      <div class="cse-mc-card-top">
        <div class="cse-mc-icon" style="color:${icon.color};">${icon.letter}</div>
        <div class="cse-mc-card-controls">
          <div class="cse-mc-toggle ${mod.active ? 'cse-mc-on' : ''}" data-id="${mod.id}">
            <div class="cse-mc-knob"></div>
          </div>
          ${mod.hasSettings ? `<div class="cse-mc-dots" data-id="${mod.id}" title="Settings">
            <span></span><span></span><span></span>
          </div>` : '<div class="cse-mc-dots cse-mc-dots-disabled" title="No settings"><span></span><span></span><span></span></div>'}
        </div>
      </div>
      <div class="cse-mc-card-name">${mod.label}${mod.id === 'AutoMove' && isAutomoveEnabled ? '<span class="cse-mc-timer" id="cse-mc-timer-badge"></span>' : ''}</div>
      <div class="cse-mc-fav ${isFav ? 'cse-mc-fav-on' : ''}" data-id="${mod.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">&#9733;</div>
    `;

    card.querySelector('.cse-mc-toggle').addEventListener('click', () => {
      if (mod.id === 'AutoMove') {
        isAutomoveEnabled = !isAutomoveEnabled;
        if (!isAutomoveEnabled) {
          clearAutomoveSchedule();
          stopAutomoveUiTicker();
        } else {
          startAutomoveUiTicker();
        }
      } else if (mod.id === 'SuggestMove') {
        arrowsEnabled = !arrowsEnabled;
        if (!arrowsEnabled) hideBestMoveOverlay();
      } else if (mod.id === 'EvaluationBar') {
        isEvalBarEnabled = !isEvalBarEnabled;
        if (isEvalBarEnabled) createEvaluationBarPanel();
        else removeEvaluationBarPanel();
      } else if (mod.id === 'GUI') {
        isGuiHudEnabled = !isGuiHudEnabled;
        syncGuiHudPanel();
      }

      ensureEvalEngineState(true);
      if (isAutomoveEnabled) performAutomove();
      updateAutomoveButtonState();
      syncGuiHudPanel();
      cseSaveState();
      cseRenderGui();
    });

    const dots = card.querySelector('.cse-mc-dots');
    if (mod.hasSettings && dots) {
      dots.addEventListener('click', e => {
        e.stopPropagation();
        cseGuiState.openSettings = mod.id;
        cseRenderSettingsPanel(mod.id);
      });
    }

    card.querySelector('.cse-mc-fav').addEventListener('click', e => {
      e.stopPropagation();
      cseGuiState.favorites[mod.id] = !cseGuiState.favorites[mod.id];
      cseSaveState();
      cseRenderGui();
    });

    grid.appendChild(card);
  });

  updateAutomoveButtonState();

  if (cseGuiState.openSettings && !mods.find(m => m.id === cseGuiState.openSettings)) {
    cseGuiState.openSettings = null;
    const ov = modal.querySelector('#cse-mc-settings-overlay');
    if (ov) ov.style.display = 'none';
  }
  syncGuiHudPanel();
}

function cseRenderSettingsPanel(modId) {
  const modal = document.getElementById('cse-mc-gui');
  if (!modal) return;
  const ov = modal.querySelector('#cse-mc-settings-overlay');
  if (!ov) return;
  ov.style.display = 'block';

  const isAuto = modId === 'AutoMove';
  const isDepth = modId === 'SuggestMove' || modId === 'EvaluationBar';
  ov.innerHTML = `
    <div class="cse-mc-spanel">
      <div class="cse-mc-spanel-header">
        <span>${modId} Settings</span>
        <button class="cse-mc-spanel-close" id="cse-mc-sp-close">&#10005;</button>
      </div>
      ${isAuto ? `
        <div class="cse-mc-srow">
          <span class="cse-mc-slabel">Mode</span>
          <div class="cse-mc-mode-btns">
            <button class="cse-mc-mbtn ${automoveMode === 'legit' ? 'cse-mc-mbtn-on' : ''}" data-mode="legit">Legit</button>
            <button class="cse-mc-mbtn ${automoveMode === 'blatant' ? 'cse-mc-mbtn-on' : ''}" data-mode="blatant">Blatant</button>
          </div>
        </div>
        <div class="cse-mc-srow">
          <div class="cse-mc-slabel-row"><span class="cse-mc-slabel">Delay min</span><span class="cse-mc-sval" id="cse-sp-dmin-val">${automoveDelayMin}s</span></div>
          <input type="range" class="cse-mc-slider" id="cse-sp-dmin" min="1" max="15" step="1" value="${automoveDelayMin}">
        </div>
        <div class="cse-mc-srow">
          <div class="cse-mc-slabel-row"><span class="cse-mc-slabel">Delay max</span><span class="cse-mc-sval" id="cse-sp-dmax-val">${automoveDelayMax}s</span></div>
          <input type="range" class="cse-mc-slider" id="cse-sp-dmax" min="1" max="15" step="1" value="${automoveDelayMax}">
        </div>
      ` : isDepth ? `
        <div class="cse-mc-srow">
          <div class="cse-mc-slabel-row"><span class="cse-mc-slabel">Depth</span><span class="cse-mc-sval" id="cse-sp-depth-val">${suggestMoveDepth}</span></div>
          <input type="range" class="cse-mc-slider" id="cse-sp-depth" min="1" max="15" step="1" value="${suggestMoveDepth}">
        </div>
      ` : `
        <div class="cse-mc-srow">
          <span class="cse-mc-slabel">No settings for this module.</span>
        </div>
      `}
    </div>
  `;

  ov.querySelector('#cse-mc-sp-close').addEventListener('click', () => {
    ov.style.display = 'none';
    cseGuiState.openSettings = null;
  });

  // Draggable settings panel
  const panel = ov.querySelector('.cse-mc-spanel');
  const header = ov.querySelector('.cse-mc-spanel-header');
  let dragPointerId = null;
  let dX = 0;
  let dY = 0;
  let dL = 0;
  let dT = 0;

  const clampPanel = (left, top) => {
    const pad = 8;
    const maxLeft = Math.max(pad, ov.clientWidth - panel.offsetWidth - pad);
    const maxTop = Math.max(pad, ov.clientHeight - panel.offsetHeight - pad);
    return {
      left: Math.min(Math.max(pad, left), maxLeft),
      top: Math.min(Math.max(pad, top), maxTop),
    };
  };

  const onPointerMove = e => {
    if (e.pointerId !== dragPointerId) return;
    const next = clampPanel(dL + e.clientX - dX, dT + e.clientY - dY);
    panel.style.left = next.left + 'px';
    panel.style.top = next.top + 'px';
  };

  const stopDrag = () => {
    if (dragPointerId !== null && header.hasPointerCapture(dragPointerId)) header.releasePointerCapture(dragPointerId);
    dragPointerId = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointercancel', stopDrag);
  };

  header.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('#cse-mc-sp-close')) return;
    e.preventDefault();
    const ovRect = ov.getBoundingClientRect();
    const pRect = panel.getBoundingClientRect();

    panel.style.position = 'absolute';
    panel.style.margin = '0';
    panel.style.left = (pRect.left - ovRect.left) + 'px';
    panel.style.top = (pRect.top - ovRect.top) + 'px';
    panel.style.transform = 'none';

    dX = e.clientX;
    dY = e.clientY;
    dL = pRect.left - ovRect.left;
    dT = pRect.top - ovRect.top;
    dragPointerId = e.pointerId;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    header.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
  });

  if (isAuto) {
    ov.querySelectorAll('.cse-mc-mbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        automoveMode = btn.dataset.mode;
        ov.querySelectorAll('.cse-mc-mbtn').forEach(b => b.classList.toggle('cse-mc-mbtn-on', b.dataset.mode === automoveMode));
        cseSaveState();
        updateAutomoveModeUI();
      });
    });

    const dminSl = ov.querySelector('#cse-sp-dmin');
    const dmaxSl = ov.querySelector('#cse-sp-dmax');
    dminSl.addEventListener('input', () => {
      automoveDelayMin = parseInt(dminSl.value, 10);
      if (automoveDelayMin > automoveDelayMax) {
        automoveDelayMax = automoveDelayMin;
        dmaxSl.value = automoveDelayMax;
        ov.querySelector('#cse-sp-dmax-val').textContent = automoveDelayMax + 's';
      }
      ov.querySelector('#cse-sp-dmin-val').textContent = automoveDelayMin + 's';
      cseSaveState();
    });
    dmaxSl.addEventListener('input', () => {
      automoveDelayMax = parseInt(dmaxSl.value, 10);
      if (automoveDelayMax < automoveDelayMin) {
        automoveDelayMin = automoveDelayMax;
        dminSl.value = automoveDelayMin;
        ov.querySelector('#cse-sp-dmin-val').textContent = automoveDelayMin + 's';
      }
      ov.querySelector('#cse-sp-dmax-val').textContent = automoveDelayMax + 's';
      cseSaveState();
    });
  } else if (isDepth) {
    const depSl = ov.querySelector('#cse-sp-depth');
    if (!depSl) return;
    depSl.addEventListener('input', () => {
      suggestMoveDepth = parseInt(depSl.value, 10);
      ov.querySelector('#cse-sp-depth-val').textContent = suggestMoveDepth;
      evalCache.clear();
      lastEvalFen = null;
      cseSaveState();
      ensureEvalEngineState(true);
    });
  }
}

function createEvaluationBarPanel() {
  if (evalBarPanel?.isConnected) return evalBarPanel;

  const bar = document.createElement('div');
  bar.className = 'cse-eval-bar-root';
  bar.innerHTML = `
    <div class="cse-eval-drag" data-cse-part="drag" title="Drag"></div>
    <div class="cse-eval-inner">
      <div class="cse-eval-black" data-cse-part="black" style="height:50%"></div>
      <div class="cse-eval-white" data-cse-part="white" style="height:50%"></div>
    </div>
    <div class="cse-eval-score" data-cse-part="score">...</div>
    <div class="cse-eval-label">Eval</div>
  `;
  document.body.appendChild(bar);

  const savedPos = getSavedEvalBarPosition();
  const desired = savedPos || { left: Math.max(12, window.innerWidth - 70), top: 120 };
  const initial = clampToViewport(bar, desired.left, desired.top);
  bar.style.left = initial.left + 'px';
  bar.style.top = initial.top + 'px';

  const handle = bar.querySelector('[data-cse-part="drag"]');
  let dragPointerId = null;
  let dX = 0;
  let dY = 0;
  let dL = 0;
  let dT = 0;

  const onPointerMove = e => {
    if (e.pointerId !== dragPointerId) return;
    const next = clampToViewport(bar, dL + e.clientX - dX, dT + e.clientY - dY);
    bar.style.left = next.left + 'px';
    bar.style.top = next.top + 'px';
  };

  const stopDrag = () => {
    if (dragPointerId !== null && handle.hasPointerCapture(dragPointerId)) handle.releasePointerCapture(dragPointerId);
    dragPointerId = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointercancel', stopDrag);
    cseSaveState();
  };

  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const r = bar.getBoundingClientRect();
    dX = e.clientX;
    dY = e.clientY;
    dL = r.left;
    dT = r.top;
    dragPointerId = e.pointerId;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    handle.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
  });

  evalBarPanel = bar;
  return bar;
}

function removeEvaluationBarPanel() {
  if (evalBarPanel?.isConnected) {
    cseSaveState();
    evalBarPanel.remove();
  }
  evalBarPanel = null;
}

function createToolsGui() {
  if (toolsModal?.isConnected) return toolsModal;

  const modal = document.createElement('div');
  modal.id = 'cse-mc-gui';
  modal.className = 'cse-mc-gui';
  modal.innerHTML = `
    <div class="cse-mc-titlebar" id="cse-mc-drag">
      <div style="flex:1"></div>
      <button class="cse-mc-close-btn" id="cse-mc-close">&#10005;</button>
    </div>
    <div class="cse-mc-tabs">
      <button class="cse-mc-tab" data-tab="ALL" style="color:#fff;border-bottom:2px solid #4a9e5c;font-weight:600;">ALL</button>
      <button class="cse-mc-tab" data-tab="FAVORITE" style="color:#666;border-bottom:2px solid transparent;">FAVORITE</button>
      <div style="flex:1"></div>
    </div>
    <div class="cse-mc-grid" id="cse-mc-grid"></div>
    <div id="cse-mc-settings-overlay" class="cse-mc-settings-overlay" style="display:none;"></div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#cse-mc-close').addEventListener('click', closeToolsGui);

  modal.querySelectorAll('.cse-mc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      cseGuiState.activeTab = tab.dataset.tab;
      cseSaveState();
      cseRenderGui();
    });
  });

  const handle = modal.querySelector('#cse-mc-drag');
  let dragPointerId = null;
  let dX = 0;
  let dY = 0;
  let dL = 0;
  let dT = 0;

  const onPointerMove = e => {
    if (e.pointerId !== dragPointerId) return;
    const next = clampToViewport(modal, dL + e.clientX - dX, dT + e.clientY - dY);
    modal.style.left = next.left + 'px';
    modal.style.top = next.top + 'px';
    modal.style.right = 'auto';
    modal.style.transform = 'none';
  };

  const stopDrag = () => {
    if (dragPointerId !== null && handle.hasPointerCapture(dragPointerId)) handle.releasePointerCapture(dragPointerId);
    dragPointerId = null;
    handle.style.cursor = 'grab';
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointercancel', stopDrag);
  };

  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('#cse-mc-close')) return;
    e.preventDefault();

    const r = modal.getBoundingClientRect();
    dX = e.clientX;
    dY = e.clientY;
    dL = r.left;
    dT = r.top;
    dragPointerId = e.pointerId;

    modal.style.right = 'auto';
    modal.style.transform = 'none';
    modal.style.left = dL + 'px';
    modal.style.top = dT + 'px';

    handle.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    handle.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
  });

  toolsModal = modal;
  cseRenderGui();

  if (guiRefreshInterval) clearInterval(guiRefreshInterval);
  guiRefreshInterval = setInterval(() => {
    if (!toolsModal?.isConnected) return;
    updateAutomoveButtonState();
  }, 100);

  return modal;
}

function closeToolsGui() {
  if (toolsModal) {
    toolsModal.remove();
    toolsModal = null;
  }
  if (guiRefreshInterval) {
    clearInterval(guiRefreshInterval);
    guiRefreshInterval = null;
  }
}

async function tickEvalBar() {
  if (!isEvaluationEngineNeeded()) return;
  logDetectedPlayerColor(getBoardElement());

  const fen = getFenFromPage();

  if (!fen) {
    evalRequestSeq++;
    lastEvalFen = null;
    lastEvalMoveSourceFen = null;
    currentBestMove = null;
    lastEvalTopMoves = [];
    if (evalBarPanel?.isConnected) {
      const scoreEl = evalBarPanel.querySelector('[data-cse-part="score"]');
      if (scoreEl) scoreEl.textContent = '?';
      evalBarPanel.title = 'Posizione non trovata sulla board';
    }
    hideBestMoveOverlay();
    clearAutomoveSchedule();
    return;
  }

  if (fen === lastEvalFen) {
    if (arrowsEnabled) syncBestMoveOverlay();
    else hideBestMoveOverlay();
    if (isAutomoveEnabled) performAutomove();
    return;
  }

  lastEvalFen = fen;
  const requestSeq = ++evalRequestSeq;

  if (evalBarPanel?.isConnected) {
    evalBarPanel.title = '';
    const scoreEl = evalBarPanel.querySelector('[data-cse-part="score"]');
    if (scoreEl) {
      scoreEl.textContent = '...';
      scoreEl.className = 'cse-eval-score cse-eval-thinking';
    }
  }

  const result = await fetchEval(fen);
  if (requestSeq !== evalRequestSeq || lastEvalFen !== fen) return;

  updateEvalBarDisplay(result);
  if (!arrowsEnabled) hideBestMoveOverlay();
  if (isAutomoveEnabled) performAutomove();
}

function toggleToolsGui() {
  if (toolsModal?.isConnected) {
    closeToolsGui();
    return;
  }
  createToolsGui();
}
function injectEvalToggleButton() {
  if (evalToggleBtn?.isConnected) return;

  const btn = document.createElement('button');
  btn.className = 'cse-tools-open-btn';
  btn.title = 'Apri/chiudi Tools';
  btn.textContent = 'Tools';
  btn.addEventListener('click', toggleToolsGui);
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

function scanAndInjectEval() {
  // Only show eval button if a chess board is visible on the page
  const hasBoard = document.querySelector(
    'chess-board, wc-chess-board, .board-layout-chessboard, [data-fen]'
  );
  if (hasBoard) {
    injectEvalToggleButton();
  }
}

window.addEventListener('resize', syncBestMoveOverlay);
window.addEventListener('scroll', syncBestMoveOverlay, true);

document.addEventListener('keydown', e => {
  if (e.key === 'Shift' && e.location === 2) {
    toggleToolsGui();
  }
});

const observer = new MutationObserver(() => {
  scanAndInject();
  scanAndInjectEval();
  syncBestMoveOverlay();
  if (isGuiHudEnabled && (!guiHudPanel || !guiHudPanel.isConnected)) syncGuiHudPanel();
});
observer.observe(document.body, { childList: true, subtree: true });
applySavedGuiAndModuleState();
if (isEvalBarEnabled) createEvaluationBarPanel();
if (isAutomoveEnabled) startAutomoveUiTicker();
syncGuiHudPanel();
ensureEvalEngineState(true);
cseSaveState();
scanAndInject();
scanAndInjectEval();

// Re-scan on navigation (SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    playerSideCache = { side: null, ts: 0 };
    lastLoggedPlayerSide = null;
    lastEvalFen = null;
    currentBestMove = null;
    lastEvalTopMoves = [];
    lastEvalMoveSourceFen = null;
    setTimeout(scanAndInject, 1000);
  }
}).observe(document, { subtree: true, childList: true });




