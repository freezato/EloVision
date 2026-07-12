// Chess.com Opponent Stats Extension
// Updated: legit mode improvements, ETA timer fix, forced premoves only

// â”€â”€â”€ Utility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function now() { return Date.now(); }

// â”€â”€â”€ Drag & Drop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Evaluation Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let evalBarPanel = null;
let evalUpdateInterval = null;
let evalTickIntervalMs = 0;
let lastEvalFen = null;
let lastEvalMoveSourceFen = null;
let lastGameInsightsFen = null;
let currentBestMove = null;
let lastEvalTopMoves = [];
let lastEvalPvLines = [];
let lastEvalMate = null;
let stockfishAutoReloadEnabled = false;
let stockfishProvider = 'local'; // 'local' | 'api'
let maiaElo = 1500;
let generalLanguage = 'en'; // 'en' | 'it'
let generalNumbersFormat = 'default'; // 'default' | 'eu'
let generalMinimizeToTray = true;
let uiTheme = 'aurora'; // 'aurora' | 'blockforge' | 'voidos'
let uiAccent = 'emerald'; // 'emerald' | 'cyan' | 'violet' | 'rose' | 'gold'
let uiDensity = 'comfortable'; // 'compact' | 'comfortable' | 'spacious'
let uiMotionEnabled = true;
let uiNotifications = {
  engineReady: true,
  gameFinished: true,
  opponentMove: true,
  analysisWarning: false,
  moduleUpdate: false,
};
let notificationPosition = 'bottom-right';
let evalBarDisplayMode = 'bar'; // 'bar' | 'percent'
let stockfishFailureStreak = 0;
let stockfishFailureSinceAt = 0;
let stockfishLastSuccessAt = 0;
let stockfishLastReloadAt = 0;
let stockfishNoFenSinceAt = 0;
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
let automoveFastWhenLowTime = false; // speed up when own clock < 30s
let automoveFastInOpening = false;   // speed up during first 8 full moves
let automoveUseSmartPremoves = false; // queue premoves in tactical/forced spots
let automoveToggleHotkey = 'none'; // KeyboardEvent.code or 'none'
let isPuzzleRushEnabled = false;
let isAutoPlayEnabled = false;
let isToxicChatEnabled = false;
let isGameInsightsEnabled = false;
let puzzleRushDepth = 20;
let suggestMoveDepth = 15; // depth for SuggestMove/Arrows (user configurable)
let suggestMoveToggleHotkey = 'none'; // KeyboardEvent.code or 'none'
let toxicChatMessage = 'gg ez';
let toxicChatSendOnStart = false;
let toxicChatSendOnEnd = true;
let toxicChatTickInterval = null;
let toxicChatCurrentGameToken = null;
let toxicChatSentStartToken = null;
let toxicChatSentEndToken = null;
let toxicChatLastSentAt = 0;
const FEN_SEARCH_MAX_DEPTH = 3;
const FEN_SEARCH_MAX_NODES = 250;
const EVAL_CACHE_TTL = 12 * 1000;
const PUZZLE_RUSH_STUCK_TIMEOUT_MS = 3000;
const PUZZLE_RUSH_FALLBACK_DEPTH_MIN = 10;
const PUZZLE_RUSH_FALLBACK_DEPTH_MAX = 15;
const STOCKFISH_AUTO_RELOAD_INTERVAL_MS = 10 * 1000;
const EVAL_TICK_FAST_MS = 180;
const EVAL_TICK_NORMAL_MS = 1000;
const STOCKFISH_TIMEOUT_FAST_MS = 780;
const STOCKFISH_LOCAL_BOOT_TIMEOUT_MS = 9000;
const STOCKFISH_LOCAL_MULTI_PV = 4;
const STOCKFISH_LOCAL_SCRIPT_PATH = 'modules/stockfish/stockfish.js';
const MAIA_ELO_MIN = 1100;
const MAIA_ELO_MAX = 1900;
const MAIA_ELO_STEP = 100;
const MAIA_LOCAL_SCRIPT_PATH = 'modules/maia/maia.js';
const MAIA_LOCAL_WEIGHTS_DIR = 'modules/maia/weights';
const MAIA_LOCAL_BOOT_TIMEOUT_MS = 30000;
const MAIA_LOCAL_SEARCH_TIMEOUT_MS = 1800;
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
      PuzzleRush: !!isPuzzleRushEnabled,
      AutoPlay: !!isAutoPlayEnabled,
      ToxicChat: !!isToxicChatEnabled,
      GameInsights: !!isGameInsightsEnabled,
      SuggestMove: !!arrowsEnabled,
      EvaluationBar: !!isEvalBarEnabled,
      GUI: !!isGuiHudEnabled,
    },
    settings: {
      stockfishProvider,
      maiaElo,
      automoveMode,
      automoveDelayMin,
      automoveDelayMax,
      automoveFastWhenLowTime,
      automoveFastInOpening,
      automoveUseSmartPremoves,
      automoveToggleHotkey,
      puzzleRushDepth,
      suggestMoveDepth,
      suggestMoveToggleHotkey,
      stockfishAutoReloadEnabled,
      autoPlayAcceptRematch,
      toxicChatMessage,
      toxicChatSendOnStart,
      toxicChatSendOnEnd,
      evalBarDisplayMode,
      generalLanguage,
      generalNumbersFormat,
      generalMinimizeToTray,
      uiTheme,
      uiAccent,
      uiDensity,
      uiMotionEnabled,
      notifications: { ...uiNotifications },
      notificationPosition,
    },
    evalBarPosition: evalRect ? { left: Math.round(evalRect.left), top: Math.round(evalRect.top) } : null,
  };
  try {
    localStorage.setItem(CSE_STATE_KEY, JSON.stringify(state));
  } catch {}
}

// â”€â”€ FEN extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

function getReliableFullmoveNumber() {
  const plyCount = getPlyCountFromMoveList();
  if (Number.isInteger(plyCount) && plyCount >= 0) {
    return Math.max(1, Math.floor(plyCount / 2) + 1);
  }

  // Fallback only if FEN fullmove field is present and valid.
  if (typeof lastEvalFen === 'string') {
    const parts = lastEvalFen.trim().split(/\s+/);
    const fullmove = parseInt(parts[5], 10);
    if (Number.isInteger(fullmove) && fullmove > 0) return fullmove;
  }
  return null;
}

function getFullmoveNumberFromMoveListOnly() {
  const plyCount = getPlyCountFromMoveList();
  if (!Number.isInteger(plyCount) || plyCount < 0) return null;
  return Math.max(1, Math.floor(plyCount / 2) + 1);
}

function normalizeModuleHotkey(value) {
  if (typeof value !== 'string') return 'none';
  const next = value.trim();
  if (!next) return 'none';
  return next === 'none' ? 'none' : next;
}

function formatHotkeyLabel(code) {
  if (!code || code === 'Unidentified') return 'None';
  if (code === 'none') return 'None';
  if (typeof code === 'string' && code.startsWith('Numpad')) return code.replace('Numpad', 'Num ');
  if (typeof code === 'string' && code.startsWith('Key')) return code.slice(3);
  if (typeof code === 'string' && code.startsWith('Digit')) return code.slice(5);
  if (typeof code === 'string' && code.startsWith('Arrow')) return code.replace('Arrow', 'Arrow ');
  if (typeof code === 'string' && code === 'Space') return 'Space';
  return code;
}

function getReliablePlyCount() {
  const plyFromList = getPlyCountFromMoveList();
  const hasListPly = Number.isInteger(plyFromList) && plyFromList >= 0;

  let plyFromFen = null;
  if (typeof lastEvalFen === 'string') {
    const parts = lastEvalFen.trim().split(/\s+/);
    const turn = normalizeTurn(parts[1] || '');
    const fullmove = parseInt(parts[5], 10);
    if (Number.isInteger(fullmove) && fullmove > 0) {
      const base = (fullmove - 1) * 2;
      if (turn === 'w') plyFromFen = Math.max(0, base);
      if (turn === 'b') plyFromFen = Math.max(0, base + 1);
    }
  }

  const hasFenPly = Number.isInteger(plyFromFen) && plyFromFen >= 0;
  if (hasListPly && hasFenPly) return Math.max(plyFromList, plyFromFen);
  if (hasListPly) return plyFromList;
  if (hasFenPly) return plyFromFen;
  return null;
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

// â”€â”€ Active clock detection (most reliable for live online games) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// chess.com adds 'clock-player-turn' to the clock element of whoever is to move.
// IMPORTANT: This function must NOT call getPlayerSide() or getExplicitBoardFlipState()
// because both internally call inferPlayerSideFromClockAndTurn â†’ detectSideToMove â†’ here,
// causing infinite recursion (Maximum call stack size exceeded).
// Use _detectOrientationColor() directly instead â€” it has no circular dependency.
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

  // Use _detectOrientationColor directly â€” avoids the circular recursion that
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

    // â”€â”€ IMPORTANT: Do NOT guess when orientation is unknown. â”€â”€
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
// IMPORTANT: Do NOT call detectSideToMove() here â€” that function calls
// detectTurnFromActiveClock() which calls getPlayerSide() which calls this
// function, causing infinite recursion. Only use lastEvalFen as source of truth.
function inferPlayerSideFromClockAndTurn(boardEl = getBoardElement()) {
  const clockEl = getActiveClockElement();
  if (!clockEl) return null;
  const isBottom = isElementBottomHalf(clockEl, boardEl);
  if (isBottom === null) return null;

  // Only rely on lastEvalFen â€” never call detectSideToMove() here.
  const fenTurn = normalizeTurn((lastEvalFen || '').split(' ')[1]);
  if (!fenTurn) return null;

  // Active clock belongs to side-to-move.
  // If active clock is bottom, local side == turn; otherwise opposite.
  return isBottom ? fenTurn : (fenTurn === 'w' ? 'b' : 'w');
}

// â”€â”€ Automove â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let isAutomoveEnabled = false;
let automoveTimeout = null;
let automoveUiInterval = null;
let automoveScheduledAt = 0;
let automoveDelayMs = 0;
let automovePlannedMove = null;
let automoveTargetFen = null;
let automoveScheduledProfile = null; // 'automove' | 'puzzleRush'
let automoveBlockedKey = null;
let automoveBlockedUntil = 0;
let premoveTimeout = null;
let premoveScheduledAt = 0;
let premoveDelayMs = 0;
let premovePlannedMove = null;
let premoveTargetFen = null;
let premoveLastAttemptKey = null;
let premoveBlockedUntil = 0;
let autoPlayTickInterval = null;
let autoPlayTimeout = null;
let autoPlayScheduledAt = 0;
let autoPlayDelayMs = 0;
let autoPlayHandledToken = null;
let autoPlayAcceptRematch = true;
let autoPlayGameOverToken = null;
let autoPlayGameOverSeenAt = 0;
let autoPlayGameOverNode = null;
const CSE_LOG_MAX_ENTRIES = 400;
const CSE_LOG_MAX_RENDER_LINES = 160;
let cseLogCheckerEnabled = false;
let cseLogEntries = [];
let cseLogSeq = 0;
let cseLogPanel = null;
let cseLogRenderQueued = false;
let lastLoggedPlayerSide = null;
let playerSideCache = { side: null, ts: 0 };
let legitInaccuracyStreak = 0;

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

function splitUciMove(move) {
  const uci = extractUciMove(move);
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return null;
  return { uci, from, to, promotion: uci.length >= 5 ? uci[4].toLowerCase() : null };
}

function getPieceColor(piece) {
  if (typeof piece !== 'string' || !piece) return null;
  return /[A-Z]/.test(piece) ? 'w' : 'b';
}

function squareToBoardIndex(square) {
  if (!/^[a-h][1-8]$/i.test(square)) return null;
  const col = square.toLowerCase().charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);
  const row = 8 - rank;
  if (row < 0 || row > 7 || col < 0 || col > 7) return null;
  return { row, col };
}

function cloneFenBoard(board) {
  if (!Array.isArray(board) || board.length !== 8) return null;
  return board.map(r => Array.isArray(r) ? r.slice() : []);
}

function setPieceAtFenSquare(board, square, piece) {
  const idx = squareToBoardIndex(square);
  if (!idx || !Array.isArray(board) || !board[idx.row]) return false;
  board[idx.row][idx.col] = piece || null;
  return true;
}

function applyPseudoUciMoveOnBoard(board, move) {
  const mv = splitUciMove(move);
  if (!mv || !Array.isArray(board)) return null;
  const fromPiece = pieceAtFenSquare(board, mv.from);
  if (!fromPiece) return null;

  const fromIdx = squareToBoardIndex(mv.from);
  const toIdx = squareToBoardIndex(mv.to);
  if (!fromIdx || !toIdx) return null;

  const moverColor = getPieceColor(fromPiece);
  let capturedPiece = pieceAtFenSquare(board, mv.to);
  let capturedSquare = mv.to;

  // En-passant style capture (best-effort pseudo simulation).
  if (!capturedPiece && /^[pP]$/.test(fromPiece) && fromIdx.col !== toIdx.col) {
    const epRow = moverColor === 'w' ? toIdx.row + 1 : toIdx.row - 1;
    if (epRow >= 0 && epRow <= 7) {
      capturedPiece = board[epRow]?.[toIdx.col] || null;
      capturedSquare = String.fromCharCode(97 + toIdx.col) + (8 - epRow);
      if (capturedPiece) board[epRow][toIdx.col] = null;
    }
  }

  board[fromIdx.row][fromIdx.col] = null;

  let placedPiece = fromPiece;
  if (mv.promotion && /^[pP]$/.test(fromPiece)) {
    const promo = mv.promotion.toLowerCase();
    const map = { q: 'q', r: 'r', b: 'b', n: 'n' };
    if (map[promo]) placedPiece = moverColor === 'w' ? map[promo].toUpperCase() : map[promo];
  }
  board[toIdx.row][toIdx.col] = placedPiece;

  // Castle rook move (best-effort for king 2-square move).
  if ((fromPiece === 'K' || fromPiece === 'k') && Math.abs(fromIdx.col - toIdx.col) === 2) {
    if (toIdx.col === 6) {
      const rookFrom = String.fromCharCode(97 + 7) + (8 - fromIdx.row);
      const rookTo = String.fromCharCode(97 + 5) + (8 - fromIdx.row);
      const rookPiece = pieceAtFenSquare(board, rookFrom);
      if (rookPiece && getPieceColor(rookPiece) === moverColor) {
        setPieceAtFenSquare(board, rookFrom, null);
        setPieceAtFenSquare(board, rookTo, rookPiece);
      }
    } else if (toIdx.col === 2) {
      const rookFrom = String.fromCharCode(97 + 0) + (8 - fromIdx.row);
      const rookTo = String.fromCharCode(97 + 3) + (8 - fromIdx.row);
      const rookPiece = pieceAtFenSquare(board, rookFrom);
      if (rookPiece && getPieceColor(rookPiece) === moverColor) {
        setPieceAtFenSquare(board, rookFrom, null);
        setPieceAtFenSquare(board, rookTo, rookPiece);
      }
    }
  }

  return {
    board,
    capturedPiece: capturedPiece || null,
    capturedSquare: capturedPiece ? capturedSquare : null,
    move: mv.uci
  };
}

function isInsideBoardIndex(row, col) {
  return row >= 0 && row <= 7 && col >= 0 && col <= 7;
}

// Best-effort pseudo-legal move count for a color on a board matrix.
// It ignores check/pin legality, but is enough to estimate "forced reply" density.
function countLegalMovesForColor(board, color) {
  if (!Array.isArray(board) || (color !== 'w' && color !== 'b')) return 0;
  let count = 0;

  const tryAdd = (row, col, moverColor) => {
    if (!isInsideBoardIndex(row, col)) return 0;
    const target = board[row]?.[col] || null;
    if (!target) return 1;
    return getPieceColor(target) !== moverColor ? 1 : 0;
  };

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col] || null;
      if (!piece || getPieceColor(piece) !== color) continue;
      const lower = piece.toLowerCase();

      if (lower === 'p') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const oneRow = row + dir;
        if (isInsideBoardIndex(oneRow, col) && !board[oneRow]?.[col]) {
          count++;
          const twoRow = row + (2 * dir);
          if (row === startRow && isInsideBoardIndex(twoRow, col) && !board[twoRow]?.[col]) count++;
        }
        const capL = col - 1;
        const capR = col + 1;
        if (isInsideBoardIndex(oneRow, capL)) {
          const t = board[oneRow]?.[capL] || null;
          if (t && getPieceColor(t) !== color) count++;
        }
        if (isInsideBoardIndex(oneRow, capR)) {
          const t = board[oneRow]?.[capR] || null;
          if (t && getPieceColor(t) !== color) count++;
        }
        continue;
      }

      if (lower === 'n') {
        const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of jumps) count += tryAdd(row + dr, col + dc, color);
        continue;
      }

      if (lower === 'k') {
        const deltas = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dr, dc] of deltas) count += tryAdd(row + dr, col + dc, color);
        continue;
      }

      const lines = [];
      if (lower === 'b' || lower === 'q') lines.push([-1,-1],[-1,1],[1,-1],[1,1]);
      if (lower === 'r' || lower === 'q') lines.push([-1,0],[1,0],[0,-1],[0,1]);
      for (const [dr, dc] of lines) {
        let r = row + dr;
        let c = col + dc;
        while (isInsideBoardIndex(r, c)) {
          const t = board[r]?.[c] || null;
          if (!t) {
            count++;
          } else {
            if (getPieceColor(t) !== color) count++;
            break;
          }
          r += dr;
          c += dc;
        }
      }
    }
  }

  return count;
}

function isCaptureMoveOnFen(move, fen) {
  if (!move || !fen) return false;
  const mv = splitUciMove(move);
  const parts = String(fen).trim().split(/\s+/);
  const board = expandFenBoard(parts[0] || '');
  const turn = normalizeTurn(parts[1] || '');
  if (!mv || !board || !turn) return false;

  const fromPiece = pieceAtFenSquare(board, mv.from);
  if (!fromPiece) return false;
  const moverColor = getPieceColor(fromPiece);
  if (moverColor !== turn) return false;

  const toPiece = pieceAtFenSquare(board, mv.to);
  if (toPiece && getPieceColor(toPiece) !== moverColor) return true;

  // En-passant style capture check.
  if (/^[pP]$/.test(fromPiece) && mv.from[0] !== mv.to[0]) {
    const toIdx = squareToBoardIndex(mv.to);
    if (toIdx) {
      const epRow = moverColor === 'w' ? toIdx.row + 1 : toIdx.row - 1;
      if (epRow >= 0 && epRow <= 7) {
        const epPiece = board[epRow]?.[toIdx.col] || null;
        if (epPiece && getPieceColor(epPiece) !== moverColor && /^[pP]$/.test(epPiece)) return true;
      }
    }
  }

  return false;
}

function isMateForTurnSoon(fen, mateScore, maxPly = 5) {
  if (!Number.isFinite(mateScore) || !fen) return false;
  const turn = normalizeTurn(String(fen).trim().split(/\s+/)[1] || '');
  if (!turn) return false;
  const mateForTurn = (turn === 'w' && mateScore > 0) || (turn === 'b' && mateScore < 0);
  return mateForTurn && Math.abs(mateScore) <= maxPly;
}

// â”€â”€ Bypass delay solo per puzzle rush o matto forzato, NON per catture generiche â”€â”€
function shouldBypassAutomoveDelay(profile, move, fen) {
  if (!move || !fen) return false;
  if (profile === 'puzzleRush') return true;
  if (isMateForTurnSoon(fen, lastEvalMate, 5)) return true;
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cseFormatLogArg(arg) {
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function csePushLog(category, args) {
  if (!cseLogCheckerEnabled) return;
  const msg = Array.isArray(args) ? args.map(cseFormatLogArg).join(' ') : cseFormatLogArg(args);
  cseLogEntries.push({
    id: ++cseLogSeq,
    ts: now(),
    cat: category || 'log',
    msg
  });
  if (cseLogEntries.length > CSE_LOG_MAX_ENTRIES) {
    cseLogEntries.splice(0, cseLogEntries.length - CSE_LOG_MAX_ENTRIES);
  }
  scheduleLogPanelRender();
}

function formatLogTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('it-IT', { hour12: false });
  } catch {
    return '';
  }
}

function renderLogPanel() {
  cseLogRenderQueued = false;
  if (!cseLogPanel?.isConnected) return;
  const body = cseLogPanel.querySelector('[data-cse-log-body]');
  if (!body) return;
  const rows = cseLogEntries.slice(-CSE_LOG_MAX_RENDER_LINES).map(e => `[${formatLogTime(e.ts)}] [${e.cat}] ${e.msg}`);
  body.textContent = rows.join('\n');
  body.scrollTop = body.scrollHeight;
}

function scheduleLogPanelRender() {
  if (!cseLogPanel?.isConnected) return;
  if (cseLogRenderQueued) return;
  cseLogRenderQueued = true;
  requestAnimationFrame(renderLogPanel);
}

function closeLogPanel() {
  if (cseLogPanel?.isConnected) cseLogPanel.remove();
  cseLogPanel = null;
  cseLogRenderQueued = false;
}

function clearLogEntries() {
  cseLogEntries = [];
  scheduleLogPanelRender();
}

function openLogPanel() {
  if (cseLogPanel?.isConnected) {
    scheduleLogPanelRender();
    return cseLogPanel;
  }
  const panel = document.createElement('div');
  panel.className = 'cse-log-checker';
  panel.style.cssText = [
    'position:fixed',
    'right:18px',
    'bottom:18px',
    'width:420px',
    'max-width:calc(100vw - 24px)',
    'height:250px',
    'z-index:999999',
    'background:#111',
    'color:#d8d8d8',
    'border:1px solid #333',
    'border-radius:8px',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden',
    'box-shadow:0 12px 26px rgba(0,0,0,.45)',
    'font-family:Consolas,Monaco,monospace',
    'font-size:11px'
  ].join(';');
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#1b1b1b;border-bottom:1px solid #2f2f2f;">
      <div style="font-weight:700;flex:1;">Logs Checker</div>
      <button type="button" data-cse-log-clear style="height:22px;padding:0 8px;border:1px solid #444;border-radius:4px;background:#242424;color:#ddd;cursor:pointer;">Clear</button>
      <button type="button" data-cse-log-close style="height:22px;padding:0 8px;border:1px solid #444;border-radius:4px;background:#242424;color:#ddd;cursor:pointer;">Close</button>
    </div>
    <pre data-cse-log-body style="margin:0;flex:1;overflow:auto;padding:8px 10px;white-space:pre-wrap;word-break:break-word;line-height:1.25;"></pre>
  `;
  panel.querySelector('[data-cse-log-close]')?.addEventListener('click', closeLogPanel);
  panel.querySelector('[data-cse-log-clear]')?.addEventListener('click', clearLogEntries);
  document.body.appendChild(panel);
  cseLogPanel = panel;
  scheduleLogPanelRender();
  return panel;
}

function automoveLog(...args) {
  csePushLog('AutoMove', args);
}

function autoPlayLog(...args) {
  csePushLog('AutoPlay', args);
}

function toxicChatLog(...args) {
  csePushLog('ToxicChat', args);
}

function clearAutoPlaySchedule(resetHandledToken = false) {
  if (autoPlayTimeout) {
    clearTimeout(autoPlayTimeout);
    autoPlayTimeout = null;
  }
  autoPlayScheduledAt = 0;
  autoPlayDelayMs = 0;
  if (resetHandledToken) {
    autoPlayHandledToken = null;
    autoPlayGameOverToken = null;
    autoPlayGameOverSeenAt = 0;
    autoPlayGameOverNode = null;
  }
}

function isElementRenderable(el) {
  if (!el || !el.isConnected) return false;
  let style;
  try { style = window.getComputedStyle(el); } catch { return false; }
  if (!style) return false;
  if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
  let rect;
  try { rect = el.getBoundingClientRect(); } catch { return false; }
  return !!rect && rect.width > 2 && rect.height > 2;
}

function normalizeActionText(text) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeHtmlAttr(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function scoreAutoPlayActionText(text) {
  const t = normalizeActionText(text);
  if (!t) return 0;
  if (/\b(play again|rematch|rivincita|gioca ancora)\b/.test(t)) return autoPlayAcceptRematch ? 120 : 0;
  if (/\b(accept rematch|accetta rivincita)\b/.test(t)) return autoPlayAcceptRematch ? 130 : 0;
  if (/\b(new game|new match|start new)\b/.test(t)) return 110;
  if (/\b(nuova partita|nuova sfida)\b/.test(t)) return 108;
  if (/\bnew\b/.test(t) && /\b(min|sec|second|rapid|blitz|bullet|daily)\b/.test(t)) return 90;
  if (/\bplay\b/.test(t) && /\bnew\b/.test(t)) return 85;
  return 0;
}

function getAutoPlayActionCandidates() {
  if (!isOnlineGameContext() && !isComputerGameContext()) return [];
  const scopeSelectors = [
    '[data-cy*="game-over"]',
    '[class*="game-over"]',
    '[class*="result"]',
    '[class*="post-game"]',
    '[class*="rematch"]',
    '[role="dialog"]',
    '[class*="modal"]'
  ];
  const buttonSelectors = [
    'button',
    'a[role="button"]',
    'div[role="button"]',
    'span[role="button"]'
  ];
  const scopes = Array.from(new Set([
    ...scopeSelectors.flatMap(sel => Array.from(document.querySelectorAll(sel))),
    document.body
  ]));
  const candidates = [];

  for (const scope of scopes) {
    for (const btnSel of buttonSelectors) {
      const nodes = Array.from(scope.querySelectorAll(btnSel));
      for (const node of nodes) {
        if (!isElementRenderable(node)) continue;
        if (node.matches?.('[disabled], [aria-disabled="true"]')) continue;
        const text = normalizeActionText(
          [node.textContent, node.getAttribute?.('aria-label'), node.getAttribute?.('title')].filter(Boolean).join(' ')
        );
        const score = scoreAutoPlayActionText(text);
        if (!score) continue;
        candidates.push({ node, text, score });
      }
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function getAutoPlayAction() {
  const candidate = getAutoPlayActionCandidates()[0];
  if (!candidate) return null;
  const token = `${location.pathname}|${candidate.text}|${candidate.score}`;
  const onceToken = `${location.pathname}|${candidate.text}`;
  return { ...candidate, token, onceToken };
}

function performAutoPlayTick() {
  if (!isAutoPlayEnabled) {
    clearAutoPlaySchedule(true);
    updateAutomoveButtonState();
    return;
  }

  const action = getAutoPlayAction();
  if (!action) {
    clearAutoPlaySchedule(true);
    updateAutomoveButtonState();
    return;
  }

  if (autoPlayHandledToken === action.token) return;
  if (autoPlayTimeout) return;

  const gameOverToken = `${location.pathname}|${action.text}`;
  if (autoPlayGameOverToken !== gameOverToken || autoPlayGameOverNode !== action.node) {
    autoPlayGameOverToken = gameOverToken;
    autoPlayGameOverNode = action.node;
    autoPlayGameOverSeenAt = now();
    updateAutomoveButtonState();
    return;
  }
  if (!autoPlayGameOverSeenAt || (now() - autoPlayGameOverSeenAt) < 3000) {
    updateAutomoveButtonState();
    return;
  }

  // Gate giÃ  rispettato sopra (3s dalla comparsa end-screen): qui clicca quasi subito.
  autoPlayDelayMs = 150 + Math.floor(Math.random() * 201);
  autoPlayScheduledAt = now();
  autoPlayLog('scheduled', { delayMs: autoPlayDelayMs, text: action.text });
  updateAutomoveButtonState();

  autoPlayTimeout = setTimeout(() => {
    autoPlayTimeout = null;
    if (!isAutoPlayEnabled) {
      clearAutoPlaySchedule(true);
      return;
    }
    const live = getAutoPlayAction();
    if (!live) {
      clearAutoPlaySchedule(true);
      return;
    }
    if (autoPlayHandledToken === live.onceToken) {
      clearAutoPlaySchedule(false);
      return;
    }
    try {
      live.node.click();
      // Mark this end-screen action as already sent, so rematch is sent only once.
      autoPlayHandledToken = live.onceToken;
      autoPlayLog('clicked', { text: live.text });
    } catch (err) {
      autoPlayLog('click failed', err);
    } finally {
      clearAutoPlaySchedule(false);
      updateAutomoveButtonState();
    }
  }, autoPlayDelayMs);
}

function startAutoPlayTicker() {
  if (autoPlayTickInterval) return;
  performAutoPlayTick();
  autoPlayTickInterval = setInterval(() => {
    performAutoPlayTick();
    updateAutomoveButtonState();
  }, 500);
}

function stopAutoPlayTicker() {
  if (!autoPlayTickInterval) return;
  clearInterval(autoPlayTickInterval);
  autoPlayTickInterval = null;
}

function logDetectedPlayerColor(boardEl = getBoardElement()) {
  const side = getPlayerSide(boardEl);
  if (!side) {
    if (lastLoggedPlayerSide !== 'unknown') {
      lastLoggedPlayerSide = 'unknown';
      csePushLog('System', ['colore: non rilevato']);
    }
    return;
  }
  if (side === lastLoggedPlayerSide) return;
  lastLoggedPlayerSide = side;
  csePushLog('System', [`colore: ${side === 'b' ? 'nero' : 'bianco'}`]);
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

function isPuzzleContext() {
  const path = String(location.pathname || '').toLowerCase();
  if (/\/puzzles?(\/|$)/.test(path)) return true;
  if (/\/puzzle-rush(\/|$)/.test(path)) return true;
  if (document.querySelector('[data-cy*="puzzle"], [class*="puzzle-rush"], [class*="puzzle-board"]')) return true;
  return false;
}

function isOnlineGameContext() {
  if (isPuzzleContext()) return false;
  const path = String(location.pathname || '').toLowerCase();
  if (/\/play\/online(\/|$)/.test(path)) return true;
  if (/\/game\/live(\/|$)/.test(path)) return true;
  return !!(getBoardElement() && document.querySelector('.clock-component, .player-clock, [class*="clock-player-turn"]'));
}

function isComputerGameContext() {
  if (isPuzzleContext()) return false;
  const path = String(location.pathname || '').toLowerCase();
  if (/\/play\/computer(\/|$)/.test(path)) return true;
  if (/\/game\/computer(\/|$)/.test(path)) return true;
  if (/\/play\/bots?(\/|$)/.test(path)) return true;
  if (/\/bot(\/|$)/.test(path) && !!getBoardElement()) return true;

  if (!getBoardElement()) return false;
  return !!document.querySelector(
    '[data-cy*="computer"], [class*="computer-player"], [class*="bot-player"], [class*="computer-avatar"], a[href*="/play/computer"]'
  );
}

function getActiveMoveAssistProfile() {
  if (isPuzzleContext()) return isPuzzleRushEnabled ? 'puzzleRush' : null;
  if (isOnlineGameContext() || isComputerGameContext()) return isAutomoveEnabled ? 'automove' : null;
  return null;
}

function chooseLegitAutomoveMove(pool, fallback, playerSide, pvLines, ownClockSec, fullmove) {
  if (!pool.length) return fallback;
  if (pool.length === 1) return pool[0];

  // Recupera valutazione migliore (centipawns dal lato del giocatore)
  const bestMoveUci = extractUciMove(pool[0]);
  let bestEval = null;
  if (Array.isArray(pvLines) && pvLines.length) {
    const mainPv = pvLines[0];
    if (mainPv && mainPv.moves && mainPv.moves[0] === bestMoveUci) {
      if (mainPv.mate !== null && mainPv.mate !== undefined) {
        const mate = mainPv.mate;
        bestEval = playerSide === 'w' ? mate : -mate;
        bestEval = bestEval > 0 ? 10000 - bestEval : -10000 + bestEval;
      } else if (mainPv.cp !== null && mainPv.cp !== undefined) {
        bestEval = playerSide === 'w' ? mainPv.cp : -mainPv.cp;
      }
    }
  }

  // Margine di calo accettabile: quando sei in netto vantaggio, non buttare la partita.
  let maxDrop = 115;
  if (bestEval !== null && bestEval >= 500) maxDrop = 45;
  else if (bestEval !== null && bestEval >= 300) maxDrop = 60;
  else if (bestEval !== null && bestEval >= 150) maxDrop = 80;
  else if (bestEval !== null && bestEval <= -300) maxDrop = 180;

  // Costruisci mappa valutazioni per ogni mossa
  const evalMap = new Map();
  const mateMap = new Map();
  if (Array.isArray(pvLines)) {
    for (const pv of pvLines) {
      const uci = pv.moves?.[0] ? extractUciMove(pv.moves[0]) : null;
      if (!uci) continue;
      if (Number.isFinite(pv.mate)) mateMap.set(uci, pv.mate);
      let evalCp = null;
      if (pv.mate !== null && pv.mate !== undefined) {
        const m = pv.mate;
        const pEval = playerSide === 'w' ? m : -m;
        evalCp = pEval > 0 ? 10000 - pEval : -10000 + pEval;
      } else if (pv.cp !== null && pv.cp !== undefined) {
        evalCp = playerSide === 'w' ? pv.cp : -pv.cp;
      }
      if (evalCp !== null) evalMap.set(uci, evalCp);
    }
  }

  // Filtra mosse che non peggiorano troppo
  const filtered = pool.filter(uci => {
    if (!evalMap.has(uci)) return true;
    const evalMove = evalMap.get(uci);
    if (bestEval === null) return true;
    return (evalMove >= bestEval - maxDrop);
  });

  let candidates = filtered.length > 0 ? filtered : [pool[0]];

  // Anti-draw: evita linee da patta quando esiste un'alternativa.
  const nonDrawByMate = candidates.filter(uci => mateMap.get(uci) !== 0);
  if (nonDrawByMate.length) candidates = nonDrawByMate;

  const nonDrawByCp = candidates.filter(uci => {
    if (!evalMap.has(uci)) return true;
    const cp = evalMap.get(uci);
    return Math.abs(cp) > 35;
  });
  if (nonDrawByCp.length) candidates = nonDrawByCp;

  const bestCandidate = candidates[0];
  if (candidates.length === 1) {
    legitInaccuracyStreak = 0;
    return bestCandidate;
  }

  // Errore umano occasionale ma controllato: mai in streak lunghi e mai quando il drop e' eccessivo.
  const isWinningBig = Number.isFinite(bestEval) && bestEval >= 300;
  const isWinning = Number.isFinite(bestEval) && bestEval >= 120;
  const isOpening = Number.isInteger(fullmove) && fullmove <= 10;
  const isLowTime = Number.isFinite(ownClockSec) && ownClockSec < 20;

  // Se stiamo vincendo, evita completamente le "mistake move" per convertire senza patte.
  if (isWinning) {
    legitInaccuracyStreak = 0;
    return bestCandidate;
  }

  let mistakeChance = 0.07;
  if (isWinningBig) mistakeChance = 0.10;
  if (isOpening) mistakeChance *= 0.65;
  if (isLowTime) mistakeChance *= 0.55;
  if (legitInaccuracyStreak >= 1) mistakeChance *= 0.35;

  const canMakeMistake = candidates.length > 1 && Math.random() < mistakeChance;
  if (!canMakeMistake) {
    legitInaccuracyStreak = 0;
    return bestCandidate;
  }

  const safeMistakes = candidates.slice(1);
  if (!safeMistakes.length) {
    legitInaccuracyStreak = 0;
    return bestCandidate;
  }

  // Scegli prevalentemente 2a mossa; raramente 3a/4a se ancora dentro il maxDrop.
  const pickRnd = Math.random();
  const pickIdx = pickRnd < 0.86 ? 0 : (pickRnd < 0.98 ? 1 : 2);
  const chosen = safeMistakes[Math.min(pickIdx, safeMistakes.length - 1)] || bestCandidate;
  legitInaccuracyStreak = chosen === bestCandidate ? 0 : Math.min(3, legitInaccuracyStreak + 1);
  return chosen;
}

function getAutomoveCandidateMove(profile = 'automove') {
  if (!lastEvalMoveSourceFen || !lastEvalFen || !isSameFenBoardAndTurn(lastEvalMoveSourceFen, lastEvalFen)) return null;
  const fallbackRaw = extractUciMove(currentBestMove);
  const fallback = isMovePlayableNow(fallbackRaw, lastEvalFen) ? fallbackRaw : null;
  if (profile === 'puzzleRush') return fallback;
  if (automoveMode !== 'legit') {
    return fallback;
  }

  const pool = Array.from(new Set([fallbackRaw, ...(lastEvalTopMoves || [])]
    .map(extractUciMove)
    .filter(m => isMovePlayableNow(m, lastEvalFen))
  )).slice(0, 4);
  if (!pool.length) return fallback;

  const boardEl = getBoardElement();
  const fenTurn = normalizeTurn((lastEvalFen || '').split(' ')[1]);
  const playerSide = getPlayerSide(boardEl);
  const ownClockSec = (boardEl && playerSide && fenTurn && playerSide === fenTurn)
    ? getOwnClockSecondsRemaining(boardEl, playerSide, fenTurn)
    : null;
  const fullmove = getReliableFullmoveNumber();

  return chooseLegitAutomoveMove(pool, fallback, playerSide, lastEvalPvLines, ownClockSec, fullmove);
}

function makePremoveKey(fen, move) {
  const boardAndTurn = getFenBoardAndTurn(fen);
  const uci = extractUciMove(move);
  if (!boardAndTurn || !uci) return null;
  return `${boardAndTurn}|${uci}`;
}

function isPremoveBlockedFor(fen, move) {
  const key = makePremoveKey(fen, move);
  if (!key) return false;
  if (premoveLastAttemptKey !== key) return false;
  if (now() >= premoveBlockedUntil) {
    premoveLastAttemptKey = null;
    premoveBlockedUntil = 0;
    return false;
  }
  return true;
}

function blockPremoveFor(fen, move, ms = 1500) {
  const key = makePremoveKey(fen, move);
  if (!key) return;
  premoveLastAttemptKey = key;
  premoveBlockedUntil = now() + ms;
}

function clearPremoveSchedule() {
  if (premoveTimeout) {
    clearTimeout(premoveTimeout);
    premoveTimeout = null;
  }
  premoveScheduledAt = 0;
  premoveDelayMs = 0;
  premovePlannedMove = null;
  premoveTargetFen = null;
}

function buildPremovePlanFromPv(fen, pvMoves, playerSide) {
  if (!fen || !Array.isArray(pvMoves) || pvMoves.length < 2 || !playerSide) return null;
  const parts = fen.trim().split(/\s+/);
  const turn = normalizeTurn(parts[1]);
  const board = expandFenBoard(parts[0]);
  if (!turn || !board) return null;
  if (turn === playerSide) return null;

  const opp = splitUciMove(pvMoves[0]);
  const rep = splitUciMove(pvMoves[1]);
  if (!opp || !rep) return null;

  const boardBefore = cloneFenBoard(board);
  if (!boardBefore) return null;
  const oppPiece = pieceAtFenSquare(boardBefore, opp.from);
  if (!oppPiece || getPieceColor(oppPiece) !== turn) return null;

  const afterOpp = applyPseudoUciMoveOnBoard(boardBefore, opp.uci);
  if (!afterOpp) return null;

  const repPiece = pieceAtFenSquare(afterOpp.board, rep.from);
  if (!repPiece || getPieceColor(repPiece) !== playerSide) return null;
  const repTarget = pieceAtFenSquare(afterOpp.board, rep.to);
  if (repTarget && getPieceColor(repTarget) === playerSide) return null;

  const isReplyCapture = !!(repTarget && getPieceColor(repTarget) !== playerSide);
  const isRecapture = !!(afterOpp.capturedPiece && rep.to === opp.to && isReplyCapture);
  const isObviousCapture = isRecapture || isReplyCapture;

  return {
    replyMove: rep.uci,
    opponentMove: opp.uci,
    isReplyCapture,
    isRecapture,
    isObviousCapture,
  };
}

// â”€â”€ Premove intelligenti solo su risposte forzate â”€â”€
function getSmartPremoveCandidate(playerSide) {
  if (!automoveUseSmartPremoves || automoveMode !== 'legit') return null;
  if (!lastEvalMoveSourceFen || !lastEvalFen || !isSameFenBoardAndTurn(lastEvalMoveSourceFen, lastEvalFen)) return null;
  if (!Array.isArray(lastEvalPvLines) || !lastEvalPvLines.length) return null;

  const lineCandidates = lastEvalPvLines
    .filter(line => Array.isArray(line?.moves) && line.moves.length >= 2)
    .slice(0, 4);
  if (!lineCandidates.length) return null;

  const mainLine = lineCandidates[0];
  const plan = buildPremovePlanFromPv(lastEvalFen, mainLine.moves, playerSide);
  if (!plan) return null;
  if (!plan.isRecapture) return null;

  const opponentMove = extractUciMove(plan.opponentMove);
  if (!opponentMove) return null;

  // Simula la posizione dopo la mossa dell'avversario
  const parts = lastEvalFen.trim().split(/\s+/);
  const boardBefore = expandFenBoard(parts[0]);
  if (!boardBefore) return null;
  const afterBoard = applyPseudoUciMoveOnBoard(cloneFenBoard(boardBefore), opponentMove);
  if (!afterBoard) return null;

  // Conta le possibili mosse del nostro colore
  const legalReplies = countLegalMovesForColor(afterBoard.board, playerSide);
  // Evita premove aggressivi: consenti solo in casi molto ovvi (ricattura con poche alternative).
  if (legalReplies < 1 || legalReplies > 2) return null;

  return {
    move: plan.replyMove,
    reason: 'obvious-recapture',
    opponentMove: plan.opponentMove,
    isCapture: plan.isReplyCapture,
  };
}

function scheduleSmartPremove(move, targetFen, meta = {}) {
  const uci = extractUciMove(move);
  const key = makePremoveKey(targetFen, uci);
  if (!uci || !key) return;
  if (isPremoveBlockedFor(targetFen, uci)) return;

  const alreadyScheduled = !!(
    premoveTimeout &&
    premoveTargetFen &&
    targetFen &&
    isSameFenBoardAndTurn(premoveTargetFen, targetFen) &&
    premovePlannedMove === uci
  );
  if (alreadyScheduled) return;

  clearPremoveSchedule();
  premovePlannedMove = uci;
  premoveTargetFen = targetFen;
  premoveDelayMs = 85 + Math.floor(Math.random() * 190);
  premoveScheduledAt = now();

  premoveTimeout = setTimeout(() => {
    premoveTimeout = null;
    if (!isAutomoveEnabled || !automoveUseSmartPremoves || automoveMode !== 'legit') return;

    const boardEl = getBoardElement();
    if (!boardEl) return;
    const side = getPlayerSide(boardEl);
    const nowTurn = detectSideToMove();
    if (side && nowTurn && side === nowTurn) return;

    const liveFen = getFenFromPage();
    if (!isSameFenBoardAndTurn(liveFen, premoveTargetFen)) return;

    const sent = executeAutomoveMove(premovePlannedMove);
    automoveLog('premove dispatched', {
      move: premovePlannedMove,
      sent,
      delayMs: premoveDelayMs,
      reason: meta.reason,
      opponentMove: meta.opponentMove
    });
    blockPremoveFor(premoveTargetFen, premovePlannedMove, sent ? 1700 : 900);
    premoveScheduledAt = 0;
    premoveDelayMs = 0;
    premovePlannedMove = null;
    premoveTargetFen = null;
  }, premoveDelayMs);
}

function parseClockTextToSeconds(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/\s+/g, '').replace(/,/g, '.');
  const hms = cleaned.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (hms) {
    const a = parseInt(hms[1], 10);
    const b = parseInt(hms[2], 10);
    const c = hms[3] ? parseInt(hms[3], 10) : null;
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    if (c !== null && !Number.isNaN(c)) return (a * 3600) + (b * 60) + c;
    return (a * 60) + b;
  }
  const secMatch = cleaned.match(/(\d+(?:\.\d+)?)s/i);
  if (secMatch) return parseFloat(secMatch[1]);
  return null;
}

function getOwnClockSecondsRemaining(boardEl = getBoardElement(), playerSide = getPlayerSide(boardEl), turn = detectSideToMove()) {
  if (!boardEl || !playerSide || !turn || playerSide !== turn) return null;
  const activeClock = getActiveClockElement();
  if (!activeClock) return null;
  const txt = activeClock.textContent || '';
  const sec = parseClockTextToSeconds(txt);
  return Number.isFinite(sec) ? sec : null;
}

function computeAutomoveDelayRangeSeconds(boardEl, playerSide, turn, profile = 'automove') {
  let minSec = automoveDelayMin;
  let maxSec = automoveDelayMax;
  const reasons = [];

  if (profile === 'puzzleRush') {
    minSec = 0.09;
    maxSec = 0.35;
    reasons.push('puzzle-rush');
    minSec = Math.max(0.08, minSec);
    maxSec = Math.max(minSec, maxSec);
    return { minSec, maxSec, reasons, ownClockSec: null };
  }

  const openingPly = getReliablePlyCount();
  const isOpeningWindow = Number.isInteger(openingPly) && openingPly >= 0 && openingPly <= 15;
  if (automoveFastInOpening && isOpeningWindow) {
    minSec = 0.5;
    maxSec = 1.0;
    reasons.push('opening');
  }

  const ownClockSec = getOwnClockSecondsRemaining(boardEl, playerSide, turn);
  if (automoveFastWhenLowTime && Number.isFinite(ownClockSec) && ownClockSec < 30) {
    minSec = Math.min(minSec, 0.22);
    maxSec = Math.min(maxSec, 0.90);
    reasons.push('low-time');
  }

  minSec = Math.max(0, minSec);
  maxSec = Math.max(minSec, maxSec);
  return { minSec, maxSec, reasons, ownClockSec };
}

function isGameOverVisible() {
  const selectors = [
    '[data-cy*="game-over"]',
    '[class*="game-over"]',
    '[class*="post-game"]',
    '[class*="rematch"]',
    '[class*="result"]',
    '[role="dialog"]'
  ];
  for (const sel of selectors) {
    const nodes = Array.from(document.querySelectorAll(sel));
    if (nodes.some(isElementRenderable)) return true;
  }
  return false;
}

function getToxicChatGameToken() {
  if (!(isOnlineGameContext() || isComputerGameContext())) return null;
  if (!getBoardElement()) return null;
  return String(location.pathname || '');
}

function getToxicChatInputTarget() {
  const inputCandidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]'));
  for (const el of inputCandidates) {
    if (!isElementRenderable(el)) continue;
    const text = [
      el.getAttribute?.('aria-label') || '',
      el.getAttribute?.('placeholder') || '',
      el.getAttribute?.('name') || '',
      el.getAttribute?.('id') || '',
      el.className || ''
    ].join(' ').toLowerCase();
    if (/\b(chat|message|messaggio)\b/.test(text)) return el;
  }
  return null;
}

function submitInputByEnter(el) {
  const enterDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
  const enterPress = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true });
  const enterUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true });
  el.dispatchEvent(enterDown);
  el.dispatchEvent(enterPress);
  el.dispatchEvent(enterUp);
}

function writeAndSendChatMessage(message) {
  const msg = String(message || '').trim();
  if (!msg) return false;
  const input = getToxicChatInputTarget();
  if (!input) return false;

  try {
    input.focus();
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      input.value = msg;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      submitInputByEnter(input);
      return true;
    }
    if (input.isContentEditable) {
      input.textContent = msg;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      submitInputByEnter(input);
      return true;
    }
  } catch {}
  return false;
}

function clearToxicChatState() {
  toxicChatCurrentGameToken = null;
  toxicChatSentStartToken = null;
  toxicChatSentEndToken = null;
}

function performToxicChatTick() {
  if (!isToxicChatEnabled) return;
  const gameToken = getToxicChatGameToken();
  if (!gameToken) {
    clearToxicChatState();
    return;
  }

  if (toxicChatCurrentGameToken !== gameToken) {
    toxicChatCurrentGameToken = gameToken;
  }

  const currentMessage = String(toxicChatMessage || '').trim();
  if (!currentMessage) return;

  const gameOver = isGameOverVisible();
  const nowTs = now();
  if ((nowTs - toxicChatLastSentAt) < 4000) return;

  if (toxicChatSendOnStart && !gameOver && toxicChatSentStartToken !== gameToken) {
    if (writeAndSendChatMessage(currentMessage)) {
      toxicChatSentStartToken = gameToken;
      toxicChatLastSentAt = nowTs;
      toxicChatLog('start sent', { token: gameToken, text: currentMessage });
    }
    return;
  }

  if (toxicChatSendOnEnd && gameOver && toxicChatSentEndToken !== gameToken) {
    if (writeAndSendChatMessage(currentMessage)) {
      toxicChatSentEndToken = gameToken;
      toxicChatLastSentAt = nowTs;
      toxicChatLog('end sent', { token: gameToken, text: currentMessage });
    }
  }
}

function startToxicChatTicker() {
  if (toxicChatTickInterval) return;
  performToxicChatTick();
  toxicChatTickInterval = setInterval(() => {
    performToxicChatTick();
  }, 700);
}

function stopToxicChatTicker() {
  if (!toxicChatTickInterval) return;
  clearInterval(toxicChatTickInterval);
  toxicChatTickInterval = null;
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
  automoveScheduledProfile = null;
  if (clearTimer) {
    const timerAuto = document.getElementById('cse-mc-timer-automove');
    const timerPuzzle = document.getElementById('cse-mc-timer-puzzlerush');
    if (timerAuto) timerAuto.textContent = '';
    if (timerPuzzle) timerPuzzle.textContent = '';
  }
}

function updateAutomoveButtonState() {
  const autoTimerEl = document.getElementById('cse-mc-timer-automove');
  const puzzleTimerEl = document.getElementById('cse-mc-timer-puzzlerush');
  const autoPlayTimerEl = document.getElementById('cse-mc-timer-autoplay');
  const hasActiveTimer = !!(automoveScheduledAt && automoveDelayMs > 0 && automoveScheduledProfile);
  const timerText = hasActiveTimer
    ? ('ETA ' + (Math.max(0, automoveDelayMs - (now() - automoveScheduledAt)) / 1000).toFixed(1) + 's')
    : '';
  const hasAutoPlayTimer = !!(autoPlayScheduledAt && autoPlayDelayMs > 0);
  const autoPlayTimerText = hasAutoPlayTimer
    ? ('ETA ' + (Math.max(0, autoPlayDelayMs - (now() - autoPlayScheduledAt)) / 1000).toFixed(1) + 's')
    : '';

  if (autoTimerEl) autoTimerEl.textContent = automoveScheduledProfile === 'automove' ? timerText : '';
  if (puzzleTimerEl) puzzleTimerEl.textContent = automoveScheduledProfile === 'puzzleRush' ? timerText : '';
  if (autoPlayTimerEl) autoPlayTimerEl.textContent = autoPlayTimerText;
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
    const evtInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: pt.x,
      clientY: pt.y,
      button: 0,
      buttons
    };
    const usePointerEvent = type.startsWith('pointer') && typeof PointerEvent === 'function';
    const evt = usePointerEvent ? new PointerEvent(type, evtInit) : new MouseEvent(type, evtInit);
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
  const assistProfile = getActiveMoveAssistProfile();
  if (!assistProfile) {
    automoveLog('cancel: disabled');
    clearAutomoveSchedule();
    clearPremoveSchedule();
    return;
  }

  const boardEl = getBoardElement();
  if (!boardEl) {
    automoveLog('cancel: no board');
    clearAutomoveSchedule();
    clearPremoveSchedule();
    return;
  }

  const playerSide = getPlayerSide(boardEl);
  const detectedTurn = detectSideToMove();
  const fenTurn = normalizeTurn((lastEvalFen || '').split(' ')[1]);
  const turn = detectedTurn || fenTurn;

  // Optional smart premove logic: only in online AutoMove + legit mode.
  if (
    assistProfile === 'automove' &&
    playerSide &&
    turn &&
    playerSide !== turn
  ) {
    clearAutomoveSchedule();
    if (!automoveUseSmartPremoves || automoveMode !== 'legit') {
      clearPremoveSchedule();
      return;
    }

    const premoveCandidate = getSmartPremoveCandidate(playerSide);
    if (!premoveCandidate || !lastEvalFen) {
      clearPremoveSchedule();
      return;
    }
    if (isPremoveBlockedFor(lastEvalFen, premoveCandidate.move)) {
      return;
    }

    scheduleSmartPremove(premoveCandidate.move, lastEvalFen, {
      reason: premoveCandidate.reason,
      opponentMove: premoveCandidate.opponentMove
    });
    return;
  }

  // Once it's our turn (or unknown), drop any queued premove schedule.
  clearPremoveSchedule();

  const bestMove = getAutomoveCandidateMove(assistProfile);
  const hasPlannedForCurrentFen = !!(
    automoveTimeout &&
    automoveTargetFen &&
    lastEvalFen &&
    isSameFenBoardAndTurn(automoveTargetFen, lastEvalFen) &&
    automovePlannedMove &&
    automoveScheduledProfile === assistProfile
  );

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
        profile: assistProfile,
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

  if (!bestMove || !lastEvalFen || !isMovePlayableNow(bestMove, lastEvalFen)) {
    automoveLog('cancel: preconditions', {
      profile: assistProfile,
      playerSide,
      turn,
      detectedTurn,
      fenTurn,
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

  const sameTargetFen = !!(
    automoveTargetFen &&
    lastEvalFen &&
    isSameFenBoardAndTurn(automoveTargetFen, lastEvalFen)
  );
  const needsReschedule = !automoveTimeout || !sameTargetFen || automoveScheduledProfile !== assistProfile;
  if (!needsReschedule) {
    updateAutomoveButtonState();
    return;
  }

  clearAutomoveSchedule(false);
  automovePlannedMove = bestMove;
  automoveTargetFen = lastEvalFen;
  automoveScheduledProfile = assistProfile;
  const delayCfg = computeAutomoveDelayRangeSeconds(boardEl, playerSide, turn, assistProfile);
  const minMs = Math.round(delayCfg.minSec * 1000);
  const maxMs = Math.round(delayCfg.maxSec * 1000);
  const instantObvious = shouldBypassAutomoveDelay(assistProfile, automovePlannedMove, automoveTargetFen);
  if (instantObvious) delayCfg.reasons.push('obvious-instant');
  automoveDelayMs = instantObvious
    ? 0
    : (minMs + Math.floor(Math.random() * (Math.max(0, maxMs - minMs) + 1)));
  automoveScheduledAt = now();
  automoveLog('scheduled', {
    profile: assistProfile,
    move: automovePlannedMove,
    delayMs: automoveDelayMs,
    side: playerSide,
    mode: automoveMode,
    engine: getActiveEvalEngineLabel(),
    delayReasons: delayCfg.reasons,
    ownClockSec: delayCfg.ownClockSec,
    topMoves: (lastEvalTopMoves || []).slice(0, 4)
  });
  updateAutomoveButtonState();
  startAutomoveUiTicker();

  automoveTimeout = setTimeout(() => {
    automoveTimeout = null;
    const profile = automoveScheduledProfile;
    const isProfileEnabled = profile === 'puzzleRush' ? isPuzzleRushEnabled : isAutomoveEnabled;
    const currentBoard = getBoardElement();
    if (!isProfileEnabled || !currentBoard) {
      automoveLog('cancel: disabled or board missing at fire time');
      clearAutomoveSchedule();
      return;
    }
    const side = getPlayerSide(currentBoard);
    const nowTurn = detectSideToMove();
    const liveFen = getFenFromPage();
    const liveBoardFen = fenFromPieces();
    if (side && nowTurn && side !== nowTurn) {
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
      blockAutomoveFor(automoveTargetFen, automovePlannedMove, 2200);
      clearAutomoveSchedule();
      return;
    }

    // Verify if turn changed; if not, try one more time quickly.
    sleep(220).then(() => {
      const turnAfter = detectSideToMove();
      const stillEnabled = profile === 'puzzleRush' ? isPuzzleRushEnabled : isAutomoveEnabled;
      if (!stillEnabled) {
        clearAutomoveSchedule();
        return;
      }
      if (!side || !turnAfter || turnAfter !== side) {
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
      blockAutomoveFor(automoveTargetFen, automovePlannedMove, 2200);
      clearAutomoveSchedule();
    });
  }, automoveDelayMs);
}

let _detectSideToMoveInProgress = false;

function detectSideToMove() {
  // Recursion guard â€” if we're already inside this function on the call stack,
  // return null rather than blowing the stack. This prevents cycles where
  // detectTurnFromActiveClock â†’ _detectOrientationColor (or other helpers)
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
  // â”€â”€ Priority 0: active clock (most reliable for live games) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const clockTurn = detectTurnFromActiveClock();
  if (clockTurn) return clockTurn;

  // â”€â”€ Priority 1: board element attributes / JS state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Priority 1.5: board highlights (last move destination piece color) â”€â”€â”€
  const hlTurn = detectTurnFromBoardHighlights();
  if (hlTurn) return hlTurn;

  // â”€â”€ Priority 2: ply count from move list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // After N completed plies: N=0 â†’ white, N=1 â†’ black, N=2 â†’ white â€¦
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

  // â”€â”€ Method 1: Direct JS properties on the custom element â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Method 2: attribute "fen" on the element itself â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (const attr of ['fen', 'data-fen']) {
      const attrFen = normalizeFen(el.getAttribute(attr), { turn: turnHint });
      if (attrFen) return attrFen;
    }
  }

  // â”€â”€ Method 3: any element with a fen attribute â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const el of document.querySelectorAll('[fen], [data-fen]')) {
    const fen = normalizeFen(el.getAttribute('fen') || el.getAttribute('data-fen'), { turn: inferredTurn });
    if (fen) return fen;
  }

  // â”€â”€ Method 4: scan window for game objects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    for (const key of Object.keys(window)) {
      if (!/(fen|game|chess|board|state|move)/i.test(key)) continue;
      try {
        const fen = findFenInObject(window[key], 2, 120);
        if (fen) return fen;
      } catch {}
    }
  } catch {}

  // â”€â”€ Method 5: URL param â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const m = location.href.match(/[?&]fen=([^&#]+)/);
  if (m) {
    const fen = normalizeFen(decodeURIComponent(m[1]), { turn: inferredTurn });
    if (fen) return fen;
  }

  // â”€â”€ Method 6: read pieces from Shadow DOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // Find square (e.g. "square-14" â†’ file=1, rank=4)
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
      // Simpler: check the highlighted squares â€” the last move was made by the opposite color
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

// â”€â”€ Stockfish eval API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let evalAbortController = null;
const evalCache = new Map();
let evalRequestSeq = 0;
let puzzleRushPositionStartedAt = 0;
let puzzleRushPositionKey = null;
let puzzleRushFallbackDepth = null;
let localStockfishWorker = null;
let localStockfishWorkerBlobUrl = null;
let localStockfishInitPromise = null;
let localStockfishSearchId = 0;
let localStockfishCurrentSearch = null;
let localMaiaWorker = null;
let localMaiaWorkerBlobUrl = null;
let localMaiaInitPromise = null;
let localMaiaSearchId = 0;
let localMaiaCurrentSearch = null;
let localMaiaLoadedElo = null;

function isLocalStockfishProvider() {
  return stockfishProvider === 'local';
}

function normalizeMaiaElo(value) {
  const parsed = Number.isFinite(value) ? value : parseInt(value, 10);
  const raw = Number.isFinite(parsed) ? parsed : 1500;
  const snapped = Math.round((raw - MAIA_ELO_MIN) / MAIA_ELO_STEP) * MAIA_ELO_STEP + MAIA_ELO_MIN;
  return Math.max(MAIA_ELO_MIN, Math.min(MAIA_ELO_MAX, snapped));
}

function getMaiaWeightsPath(elo = maiaElo) {
  return `${MAIA_LOCAL_WEIGHTS_DIR}/maia-${normalizeMaiaElo(elo)}.pb.gz`;
}

function getActiveEvalEngineId() {
  if (isPuzzleContext() && isPuzzleRushEnabled) return 'stockfish';
  if (isAutomoveEnabled && !isPuzzleContext() && automoveMode === 'legit') return 'maia';
  return 'stockfish';
}

function getActiveEvalEngineCacheToken(engineId = getActiveEvalEngineId()) {
  if (engineId === 'maia') return `maia-${normalizeMaiaElo(maiaElo)}`;
  return `stockfish-${stockfishProvider}`;
}

function getActiveEvalEngineLabel(engineId = getActiveEvalEngineId()) {
  if (engineId === 'maia') return `Maia ${normalizeMaiaElo(maiaElo)}`;
  return stockfishProvider === 'local' ? 'Local Stockfish' : 'Stockfish API';
}

function clearLocalStockfishSearch(result = null, { aborted = false } = {}) {
  const search = localStockfishCurrentSearch;
  if (!search || search.done) return;
  search.done = true;
  if (search.timeoutId) clearTimeout(search.timeoutId);
  if (search.signal && search.abortHandler) {
    try { search.signal.removeEventListener('abort', search.abortHandler); } catch {}
  }
  localStockfishCurrentSearch = null;
  if (aborted) search.reject(makeAbortError());
  else search.resolve(result);
}

function releaseLocalStockfishEngine() {
  if (localStockfishWorker) {
    try {
      localStockfishWorker.removeEventListener('message', onLocalStockfishMessage);
      localStockfishWorker.removeEventListener('error', onLocalStockfishError);
    } catch {}
    try { localStockfishWorker.postMessage('quit'); } catch {}
    try { localStockfishWorker.terminate(); } catch {}
  }
  localStockfishWorker = null;

  if (localStockfishWorkerBlobUrl) {
    try { URL.revokeObjectURL(localStockfishWorkerBlobUrl); } catch {}
    localStockfishWorkerBlobUrl = null;
  }

  if (localStockfishCurrentSearch && !localStockfishCurrentSearch.done) {
    clearLocalStockfishSearch(null);
  }
}

function parseLocalStockfishInfoLine(line, linesByPv) {
  if (typeof line !== 'string' || !line.startsWith('info ')) return;
  if (!/\bscore\s+(?:cp|mate)\s+-?\d+/.test(line)) return;
  if (!/\bpv\s+/.test(line)) return;
  if (/\blowerbound\b/.test(line) || /\bupperbound\b/.test(line)) return;

  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);
  const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
  const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
  if (!pvMatch) return;

  const pvMoves = pvMatch[1].trim().split(/\s+/).map(extractUciMove).filter(Boolean);
  if (!pvMoves.length) return;

  const rawPv = parseInt((line.match(/\bmultipv\s+(\d+)/) || [])[1] || '1', 10);
  const multipv = Number.isFinite(rawPv)
    ? Math.max(1, Math.min(STOCKFISH_LOCAL_MULTI_PV, rawPv))
    : 1;
  const depth = Number.isFinite(parseInt(depthMatch?.[1] || '0', 10))
    ? parseInt(depthMatch?.[1] || '0', 10)
    : 0;

  const next = {
    depth,
    cp: cpMatch ? parseInt(cpMatch[1], 10) : null,
    mate: mateMatch ? parseInt(mateMatch[1], 10) : null,
    moves: pvMoves,
  };
  const prev = linesByPv.get(multipv);
  if (!prev || next.depth >= prev.depth) linesByPv.set(multipv, next);
}

function buildLocalStockfishResult(turn, bestMove, linesByPv) {
  const perspective = turn === 'b' ? -1 : 1;
  const lines = Array.from(linesByPv.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(0, STOCKFISH_LOCAL_MULTI_PV)
    .map(([pv, data]) => ({ pv, ...data }));

  const primary = lines.find(line => line.pv === 1) || lines[0] || null;
  const normalizedBestMove = extractUciMove(bestMove || '') || primary?.moves?.[0] || null;
  if (!normalizedBestMove) return null;

  const topMoves = Array.from(new Set([
    normalizedBestMove,
    ...lines.map(line => line.moves?.[0]).filter(Boolean),
  ])).slice(0, 4);

  const pvLines = lines.map(line => ({
    moves: (line.moves || []).slice(0, 12),
    cp: Number.isFinite(line.cp) ? line.cp * perspective : null,
    mate: Number.isFinite(line.mate) ? line.mate * perspective : null,
  }));

  const cp = primary && Number.isFinite(primary.cp) ? primary.cp * perspective : null;
  const mate = primary && Number.isFinite(primary.mate) ? primary.mate * perspective : null;
  if (!Number.isFinite(cp) && !Number.isFinite(mate)) return null;
  return {
    cp,
    mate,
    bestMove: normalizedBestMove,
    topMoves,
    pvLines,
  };
}

function onLocalStockfishMessage(event) {
  const line = String(event?.data || '').trim();
  const search = localStockfishCurrentSearch;
  if (!search || search.done || !line) return;

  if (line.startsWith('info ')) {
    parseLocalStockfishInfoLine(line, search.linesByPv);
    return;
  }

  if (line.startsWith('bestmove ')) {
    const bestMove = extractUciMove(line);
    const result = buildLocalStockfishResult(search.turn, bestMove, search.linesByPv);
    clearLocalStockfishSearch(result);
  }
}

function onLocalStockfishError() {
  clearLocalStockfishSearch(null);
  releaseLocalStockfishEngine();
}

function ensureLocalStockfishEngine() {
  if (localStockfishWorker) return Promise.resolve(localStockfishWorker);
  if (localStockfishInitPromise) return localStockfishInitPromise;

  localStockfishInitPromise = (async () => {
    const scriptUrl = chrome.runtime.getURL(STOCKFISH_LOCAL_SCRIPT_PATH);
    const res = await fetch(scriptUrl);
    if (!res.ok) throw new Error(`local-stockfish-script-${res.status}`);
    const source = await res.text();
    if (!source || source.length < 2000) throw new Error('local-stockfish-script-empty');

    const blob = new Blob([source], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);
    localStockfishWorker = worker;
    localStockfishWorkerBlobUrl = blobUrl;

    await new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('local-stockfish-init-timeout'));
      }, STOCKFISH_LOCAL_BOOT_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timer);
        try { worker.removeEventListener('message', onInitMessage); } catch {}
        try { worker.removeEventListener('error', onInitError); } catch {}
      };

      const onInitError = () => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('local-stockfish-init-error'));
      };

      const onInitMessage = (evt) => {
        const text = String(evt?.data || '').trim();
        if (text === 'uciok') {
          try { worker.postMessage('isready'); } catch (err) { onInitError(err); }
          return;
        }
        if (text === 'readyok') {
          if (done) return;
          done = true;
          cleanup();
          resolve();
        }
      };

      worker.addEventListener('message', onInitMessage);
      worker.addEventListener('error', onInitError);
      worker.postMessage('uci');
    });

    worker.addEventListener('message', onLocalStockfishMessage);
    worker.addEventListener('error', onLocalStockfishError);
    return worker;
  })().catch((err) => {
    releaseLocalStockfishEngine();
    throw err;
  }).finally(() => {
    localStockfishInitPromise = null;
  });

  return localStockfishInitPromise;
}

async function runLocalStockfishEval(fen, queryDepth, signal) {
  const worker = await ensureLocalStockfishEngine();
  if (!worker) return null;

  if (localStockfishCurrentSearch && !localStockfishCurrentSearch.done) {
    try { worker.postMessage('stop'); } catch {}
    clearLocalStockfishSearch(null);
  }

  const turn = fen.split(' ')[1] || 'w';
  const timeoutMs = (isAutomoveEnabled || isPuzzleRushEnabled)
    ? Math.max(1000, STOCKFISH_TIMEOUT_FAST_MS + 420)
    : Math.max(2200, queryDepth * 170);

  return new Promise((resolve, reject) => {
    const search = {
      id: ++localStockfishSearchId,
      done: false,
      turn,
      linesByPv: new Map(),
      timeoutId: 0,
      signal,
      abortHandler: null,
      resolve,
      reject,
    };
    localStockfishCurrentSearch = search;

    search.timeoutId = setTimeout(() => {
      try { worker.postMessage('stop'); } catch {}
      clearLocalStockfishSearch(null);
    }, timeoutMs);

    if (signal) {
      search.abortHandler = () => {
        try { worker.postMessage('stop'); } catch {}
        clearLocalStockfishSearch(null, { aborted: true });
      };
      if (signal.aborted) {
        search.abortHandler();
        return;
      }
      signal.addEventListener('abort', search.abortHandler, { once: true });
    }

    try {
      worker.postMessage(`setoption name MultiPV value ${STOCKFISH_LOCAL_MULTI_PV}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${queryDepth}`);
    } catch (err) {
      clearLocalStockfishSearch(null);
    }
  });
}

function clearLocalMaiaSearch(result = null, { aborted = false } = {}) {
  const search = localMaiaCurrentSearch;
  if (!search || search.done) return;
  search.done = true;
  if (search.timeoutId) clearTimeout(search.timeoutId);
  if (search.signal && search.abortHandler) {
    try { search.signal.removeEventListener('abort', search.abortHandler); } catch {}
  }
  localMaiaCurrentSearch = null;
  if (aborted) search.reject(makeAbortError());
  else search.resolve(result);
}

function releaseLocalMaiaEngine() {
  if (localMaiaWorker) {
    try {
      localMaiaWorker.removeEventListener('message', onLocalMaiaMessage);
      localMaiaWorker.removeEventListener('error', onLocalMaiaError);
    } catch {}
    try { localMaiaWorker.postMessage('quit'); } catch {}
    try { localMaiaWorker.terminate(); } catch {}
  }
  localMaiaWorker = null;
  localMaiaLoadedElo = null;

  if (localMaiaWorkerBlobUrl) {
    try { URL.revokeObjectURL(localMaiaWorkerBlobUrl); } catch {}
    localMaiaWorkerBlobUrl = null;
  }

  if (localMaiaCurrentSearch && !localMaiaCurrentSearch.done) {
    clearLocalMaiaSearch(null);
  }
}

function onLocalMaiaMessage(event) {
  const line = String(event?.data || '').trim();
  const search = localMaiaCurrentSearch;
  if (!search || search.done || !line) return;

  if (line.startsWith('info ')) {
    parseLocalStockfishInfoLine(line, search.linesByPv);
    return;
  }

  if (line.startsWith('bestmove ')) {
    const bestMove = extractUciMove(line);
    // Maia's LC0 worker may emit bestmove before an info score at nodes=1.
    // AutoMove only needs the move; Stockfish supplies Game Insights scores.
    const result = buildLocalStockfishResult(search.turn, bestMove, search.linesByPv) || (
      bestMove ? { cp: null, mate: null, bestMove, topMoves: [bestMove], pvLines: [] } : null
    );
    if (result) {
      result.engine = 'maia';
      result.maiaElo = search.elo;
    }
    clearLocalMaiaSearch(result);
  }
}

function onLocalMaiaError() {
  clearLocalMaiaSearch(null);
  releaseLocalMaiaEngine();
}

function ensureLocalMaiaEngine() {
  const elo = normalizeMaiaElo(maiaElo);
  if (localMaiaWorker && localMaiaLoadedElo === elo) return Promise.resolve(localMaiaWorker);
  if (localMaiaWorker && localMaiaLoadedElo !== elo) releaseLocalMaiaEngine();
  if (localMaiaInitPromise) return localMaiaInitPromise;

  localMaiaInitPromise = (async () => {
    const scriptUrl = chrome.runtime.getURL(MAIA_LOCAL_SCRIPT_PATH);
    const weightsUrl = chrome.runtime.getURL(getMaiaWeightsPath(elo));
    // Maia is an ES module worker because the bundled LC0 runtime uses
    // import.meta, a WASM module and module-based pthread workers.
    const worker = new Worker(scriptUrl, { type: 'module', name: 'cse-maia-local' });
    localMaiaWorker = worker;
    localMaiaWorkerBlobUrl = null;

    await new Promise((resolve, reject) => {
      let done = false;
      let sentReady = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('local-maia-init-timeout'));
      }, MAIA_LOCAL_BOOT_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timer);
        try { worker.removeEventListener('message', onInitMessage); } catch {}
        try { worker.removeEventListener('error', onInitError); } catch {}
      };

      const onInitError = () => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('local-maia-init-error'));
      };

      const onInitMessage = (evt) => {
        const text = String(evt?.data || '').trim();
        if (text === 'uciok' && !sentReady) {
          sentReady = true;
          try {
            worker.postMessage(`setoption name WeightsFile value ${weightsUrl}`);
            worker.postMessage('setoption name Threads value 1');
            worker.postMessage('setoption name MinibatchSize value 1');
            worker.postMessage('isready');
          } catch (err) {
            onInitError(err);
          }
          return;
        }
        if (text === 'readyok') {
          if (done) return;
          done = true;
          cleanup();
          resolve();
        }
      };

      worker.addEventListener('message', onInitMessage);
      worker.addEventListener('error', onInitError);
      worker.postMessage('uci');
    });

    localMaiaLoadedElo = elo;
    worker.addEventListener('message', onLocalMaiaMessage);
    worker.addEventListener('error', onLocalMaiaError);
    return worker;
  })().catch((err) => {
    releaseLocalMaiaEngine();
    throw err;
  }).finally(() => {
    localMaiaInitPromise = null;
  });

  return localMaiaInitPromise;
}

async function runLocalMaiaEval(fen, _queryDepth, signal) {
  const worker = await ensureLocalMaiaEngine();
  if (!worker) return null;

  if (localMaiaCurrentSearch && !localMaiaCurrentSearch.done) {
    try { worker.postMessage('stop'); } catch {}
    clearLocalMaiaSearch(null);
  }

  const turn = fen.split(' ')[1] || 'w';
  const elo = normalizeMaiaElo(maiaElo);

  return new Promise((resolve, reject) => {
    const search = {
      id: ++localMaiaSearchId,
      done: false,
      turn,
      elo,
      linesByPv: new Map(),
      timeoutId: 0,
      signal,
      abortHandler: null,
      resolve,
      reject,
    };
    localMaiaCurrentSearch = search;

    search.timeoutId = setTimeout(() => {
      try { worker.postMessage('stop'); } catch {}
      clearLocalMaiaSearch(null);
    }, MAIA_LOCAL_SEARCH_TIMEOUT_MS);

    if (signal) {
      search.abortHandler = () => {
        try { worker.postMessage('stop'); } catch {}
        clearLocalMaiaSearch(null, { aborted: true });
      };
      if (signal.aborted) {
        search.abortHandler();
        return;
      }
      signal.addEventListener('abort', search.abortHandler, { once: true });
    }

    try {
      worker.postMessage(`position fen ${fen}`);
      // Restore the original fast local Maia search behavior.
      worker.postMessage('go nodes 1');
    } catch (err) {
      clearLocalMaiaSearch(null);
    }
  });
}

const gameInsightsStockfishJobs = new Map();
function queueGameInsightsStockfishEval(fen, ply) {
  if (!isGameInsightsEnabled || !fen || gameInsightsStockfishJobs.has(fen)) return;
  const depth = Math.max(4, Math.min(6, suggestMoveDepth));
  const job = runLocalStockfishEval(fen, depth, null)
    .then(result => {
      if (!result || !isGameInsightsEnabled) return;
      window.CSEGameInsights?.handleEval?.({
        fen,
        ply,
        cp: Number.isFinite(result.cp) ? result.cp : null,
        mate: Number.isFinite(result.mate) ? result.mate : null,
        bestMove: result.bestMove || null,
        topMoves: Array.isArray(result.topMoves) ? result.topMoves.slice(0, 4) : [],
        gameOver: isGameOverVisible(),
      });
    })
    .catch(() => {})
    .finally(() => gameInsightsStockfishJobs.delete(fen));
  gameInsightsStockfishJobs.set(fen, job);
}

function getEvalFenCacheToken(fen) {
  if (typeof fen !== 'string') return String(fen || '');
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2 || !expandFenBoard(parts[0])) return fen;
  const turn = normalizeTurn(parts[1]);
  if (!turn) return fen;
  const castling = normalizeCastlingRights(parts[2] || '-');
  const enPassant = /^(?:-|[a-h][36])$/.test(parts[3] || '') ? parts[3] : '-';
  return `${parts[0]} ${turn} ${castling} ${enPassant}`;
}

function getEvalCacheKey(fen, depth, engineToken = getActiveEvalEngineCacheToken()) {
  return `${engineToken}|${depth}|${getEvalFenCacheToken(fen)}`;
}

function getCachedEval(fen, depth, engineToken = getActiveEvalEngineCacheToken()) {
  const key = getEvalCacheKey(fen, depth, engineToken);
  const entry = evalCache.get(key);
  if (!entry) return null;
  if (now() - entry.ts > EVAL_CACHE_TTL) {
    evalCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedEval(fen, depth, value, engineToken = getActiveEvalEngineCacheToken()) {
  evalCache.set(getEvalCacheKey(fen, depth, engineToken), { ts: now(), value });
}

function clearPuzzleRushDepthFallback() {
  puzzleRushPositionStartedAt = 0;
  puzzleRushPositionKey = null;
  puzzleRushFallbackDepth = null;
}

function getPuzzleRushPositionKey(fen) {
  return getFenBoardAndTurn(fen);
}

function randomIntInclusive(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return lo + Math.floor(Math.random() * (Math.max(0, hi - lo) + 1));
}

function updatePuzzleRushDepthFallback(fen) {
  if (!isPuzzleRushEnabled || !isPuzzleContext()) {
    clearPuzzleRushDepthFallback();
    return false;
  }

  const key = getPuzzleRushPositionKey(fen);
  if (!key) {
    clearPuzzleRushDepthFallback();
    return false;
  }

  if (puzzleRushPositionKey !== key) {
    puzzleRushPositionKey = key;
    puzzleRushPositionStartedAt = now();
    puzzleRushFallbackDepth = null;
    return false;
  }

  if (Number.isFinite(puzzleRushFallbackDepth)) return false;
  if (now() - puzzleRushPositionStartedAt < PUZZLE_RUSH_STUCK_TIMEOUT_MS) return false;

  puzzleRushFallbackDepth = randomIntInclusive(PUZZLE_RUSH_FALLBACK_DEPTH_MIN, PUZZLE_RUSH_FALLBACK_DEPTH_MAX);
  automoveLog('puzzle-rush fallback depth activated', {
    depth: puzzleRushFallbackDepth,
    fen: key
  });
  return true;
}

function getEvalQueryDepth(fen = lastEvalFen) {
  if (isPuzzleContext() && isPuzzleRushEnabled) {
    const key = getPuzzleRushPositionKey(fen);
    if (key && key === puzzleRushPositionKey && Number.isFinite(puzzleRushFallbackDepth)) {
      return Math.max(1, Math.min(30, puzzleRushFallbackDepth));
    }
    return Math.max(1, Math.min(30, puzzleRushDepth));
  }

  if (isAutomoveEnabled && !isPuzzleContext()) {
    // Maia uses a fixed short move-time; Stockfish remains depth-capped.
    const fastDepthCap = automoveMode === 'legit' ? 5 : 8;
    return Math.max(4, Math.min(fastDepthCap, suggestMoveDepth));
  }

  // Game Insights only needs a stable shallow score for live classification.
  if (isGameInsightsEnabled && !isEvalBarEnabled && !arrowsEnabled) {
    return Math.max(4, Math.min(7, suggestMoveDepth));
  }

  return Math.max(1, Math.min(15, suggestMoveDepth));
}

function isEvalProxyUrl(url) {
  return /^https:\/\/stockfish\.online\//i.test(String(url || ''));
}

function makeAbortError() {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(makeAbortError());

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(makeAbortError());
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => { cleanup(); resolve(value); },
      err => { cleanup(); reject(err); }
    );
  });
}

function fetchJsonViaBackground(url, { signal, headers, timeoutMs, abortKey } = {}) {
  const runtime = chrome?.runtime;
  if (!runtime?.id || typeof runtime.sendMessage !== 'function') {
    return Promise.reject(new Error('runtime-not-available'));
  }

  const request = new Promise((resolve, reject) => {
    runtime.sendMessage(
      { type: 'cse-fetch-json', url, headers, timeoutMs, abortKey },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || 'runtime-sendMessage-failed'));
          return;
        }
        if (!response || typeof response !== 'object') {
          reject(new Error('empty-background-response'));
          return;
        }
        resolve(response);
      }
    );
  });

  return withAbort(request, signal);
}

async function fetchJsonWithStatus(url, { signal, headers, timeoutMs, abortKey } = {}) {
  if (isEvalProxyUrl(url)) {
    try {
      return await fetchJsonViaBackground(url, { signal, headers, timeoutMs, abortKey });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
    }
  }

  const res = await fetch(url, { signal, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, data };
}

async function fetchEval(fen) {
  const queryDepth = getEvalQueryDepth(fen);
  const activeEngineId = getActiveEvalEngineId();
  const engineToken = getActiveEvalEngineCacheToken(activeEngineId);
  const cached = getCachedEval(fen, queryDepth, engineToken);
  if (cached) {
    registerEvalSuccess();
    if (activeEngineId === 'maia') queueGameInsightsStockfishEval(fen, getReliablePlyCount());
    return cached;
  }

  // Cancel any in-flight request for a previous position
  if (evalAbortController) evalAbortController.abort();
  evalAbortController = new AbortController();
  const signal = evalAbortController.signal;
  const turn = fen.split(' ')[1] || 'w';
  const fastEvalMode = !!(isAutomoveEnabled || isPuzzleRushEnabled);
  const normalizeTopMoves = (moves) =>
    Array.from(new Set((moves || []).map(extractUciMove).filter(Boolean))).slice(0, 4);
  const withTimeout = (promise, ms) => {
    if (!Number.isFinite(ms) || ms <= 0) return promise;
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TimeoutError')), ms))
    ]);
  };
  const extractStockfishMoves = (payload, primaryMove) => {
    const collected = [primaryMove];
    const addFrom = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(addFrom);
        return;
      }
      if (typeof value === 'string') {
        const first = value.trim().split(/\s+/)[0];
        if (first) collected.push(first);
        return;
      }
      if (typeof value === 'object') {
        addFrom(value.bestmove);
        addFrom(value.move);
        addFrom(value.pv);
        addFrom(value.line);
      }
    };

    addFrom(payload?.topMoves);
    addFrom(payload?.topmoves);
    addFrom(payload?.multiPv);
    addFrom(payload?.multipv);
    addFrom(payload?.lines);
    addFrom(payload?.pv);
    addFrom(payload?.continuation);
    return normalizeTopMoves(collected);
  };
  const allowApiFallback = activeEngineId !== 'maia' && (stockfishProvider === 'api' || stockfishProvider === 'local');

  if (activeEngineId === 'maia') {
    // Maia is local-only: do not replace a slow/failed Maia response with
    // Stockfish or the remote API, which made latency and behavior inconsistent.
    if (!isGameInsightsEnabled) releaseLocalStockfishEngine();
    try {
      const maiaResult = await runLocalMaiaEval(fen, queryDepth, signal);
      if (maiaResult) {
        setCachedEval(fen, queryDepth, maiaResult, engineToken);
        registerEvalSuccess();
        queueGameInsightsStockfishEval(fen, getReliablePlyCount());
        return maiaResult;
      }
      registerEvalFailure();
      return null;
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      registerEvalFailure();
      releaseLocalMaiaEngine();
      return null;
    }
  }
  releaseLocalMaiaEngine();

  if (isLocalStockfishProvider()) {
    try {
      const localResult = await runLocalStockfishEval(fen, queryDepth, signal);
      if (localResult) {
        localResult.engine = activeEngineId === 'maia' ? 'stockfish-fallback' : 'stockfish';
        setCachedEval(fen, queryDepth, localResult, engineToken);
        registerEvalSuccess();
        return localResult;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      releaseLocalStockfishEngine();
    }
  } else {
    releaseLocalStockfishEngine();
  }

  if (allowApiFallback) {
    // stockfish.online fallback (or explicit API provider)
    try {
      const baseStockfishUrl = (depth) =>
        `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${depth}&multiPv=4`;
      const url = baseStockfishUrl(queryDepth);
      const stockfishTimeoutMs = fastEvalMode ? STOCKFISH_TIMEOUT_FAST_MS : 0;
      const res = await withTimeout(
        fetchJsonWithStatus(url, {
          signal,
          timeoutMs: stockfishTimeoutMs,
          abortKey: 'eval-stockfish'
        }),
        stockfishTimeoutMs ? stockfishTimeoutMs + 150 : 0
      );
      if (res.ok) {
        const data = res.data;
        if (data.success) {
          const bestMove = extractUciMove(data.bestmove);
          let topMoves = extractStockfishMoves(data, bestMove);

          // In legit mode we need more than one candidate often, but probing is expensive.
          // Keep it for non-automove analysis only to avoid move latency.
          const shouldProbeExtra =
            !isAutomoveEnabled &&
            !isPuzzleRushEnabled &&
            automoveMode === 'legit' &&
            !isPuzzleContext();
          if (shouldProbeExtra && topMoves.length < 3) {
            const probeDepths = Array.from(new Set([
              Math.max(6, queryDepth - 2),
              Math.max(6, queryDepth - 5),
              Math.max(6, queryDepth - 8),
            ])).filter(d => d !== queryDepth);

            for (const depth of probeDepths) {
              if (signal.aborted || topMoves.length >= 4) break;
              try {
                const probeRes = await fetchJsonWithStatus(baseStockfishUrl(depth), {
                  signal,
                  abortKey: 'eval-stockfish'
                });
                if (!probeRes?.ok || !probeRes?.data?.success) continue;
                const probeMove = extractUciMove(probeRes.data.bestmove);
                topMoves = normalizeTopMoves([...topMoves, probeMove]);
              } catch (probeErr) {
                if (probeErr?.name === 'AbortError') throw probeErr;
              }
            }
          }

          if (data.mate !== null && data.mate !== undefined && data.mate !== 0) {
            const result = {
              cp: null,
              mate: turn === 'w' ? data.mate : -data.mate,
              bestMove,
              topMoves,
              pvLines: topMoves.map((m, idx) => ({ moves: [m], cp: null, mate: idx === 0 ? data.mate : null })),
              engine: activeEngineId === 'maia' ? 'stockfish-api-fallback' : 'stockfish-api',
            };
            setCachedEval(fen, queryDepth, result, engineToken);
            registerEvalSuccess();
            return result;
          }
          const cpRaw = Math.round(parseFloat(data.evaluation) * 100);
          const cp = turn === 'w' ? cpRaw : -cpRaw;
          if (!isNaN(cp)) {
            const result = {
              cp,
              mate: null,
              bestMove,
              topMoves,
              pvLines: topMoves.map((m, idx) => ({ moves: [m], cp: idx === 0 ? cp : null, mate: null })),
              engine: activeEngineId === 'maia' ? 'stockfish-api-fallback' : 'stockfish-api',
            };
            setCachedEval(fen, queryDepth, result, engineToken);
            registerEvalSuccess();
            return result;
          }
        }
      }
    } catch (e) {
      if (e?.name === 'AbortError') return null; // newer position superseded this one
    }
  }

  registerEvalFailure();
  return null;
}

// â”€â”€ Bar rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ 1. HTML attribute (most explicit â€” chess.com sets orientation="black" for live games) â”€â”€
  const orientAttr = (
    boardEl.getAttribute?.('orientation') ||
    boardEl.getAttribute?.('data-orientation') ||
    boardEl.dataset?.orientation || ''
  ).toLowerCase();
  if (orientAttr === 'black' || orientAttr === 'b') return 'b';
  if (orientAttr === 'white' || orientAttr === 'w') return 'w';

  // â”€â”€ 2. JS property (wc-chess-board is a Web Component â€” the Lit property may differ from attribute) â”€â”€
  try {
    const orientProp = (typeof boardEl.orientation === 'string') ? boardEl.orientation.toLowerCase() : null;
    if (orientProp === 'black' || orientProp === 'b') return 'b';
    if (orientProp === 'white' || orientProp === 'w') return 'w';
  } catch {}

  // â”€â”€ 3. Player/my color properties on the element or its game object â”€â”€
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

  // â”€â”€ 4. Boolean flipped property â”€â”€
  try {
    if (boardEl.flipped === true)  return 'b';
    if (boardEl.flipped === false) return 'w';
  } catch {}

  // â”€â”€ 5. flipped HTML attribute â”€â”€
  const flippedAttr = boardEl.getAttribute?.('flipped');
  if (flippedAttr === '' || flippedAttr === 'true') return 'b';
  if (flippedAttr === 'false') return 'w';

  // â”€â”€ 6. CSS class â”€â”€
  if (
    boardEl.classList?.contains('board-flipped') ||
    document.querySelector('.flipped-board, [class*="board-flipped"]')
  ) return 'b';

  // â”€â”€ 7. White king visual position â€” most reliable visual indicator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // On chess.com the local player's pieces are always at the bottom (the board
  // flips when playing black). So:
  //   white king in BOTTOM half of board â†’ white is at bottom â†’ player is WHITE
  //   white king in TOP half of board    â†’ white is at top   â†’ player is BLACK (flipped board)
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
          // White king below midpoint â†’ white at bottom â†’ playing white
          // White king above midpoint â†’ white at top â†’ playing black (flipped)
          const detected = cy > midY ? 'w' : 'b';
          playerSideCache = { side: detected, ts: now() };
          return detected;
        }
      }
    }
  } catch {}

  // â”€â”€ 8. Board coordinate labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Who am I? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // Always blue â€” it's always MY move when we reach this point
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
  // Â±300cp = slight/moderate advantage, Â±800cp â‰ˆ decisive
  if (!Number.isFinite(cp)) return 50;
  const pct = 50 + 50 * (2 / (1 + Math.exp(-cp / 200)) - 1);
  return Math.max(2, Math.min(98, pct));
}

function updateEvalBarDisplay(result) {
  if (!result) {
    currentBestMove = null;
    lastEvalTopMoves = [];
    lastEvalPvLines = [];
    lastEvalMate = null;
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
      evalBarPanel.title = 'Eval non disponibile (posizione non trovata o engine non raggiungibile)';
    }
    return;
  }

  lastEvalMoveSourceFen = lastEvalFen;
  lastEvalTopMoves = Array.isArray(result.topMoves) ? result.topMoves.slice(0, 4) : [];
  lastEvalPvLines = Array.isArray(result.pvLines) ? result.pvLines.slice(0, 4) : [];
  lastEvalMate = Number.isFinite(result.mate) ? result.mate : null;
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
    const cp = Number.isFinite(result.cp) ? result.cp : 0; // raw centipawns, white perspective
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
      // A sigmoid percentage is only a visual fill, not a real win probability.
      // Always show the engine score so the compact mode cannot contradict the bar.
      const displayLabel = label;
      scoreEl.textContent = displayLabel;
      scoreEl.className = 'cse-eval-score ' + cls;
    }
    evalBarPanel.title = result.bestMove ? `Best move: ${result.bestMove}` : '';
  }
}
const cseGuiState = {
  activeTab: 'ALL',
  favorites: { AutoMove: false, PuzzleRush: false, AutoPlay: false, ToxicChat: false, GameInsights: false, SuggestMove: false, EvaluationBar: false, GUI: false },
  openSettings: null,
  settingsSection: 'general',
};

function applySavedGuiAndModuleState() {
  const saved = cseReadState();
  if (!saved) return;

  if (saved.favorites && typeof saved.favorites === 'object') {
    cseGuiState.favorites = {
      ...cseGuiState.favorites,
      AutoMove: !!saved.favorites.AutoMove,
      PuzzleRush: !!saved.favorites.PuzzleRush,
      AutoPlay: !!saved.favorites.AutoPlay,
      ToxicChat: !!saved.favorites.ToxicChat,
      GameInsights: !!saved.favorites.GameInsights,
      SuggestMove: !!saved.favorites.SuggestMove,
      EvaluationBar: !!saved.favorites.EvaluationBar,
      GUI: !!saved.favorites.GUI,
    };
  }

  if (saved.activeTab === 'ALL' || saved.activeTab === 'FAVORITE' || saved.activeTab === 'SETTINGS') {
    cseGuiState.activeTab = saved.activeTab;
  }

  if (saved.modules && typeof saved.modules === 'object') {
    isAutomoveEnabled = !!saved.modules.AutoMove;
    isPuzzleRushEnabled = !!saved.modules.PuzzleRush;
    isAutoPlayEnabled = !!saved.modules.AutoPlay;
    isToxicChatEnabled = !!saved.modules.ToxicChat;
    isGameInsightsEnabled = !!saved.modules.GameInsights;
    arrowsEnabled = !!saved.modules.SuggestMove;
    isEvalBarEnabled = !!saved.modules.EvaluationBar;
    isGuiHudEnabled = !!saved.modules.GUI;
  }

  if (saved.settings && typeof saved.settings === 'object') {
    if (saved.settings.stockfishProvider === 'local' || saved.settings.stockfishProvider === 'api') {
      stockfishProvider = saved.settings.stockfishProvider;
    }
    if (Number.isFinite(saved.settings.maiaElo)) maiaElo = normalizeMaiaElo(saved.settings.maiaElo);
    if (saved.settings.automoveMode === 'legit' || saved.settings.automoveMode === 'blatant') automoveMode = saved.settings.automoveMode;
    if (Number.isFinite(saved.settings.automoveDelayMin)) automoveDelayMin = Math.max(0, Math.min(15, Math.round(saved.settings.automoveDelayMin)));
    if (Number.isFinite(saved.settings.automoveDelayMax)) automoveDelayMax = Math.max(0, Math.min(15, Math.round(saved.settings.automoveDelayMax)));
    if (automoveDelayMax < automoveDelayMin) automoveDelayMax = automoveDelayMin;
    automoveFastWhenLowTime = !!saved.settings.automoveFastWhenLowTime;
    automoveFastInOpening = !!saved.settings.automoveFastInOpening;
    automoveUseSmartPremoves = !!saved.settings.automoveUseSmartPremoves;
    automoveToggleHotkey = normalizeModuleHotkey(saved.settings.automoveToggleHotkey);
    if (Number.isFinite(saved.settings.puzzleRushDepth)) puzzleRushDepth = Math.max(1, Math.min(15, Math.round(saved.settings.puzzleRushDepth)));
    if (Number.isFinite(saved.settings.suggestMoveDepth)) suggestMoveDepth = Math.max(1, Math.min(15, Math.round(saved.settings.suggestMoveDepth)));
    suggestMoveToggleHotkey = normalizeModuleHotkey(saved.settings.suggestMoveToggleHotkey);
    stockfishAutoReloadEnabled = !!saved.settings.stockfishAutoReloadEnabled;
    autoPlayAcceptRematch = saved.settings.autoPlayAcceptRematch !== false;
    if (typeof saved.settings.toxicChatMessage === 'string') toxicChatMessage = saved.settings.toxicChatMessage;
    toxicChatSendOnStart = !!saved.settings.toxicChatSendOnStart;
    toxicChatSendOnEnd = saved.settings.toxicChatSendOnEnd !== false;
    if (saved.settings.evalBarDisplayMode === 'percent' || saved.settings.evalBarDisplayMode === 'bar') {
      evalBarDisplayMode = saved.settings.evalBarDisplayMode;
    }
    if (saved.settings.generalLanguage === 'en' || saved.settings.generalLanguage === 'it') {
      generalLanguage = saved.settings.generalLanguage;
    }
    if (saved.settings.generalNumbersFormat === 'default' || saved.settings.generalNumbersFormat === 'eu') {
      generalNumbersFormat = saved.settings.generalNumbersFormat;
    }
    generalMinimizeToTray = saved.settings.generalMinimizeToTray !== false;
    if (['aurora', 'blockforge', 'voidos'].includes(saved.settings.uiTheme)) uiTheme = saved.settings.uiTheme;
    if (['emerald', 'cyan', 'violet', 'rose', 'gold'].includes(saved.settings.uiAccent)) uiAccent = saved.settings.uiAccent;
    if (['compact', 'comfortable', 'spacious'].includes(saved.settings.uiDensity)) uiDensity = saved.settings.uiDensity;
    uiMotionEnabled = saved.settings.uiMotionEnabled !== false;
    if (saved.settings.notifications && typeof saved.settings.notifications === 'object') {
      for (const key of Object.keys(uiNotifications)) {
        if (typeof saved.settings.notifications[key] === 'boolean') uiNotifications[key] = saved.settings.notifications[key];
      }
    }
    if (['bottom-right','bottom-left','top-right','top-left'].includes(saved.settings.notificationPosition)) {
      notificationPosition = saved.settings.notificationPosition;
    }
  }
}

function applyUiTheme() {
  const theme = ['aurora', 'blockforge', 'voidos'].includes(uiTheme) ? uiTheme : 'aurora';
  const root = document.documentElement;
  root.dataset.cseTheme = theme;
  root.dataset.cseAccent = uiAccent;
  root.dataset.cseDensity = uiDensity;
  root.dataset.cseMotion = uiMotionEnabled ? 'on' : 'off';
  root.dataset.cseNotificationPosition = notificationPosition;
  if (document.body) {
    document.body.dataset.cseTheme = theme;
    document.body.dataset.cseAccent = uiAccent;
    document.body.dataset.cseDensity = uiDensity;
    document.body.dataset.cseMotion = uiMotionEnabled ? 'on' : 'off';
  }
  if (toolsModal?.isConnected) toolsModal.dataset.cseTheme = theme;
}

function cseSyncAnimatedRanges(root = document) {
  root.querySelectorAll?.('.cse-mc-slider[type="range"]').forEach(slider => {
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const value = Number(slider.value || min);
    const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;
    slider.style.setProperty('--cse-range-progress', Math.max(0, Math.min(100, progress)) + '%');
  });
}

document.addEventListener('input', event => {
  if (event.target?.matches?.('.cse-mc-slider[type="range"]')) cseSyncAnimatedRanges(event.target.parentElement || document);
}, { passive: true });

const cseNotificationTimes = new Map();
function cseNotify(key, title, message = '', options = {}) {
  if (!uiNotifications[key]) return;
  const id = options.id || key;
  const cooldown = Number.isFinite(options.cooldown) ? options.cooldown : 1400;
  const previous = cseNotificationTimes.get(id) || 0;
  if (now() - previous < cooldown) return;
  cseNotificationTimes.set(id, now());

  let tray = document.getElementById('cse-toast-tray');
  if (!tray) {
    tray = document.createElement('aside');
    tray.id = 'cse-toast-tray';
    tray.className = 'cse-toast-tray';
    tray.dataset.position = notificationPosition;
    tray.setAttribute('aria-live', 'polite');
    document.body.appendChild(tray);
  }
  tray.dataset.position = notificationPosition;
  const toast = document.createElement('button');
  toast.type = 'button';
  toast.className = `cse-toast cse-toast-${key}`;
  toast.innerHTML = `<span class="cse-toast-pulse"></span><span><strong>${escapeHtmlAttr(title)}</strong><small>${escapeHtmlAttr(message)}</small></span><i>×</i>`;
  const dismiss = () => {
    if (toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 220);
  };
  toast.addEventListener('click', dismiss);
  tray.appendChild(toast);
  while (tray.children.length > 4) tray.firstElementChild?.remove();
  setTimeout(dismiss, options.duration || 3600);
}
window.CSENotify = cseNotify;

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
  return !!(isEvalBarEnabled || arrowsEnabled || isAutomoveEnabled || isPuzzleRushEnabled || isGameInsightsEnabled);
}

function resetStockfishFailureTracking() {
  stockfishFailureStreak = 0;
  stockfishFailureSinceAt = 0;
}

function registerEvalSuccess() {
  const wasOffline = !stockfishLastSuccessAt || stockfishFailureStreak > 0;
  stockfishLastSuccessAt = now();
  resetStockfishFailureTracking();
  if (wasOffline) cseNotify('engineReady', 'Engine ready', getActiveEvalEngineLabel(), { id: 'engine-ready', cooldown: 30000 });
}

function registerEvalFailure() {
  if (stockfishFailureStreak === 0) stockfishFailureSinceAt = now();
  stockfishFailureStreak += 1;
}

function reloadStockfishConnection(reason = 'manual-ui', forceTick = true) {
  if (evalAbortController) {
    try { evalAbortController.abort(); } catch {}
    evalAbortController = null;
  }
  releaseLocalStockfishEngine();
  releaseLocalMaiaEngine();
  evalCache.clear();
  evalRequestSeq++;
  clearAutomoveSchedule();
  clearPuzzleRushDepthFallback();
  lastEvalFen = null;
  lastEvalMoveSourceFen = null;
  currentBestMove = null;
  lastEvalTopMoves = [];
  lastEvalPvLines = [];
  lastEvalMate = null;
  stockfishNoFenSinceAt = 0;
  hideBestMoveOverlay();
  clearPremoveSchedule();
  resetStockfishFailureTracking();
  stockfishLastReloadAt = now();
  automoveLog('stockfish reload', { reason });
  if (forceTick) ensureEvalEngineState(true);
}

function maybeAutoReloadStockfish() {
  if (!stockfishAutoReloadEnabled) return;
  if (!isEvaluationEngineNeeded()) return;
  const failStuck = !!(stockfishFailureStreak && stockfishFailureSinceAt && (now() - stockfishFailureSinceAt >= STOCKFISH_AUTO_RELOAD_INTERVAL_MS));
  const noFenStuck = !!(stockfishNoFenSinceAt && (now() - stockfishNoFenSinceAt >= STOCKFISH_AUTO_RELOAD_INTERVAL_MS));
  if (!failStuck && !noFenStuck) return;
  if (stockfishLastReloadAt && now() - stockfishLastReloadAt < STOCKFISH_AUTO_RELOAD_INTERVAL_MS) return;
  reloadStockfishConnection(failStuck ? 'auto-watchdog-fail' : 'auto-watchdog-no-fen', false);
}

function formatAgo(ts) {
  if (!ts || !Number.isFinite(ts)) return 'never';
  const sec = Math.max(0, Math.floor((now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s ago`;
}

function getEvalTickIntervalMs() {
  if (isAutomoveEnabled || isPuzzleRushEnabled) return EVAL_TICK_FAST_MS;
  return EVAL_TICK_NORMAL_MS;
}

function stopEvalEngine() {
  if (evalUpdateInterval) {
    clearInterval(evalUpdateInterval);
    evalUpdateInterval = null;
  }
  releaseLocalStockfishEngine();
  releaseLocalMaiaEngine();
  evalTickIntervalMs = 0;
  resetStockfishFailureTracking();
  clearPuzzleRushDepthFallback();
  evalRequestSeq++;
  clearAutomoveSchedule();
  clearPremoveSchedule();
  lastEvalFen = null;
  lastEvalMoveSourceFen = null;
  currentBestMove = null;
  lastEvalTopMoves = [];
  lastEvalPvLines = [];
  lastEvalMate = null;
  hideBestMoveOverlay();
}

function ensureEvalEngineState(forceTick = false) {
  const needed = isEvaluationEngineNeeded();
  if (!needed) {
    stopEvalEngine();
    return;
  }
  const desiredTickMs = getEvalTickIntervalMs();
  if (!evalUpdateInterval || evalTickIntervalMs !== desiredTickMs) {
    if (evalUpdateInterval) clearInterval(evalUpdateInterval);
    evalTickIntervalMs = desiredTickMs;
    tickEvalBar();
    evalUpdateInterval = setInterval(tickEvalBar, desiredTickMs);
    return;
  }
  if (forceTick) tickEvalBar();
}

function getActiveModuleHudEntries() {
  const entries = [];
  const activeTimer = (automoveScheduledAt && automoveDelayMs > 0 && automoveScheduledProfile)
    ? ('ETA ' + (Math.max(0, automoveDelayMs - (now() - automoveScheduledAt)) / 1000).toFixed(1) + 's')
    : '';
  const autoPlayTimer = (autoPlayScheduledAt && autoPlayDelayMs > 0)
    ? ('ETA ' + (Math.max(0, autoPlayDelayMs - (now() - autoPlayScheduledAt)) / 1000).toFixed(1) + 's')
    : '';

  if (isAutomoveEnabled) {
    const timer = automoveScheduledProfile === 'automove' ? activeTimer : '';
    entries.push({
      key: 'AutoMove|' + timer,
      html: `AutoMove${timer ? ` <span class="cse-gui-hud-timer">${timer}</span>` : ''}`,
    });
  }
  if (isPuzzleRushEnabled) {
    const timer = automoveScheduledProfile === 'puzzleRush' ? activeTimer : '';
    entries.push({
      key: 'PuzzleRush|' + timer,
      html: `PuzzleRush${timer ? ` <span class="cse-gui-hud-timer">${timer}</span>` : ''}`,
    });
  }
  if (isAutoPlayEnabled) {
    entries.push({
      key: 'AutoPlay|' + autoPlayTimer,
      html: `AutoPlay${autoPlayTimer ? ` <span class="cse-gui-hud-timer">${autoPlayTimer}</span>` : ''}`,
    });
  }
  if (isToxicChatEnabled) entries.push({ key: 'ToxicChat', html: 'ToxicChat' });
  if (isGameInsightsEnabled) {
    const s = window.CSEGameInsights?.getLiveStats?.();
    const mini = s ? ` M${s.moveCount} CPL ${s.avgCpl}` : ' live';
    entries.push({ key: 'GameInsights|' + mini, html: `GameInsights <span class="cse-gui-hud-timer">${mini}</span>` });
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

  const allMods = [
    { id: 'AutoMove', label: 'AutoMove', active: isAutomoveEnabled, hasSettings: true },
    { id: 'PuzzleRush', label: 'Puzzle Rush', active: isPuzzleRushEnabled, hasSettings: true },
    { id: 'AutoPlay', label: 'AutoPlay', active: isAutoPlayEnabled, hasSettings: true },
    { id: 'ToxicChat', label: 'Toxic Chat', active: isToxicChatEnabled, hasSettings: true },
    { id: 'GameInsights', label: 'Game Insights', active: isGameInsightsEnabled, hasSettings: false },
    { id: 'SuggestMove', label: 'SuggestMove', active: arrowsEnabled, hasSettings: true },
    { id: 'EvaluationBar', label: 'Evaluation Bar', active: isEvalBarEnabled, hasSettings: true },
    { id: 'GUI', label: 'GUI', active: isGuiHudEnabled, hasSettings: false },
  ];
  const mods = allMods.filter(m => tab === 'ALL' || (tab === 'FAVORITE' && cseGuiState.favorites[m.id]));

  modal.querySelectorAll('.cse-mc-tab').forEach(t => {
    const active = t.dataset.tab === tab;
    t.style.color = active ? '#fff' : '#666';
    t.style.borderBottom = active ? '2px solid #4a9e5c' : '2px solid transparent';
    t.style.fontWeight = active ? '600' : '400';
  });

  const grid = modal.querySelector('#cse-mc-grid');
  grid.className = 'cse-mc-grid';
  grid.innerHTML = '';

  if (tab === 'SETTINGS') {
    cseGuiState.openSettings = null;
    const ov = modal.querySelector('#cse-mc-settings-overlay');
    if (ov) {
      ov.style.display = 'none';
      ov.classList.remove('is-open', 'is-closing');
    }

    const failureFor = stockfishFailureSinceAt ? formatAgo(stockfishFailureSinceAt) : '-';
    const noFenFor = stockfishNoFenSinceAt ? formatAgo(stockfishNoFenSinceAt) : '-';
    const lastSuccess = formatAgo(stockfishLastSuccessAt);
    const lastReload = formatAgo(stockfishLastReloadAt);
    const sfStatus = stockfishFailureStreak === 0 ? 'Healthy' : 'Degraded';
    const sfStatusClass = stockfishFailureStreak === 0 ? 'cse-sf-status-ok' : 'cse-sf-status-err';
    const activeSettingsSection = cseGuiState.settingsSection || 'general';
    const isLocalProvider = stockfishProvider === 'local';
    const activeEngineId = getActiveEvalEngineId();
    const providerLabel = getActiveEvalEngineLabel(activeEngineId);
    const normalizedMaiaElo = normalizeMaiaElo(maiaElo);

    const SVG_SF    = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    const SVG_GEN   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    const SVG_APP   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`;
    const SVG_NOTIF = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
    const SVG_ABOUT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    const SVG_SFBIG = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    const SVG_RLD   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
    const SVG_PC    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2.2"/><path d="M8 20h8"/><path d="M10 16v4"/><path d="M14 16v4"/></svg>`;
    const SVG_CLOUD = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .62-7.95A6 6 0 0 0 6.1 9.5 4.5 4.5 0 0 0 7 18z"/><path d="M10 18v-4"/><path d="M14 18v-4"/></svg>`;
    const SVG_LANG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></svg>`;
    const SVG_NUM   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16"/><path d="M4 15h16"/><path d="M9 4v16"/><path d="M15 4v16"/></svg>`;
    const SVG_TRAY  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 12h8"/><path d="M9 16h6"/></svg>`;

    grid.className = 'cse-mc-settings-layout';
    grid.innerHTML = `
      <div class="cse-mc-settings-sidebar">
        <div class="cse-mc-ss-item ${activeSettingsSection === 'stockfish' ? 'cse-mc-ss-active' : ''}" data-section="stockfish">
          <div class="cse-mc-ss-icon" style="background:rgba(74,158,92,0.13);color:#4a9e5c;">${SVG_SF}</div>
          <div class="cse-mc-ss-text"><div class="cse-mc-ss-title">Engines</div><div class="cse-mc-ss-sub">Stockfish and Maia</div></div>
        </div>
        <div class="cse-mc-ss-item ${activeSettingsSection === 'general' ? 'cse-mc-ss-active' : ''}" data-section="general">
          <div class="cse-mc-ss-icon" style="background:rgba(155,155,187,0.1);color:#9b9bbb;">${SVG_GEN}</div>
          <div class="cse-mc-ss-text"><div class="cse-mc-ss-title">General</div><div class="cse-mc-ss-sub">Application settings</div></div>
        </div>
        <div class="cse-mc-ss-item ${activeSettingsSection === 'appearance' ? 'cse-mc-ss-active' : ''}" data-section="appearance">
          <div class="cse-mc-ss-icon" style="background:rgba(91,143,201,0.12);color:#5b8fc9;">${SVG_APP}</div>
          <div class="cse-mc-ss-text"><div class="cse-mc-ss-title">Appearance</div><div class="cse-mc-ss-sub">Theme and UI</div></div>
        </div>
        <div class="cse-mc-ss-item ${activeSettingsSection === 'notifications' ? 'cse-mc-ss-active' : ''}" data-section="notifications">
          <div class="cse-mc-ss-icon" style="background:rgba(201,164,74,0.12);color:#c9a44a;">${SVG_NOTIF}</div>
          <div class="cse-mc-ss-text"><div class="cse-mc-ss-title">Notifications</div><div class="cse-mc-ss-sub">Alerts and sounds</div></div>
        </div>
        <div class="cse-mc-ss-item ${activeSettingsSection === 'about' ? 'cse-mc-ss-active' : ''}" data-section="about">
          <div class="cse-mc-ss-icon" style="background:rgba(140,140,140,0.1);color:#888;">${SVG_ABOUT}</div>
          <div class="cse-mc-ss-text"><div class="cse-mc-ss-title">About</div><div class="cse-mc-ss-sub">Version and credits</div></div>
        </div>
      </div>
      <div class="cse-mc-settings-content" id="cse-settings-content">
        ${activeSettingsSection === 'stockfish' ? `
          <div class="cse-mc-sc-header">
            <div class="cse-mc-sc-icon" style="background:rgba(74,158,92,0.15);color:#4a9e5c;">${SVG_SFBIG}</div>
            <span class="cse-mc-sc-title">Engines</span>
            <span class="cse-mc-sc-badge cse-mc-sc-enabled">${providerLabel}</span>
            <div style="flex:1"></div>
            <span class="cse-mc-sc-info" title="Info">${SVG_ABOUT}</span>
          </div>
          <label class="cse-mc-sc-check-row">
            <input type="checkbox" id="cse-stockfish-auto-reload" ${stockfishAutoReloadEnabled ? 'checked' : ''} style="accent-color:#4a9e5c;width:15px;height:15px;flex-shrink:0;margin-top:1px;">
            <div>
              <div class="cse-mc-sc-check-label">Auto reload every 10s when eval is stuck</div>
              <div class="cse-mc-sc-check-sub">If Stockfish stops responding or evaluation gets stuck, it will be reloaded automatically.</div>
            </div>
          </label>
          <button class="cse-mc-sc-reload-btn" id="cse-stockfish-reload-now">
            ${SVG_RLD} Reload Stockfish now
          </button>
          <div class="cse-mc-sc-section-title">Statistics</div>
          <div class="cse-mc-sc-stats-grid">
            <div class="cse-mc-sc-stat"><div class="cse-mc-sc-stat-icon" style="background:rgba(74,158,92,0.12);color:#4a9e5c;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></div><div class="cse-mc-sc-stat-label">Failure streak</div><div class="cse-mc-sc-stat-val">${stockfishFailureStreak}</div></div>
            <div class="cse-mc-sc-stat"><div class="cse-mc-sc-stat-icon" style="background:rgba(211,84,84,0.12);color:#d35454;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="cse-mc-sc-stat-label">Failing for</div><div class="cse-mc-sc-stat-val">${failureFor}</div></div>
            <div class="cse-mc-sc-stat"><div class="cse-mc-sc-stat-icon" style="background:rgba(201,164,74,0.12);color:#c9a44a;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><div class="cse-mc-sc-stat-label">No position for</div><div class="cse-mc-sc-stat-val">${noFenFor}</div></div>
            <div class="cse-mc-sc-stat"><div class="cse-mc-sc-stat-icon" style="background:rgba(155,100,200,0.12);color:#a070d0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="cse-mc-sc-stat-label">Last eval success</div><div class="cse-mc-sc-stat-val">${lastSuccess}</div></div>
            <div class="cse-mc-sc-stat"><div class="cse-mc-sc-stat-icon" style="background:rgba(91,143,201,0.12);color:#5b8fc9;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></div><div class="cse-mc-sc-stat-label">Last reload</div><div class="cse-mc-sc-stat-val">${lastReload}</div></div>
            <div class="cse-mc-sc-stat"><div class="cse-mc-sc-stat-icon" style="background:rgba(74,158,92,0.12);color:#4a9e5c;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div class="cse-mc-sc-stat-label">Status</div><div class="cse-mc-sc-stat-val ${sfStatusClass}">${sfStatus}</div></div>
          </div>
          <div class="cse-mc-sc-section-title">Advanced</div>
          <label class="cse-mc-sc-adv-row">
            <input type="checkbox" id="cse-stockfish-clear-hash" checked style="accent-color:#4a9e5c;width:15px;height:15px;flex-shrink:0;">
            <div>
              <div class="cse-mc-sc-check-label">Clear hash on reload</div>
              <div class="cse-mc-sc-check-sub">Clears the engine hash table when Stockfish is reloaded</div>
            </div>
            <span class="cse-mc-sc-arrow">›</span>
          </label>
          <div class="cse-mc-sc-footer">${SVG_ABOUT} Changes are applied automatically.</div>
        ` : activeSettingsSection === 'general' ? `
          <div class="cse-gs-page">
            <div class="cse-gs-header">
              <div class="cse-gs-title">General</div>
              <div class="cse-gs-subtitle">Configure general application settings</div>
            </div>

            <div class="cse-gs-block">
              <div class="cse-gs-block-kicker">ENGINE PROVIDER</div>
              <div class="cse-gs-block-desc">Choose how Stockfish is used outside Maia legit mode.</div>
              <div class="cse-gs-provider-grid">
                <button class="cse-gs-provider-card ${isLocalProvider ? 'cse-gs-provider-active' : ''}" data-provider="local" type="button">
                  <span class="cse-gs-provider-radio" aria-hidden="true"></span>
                  <span class="cse-gs-provider-body">
                    <span class="cse-gs-provider-head">
                      <span class="cse-gs-provider-icon">${SVG_PC}</span>
                      <span class="cse-gs-provider-title">Local Stockfish</span>
                      <span class="cse-gs-provider-tag">Recommended</span>
                    </span>
                    <span class="cse-gs-provider-copy">Run Stockfish locally on your device.<br>No internet required.</span>
                  </span>
                </button>
                <button class="cse-gs-provider-card ${!isLocalProvider ? 'cse-gs-provider-active' : ''}" data-provider="api" type="button">
                  <span class="cse-gs-provider-radio" aria-hidden="true"></span>
                  <span class="cse-gs-provider-body">
                    <span class="cse-gs-provider-head">
                      <span class="cse-gs-provider-icon">${SVG_CLOUD}</span>
                      <span class="cse-gs-provider-title">Stockfish via API</span>
                    </span>
                    <span class="cse-gs-provider-copy">Use a remote Stockfish engine via API.<br>Requires internet connection.</span>
                  </span>
                </button>
              </div>
              <div class="cse-gs-note">
                <span class="cse-gs-note-icon">i</span>
                <span>AutoMove Legit uses Maia ${normalizedMaiaElo}; Blatant and Puzzle Rush use Stockfish.</span>
              </div>
            </div>

            <div class="cse-gs-block">
              <div class="cse-gs-block-kicker">GENERAL OPTIONS</div>
              <div class="cse-gs-row">
                <div class="cse-gs-row-left">
                  <span class="cse-gs-row-icon">${SVG_LANG}</span>
                  <span>
                    <span class="cse-gs-row-title">Language</span>
                    <span class="cse-gs-row-sub">Choose the application language.</span>
                  </span>
                </div>
                <select id="cse-general-language" class="cse-gs-select">
                  <option value="en" ${generalLanguage === 'en' ? 'selected' : ''}>English</option>
                  <option value="it" ${generalLanguage === 'it' ? 'selected' : ''}>Italiano</option>
                </select>
              </div>
              <div class="cse-gs-row">
                <div class="cse-gs-row-left">
                  <span class="cse-gs-row-icon">${SVG_NUM}</span>
                  <span>
                    <span class="cse-gs-row-title">Numbers format</span>
                    <span class="cse-gs-row-sub">Choose how numbers are formatted.</span>
                  </span>
                </div>
                <select id="cse-general-numbers" class="cse-gs-select">
                  <option value="default" ${generalNumbersFormat === 'default' ? 'selected' : ''}>Default (1,234.56)</option>
                  <option value="eu" ${generalNumbersFormat === 'eu' ? 'selected' : ''}>European (1.234,56)</option>
                </select>
              </div>
            </div>

            <div class="cse-gs-block">
              <div class="cse-gs-block-kicker">BEHAVIOR</div>
              <div class="cse-gs-row cse-gs-row-behavior">
                <div class="cse-gs-row-left">
                  <span class="cse-gs-row-icon">${SVG_TRAY}</span>
                  <span>
                    <span class="cse-gs-row-title">Minimize to tray</span>
                    <span class="cse-gs-row-sub">Close button minimizes the application to the system tray.</span>
                  </span>
                </div>
                <label class="cse-gs-switch">
                  <input type="checkbox" id="cse-general-minimize-tray" ${generalMinimizeToTray ? 'checked' : ''}>
                  <span class="cse-gs-switch-track"></span>
                  <span class="cse-gs-switch-knob"></span>
                </label>
              </div>
            </div>

            <div class="cse-gs-footer">${SVG_RLD} Changes are applied automatically.</div>
          </div>
        ` : activeSettingsSection === 'appearance' ? `
          <div class="cse-ap-page">
            <div class="cse-gs-header"><div class="cse-gs-title">Appearance</div><div class="cse-gs-subtitle">Choose the client shell and tune its visual language.</div></div>
            <div class="cse-ap-section-title">Interface theme</div>
            <div class="cse-theme-grid">
              <button class="cse-theme-card cse-theme-aurora ${uiTheme === 'aurora' ? 'is-selected' : ''}" data-ui-theme="aurora" type="button"><span class="cse-theme-mark">♞</span><strong>Maia Classic</strong><small>Original Maia Chess</small><span class="cse-theme-preview cse-preview-classic"><b></b><b></b><b></b></span><i>Modern · Emerald · Rounded</i></button>
              <button class="cse-theme-card cse-theme-blockforge ${uiTheme === 'blockforge' ? 'is-selected' : ''}" data-ui-theme="blockforge" type="button"><span class="cse-theme-mark cse-pixel-grass" aria-hidden="true"></span><strong>Blockcraft Classic</strong><small>Minecraft-style utility client</small><span class="cse-theme-preview cse-preview-blockcraft"><b></b><b></b><b></b><b></b><b></b></span><i>Pixel · Grass · Stone</i></button>
              <button class="cse-theme-card cse-theme-voidos ${uiTheme === 'voidos' ? 'is-selected' : ''}" data-ui-theme="voidos" type="button"><span class="cse-theme-mark cse-neon-chip" aria-hidden="true"></span><strong>Voidtech Neon</strong><small>Futuristic hack client</small><span class="cse-theme-preview cse-preview-voidtech"><b></b><b></b><b></b><b></b></span><i>Neon · Cyan · Angular HUD</i></button>
            </div>
            <div class="cse-ap-layout">
              <div class="cse-ap-controls">
                <div class="cse-ap-section-title">UI controls</div>
                <div class="cse-ap-row"><span><b>Accent color</b><small>Choose the interface highlight</small></span><div class="cse-ap-swatches">${['emerald','cyan','violet','rose','gold'].map(color => `<button type="button" data-ui-accent="${color}" class="${uiAccent === color ? 'is-selected' : ''}" aria-label="${color}"></button>`).join('')}</div></div>
                <div class="cse-ap-row"><span><b>Interface density</b><small>Spacing and information density</small></span><select id="cse-ui-density" class="cse-gs-select"><option value="comfortable" ${uiDensity === 'comfortable' ? 'selected' : ''}>Comfortable</option><option value="compact" ${uiDensity === 'compact' ? 'selected' : ''}>Compact</option><option value="spacious" ${uiDensity === 'spacious' ? 'selected' : ''}>Spacious</option></select></div>
                <div class="cse-ap-row"><span><b>Motion</b><small>Transitions and visual feedback</small></span><label class="cse-gs-switch"><input id="cse-ui-motion" type="checkbox" ${uiMotionEnabled ? 'checked' : ''}><span class="cse-gs-switch-track"></span><span class="cse-gs-switch-knob"></span></label></div>
              </div>
              <div class="cse-ap-preview">
                <div class="cse-ap-preview-label">Live preview</div>
                <section class="cse-ap-mini-window" aria-label="Theme preview">
                  <header><span class="cse-ap-mini-logo">♞</span><b>${uiTheme === 'blockforge' ? 'BLOCKCRAFT' : uiTheme === 'voidos' ? 'VOIDTECH' : 'MAIA CHESS'}</b><i></i><i></i><i></i></header>
                  <main><aside><span></span><span></span><span></span><span></span></aside><article><strong>Appearance</strong><small>${uiDensity} · ${uiAccent}</small><em></em><em></em><button type="button">MODULE ACTIVE</button></article></main>
                </section>
              </div>
            </div>
          </div>
        ` : activeSettingsSection === 'notifications' ? `
          <div class="cse-gs-page"><div class="cse-gs-header"><div class="cse-gs-title">Notifications</div><div class="cse-gs-subtitle">Persistent in-client alerts for important events.</div></div>
            <div class="cse-gs-block"><div class="cse-gs-block-kicker">POSITION</div>
              <div class="cse-gs-row"><div class="cse-gs-row-left"><span class="cse-gs-row-icon">⌖</span><span><span class="cse-gs-row-title">Notification position</span><span class="cse-gs-row-sub">Choose where alerts appear.</span></span></div>
                <select id="cse-notification-position" class="cse-gs-select">
                  <option value="bottom-right" ${notificationPosition === 'bottom-right' ? 'selected' : ''}>Bottom right</option>
                  <option value="bottom-left" ${notificationPosition === 'bottom-left' ? 'selected' : ''}>Bottom left</option>
                  <option value="top-right" ${notificationPosition === 'top-right' ? 'selected' : ''}>Top right</option>
                  <option value="top-left" ${notificationPosition === 'top-left' ? 'selected' : ''}>Top left</option>
                </select>
              </div>
            </div>
            <div class="cse-gs-block"><div class="cse-gs-block-kicker">EVENT MATRIX</div>${[
              ['engineReady','Engine ready','The selected analysis engine is available.'],
              ['gameFinished','Game finished','Show the final result and recap alert.'],
              ['opponentMove','Opponent move','Notify when the opponent completes a move.'],
              ['analysisWarning','Analysis warning','Highlight mistakes and blunders from Game Insights.'],
              ['moduleUpdate','Module update','Confirm when a module is enabled or disabled.']
            ].map(([key,label,copy], i) => `<div class="cse-gs-row"><div class="cse-gs-row-left"><span class="cse-gs-row-icon">${i + 1}</span><span><span class="cse-gs-row-title">${label}</span><span class="cse-gs-row-sub">${copy}</span></span></div><label class="cse-gs-switch"><input type="checkbox" data-notification-key="${key}" ${uiNotifications[key] ? 'checked' : ''}><span class="cse-gs-switch-track"></span><span class="cse-gs-switch-knob"></span></label></div>`).join('')}</div>
            <div class="cse-gs-footer">Notifications are saved automatically and appear inside Chess.com.</div></div>
        ` : activeSettingsSection === 'about' ? `
          <div class="cse-gs-page cse-about-page"><div class="cse-gs-header"><div class="cse-gs-title">About</div><div class="cse-gs-subtitle">Maia Chess utility client.</div></div><div class="cse-about-hero"><div class="cse-about-mark">♞</div><div><b>Maia Chess</b><span>Version 1.0.0 · ${uiTheme}</span><p>Analysis, automation and game insights in one configurable client.</p></div></div><div class="cse-gs-block"><div class="cse-gs-block-kicker">SYSTEM</div><div class="cse-about-meta"><span>Engine provider</span><b>${providerLabel}</b><span>Interface shell</span><b>${uiTheme}</b><span>State storage</span><b>Local</b></div></div></div>
        ` : `<div class="cse-empty-settings">No settings available for this section.</div>`}
      </div>
    `;

    grid.querySelectorAll('.cse-mc-ss-item').forEach(item => {
      item.addEventListener('click', () => {
        cseGuiState.settingsSection = item.dataset.section;
        cseRenderGui();
      });
    });

    const autoCb = grid.querySelector('#cse-stockfish-auto-reload');
    const reloadBtn = grid.querySelector('#cse-stockfish-reload-now');
    if (autoCb) {
      autoCb.addEventListener('change', () => {
        stockfishAutoReloadEnabled = !!autoCb.checked;
        cseSaveState();
        cseRenderGui();
      });
    }
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => {
        reloadStockfishConnection('manual-ui', true);
        cseSaveState();
        cseRenderGui();
      });
    }

    grid.querySelectorAll('.cse-gs-provider-card').forEach(card => {
      card.addEventListener('click', () => {
        const provider = card.dataset.provider === 'api' ? 'api' : 'local';
        if (provider === stockfishProvider) return;
        const previousProvider = stockfishProvider;
        stockfishProvider = provider;
        console.info(`[CSE] Stockfish provider switched: ${previousProvider} -> ${provider}`);
        reloadStockfishConnection('provider-change', true);
        cseSaveState();
        cseRenderGui();
      });
    });

    grid.querySelectorAll('[data-ui-theme]').forEach(card => {
      card.addEventListener('click', () => {
        uiTheme = ['aurora', 'blockforge', 'voidos'].includes(card.dataset.uiTheme) ? card.dataset.uiTheme : 'aurora';
        applyUiTheme();
        cseSaveState();
        cseRenderGui();
      });
    });
    grid.querySelectorAll('[data-ui-accent]').forEach(button => {
      button.addEventListener('click', () => {
        uiAccent = ['emerald','cyan','violet','rose','gold'].includes(button.dataset.uiAccent) ? button.dataset.uiAccent : 'emerald';
        applyUiTheme();
        cseSaveState();
        cseRenderGui();
      });
    });
    const densitySelect = grid.querySelector('#cse-ui-density');
    if (densitySelect) densitySelect.addEventListener('change', () => {
      uiDensity = ['compact','comfortable','spacious'].includes(densitySelect.value) ? densitySelect.value : 'comfortable';
      applyUiTheme(); cseSaveState(); cseRenderGui();
    });
    const motionToggle = grid.querySelector('#cse-ui-motion');
    if (motionToggle) motionToggle.addEventListener('change', () => {
      uiMotionEnabled = !!motionToggle.checked;
      applyUiTheme(); cseSaveState();
    });
    const positionSelect = grid.querySelector('#cse-notification-position');
    if (positionSelect) positionSelect.addEventListener('change', () => {
      notificationPosition = ['bottom-right','bottom-left','top-right','top-left'].includes(positionSelect.value)
        ? positionSelect.value : 'bottom-right';
      document.documentElement.dataset.cseNotificationPosition = notificationPosition;
      if (document.body) document.body.dataset.cseNotificationPosition = notificationPosition;
      const tray = document.getElementById('cse-toast-tray');
      if (tray) tray.dataset.position = notificationPosition;
      cseSaveState();
    });

    grid.querySelectorAll('[data-notification-key]').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const key = toggle.dataset.notificationKey;
        if (Object.prototype.hasOwnProperty.call(uiNotifications, key)) {
          uiNotifications[key] = !!toggle.checked;
          cseSaveState();
          if (toggle.checked) cseNotify(key, 'Notification enabled', key.replace(/([A-Z])/g, ' $1').toLowerCase(), { id: 'setting-' + key, duration: 2200 });
        }
      });
    });

    const languageSelect = grid.querySelector('#cse-general-language');
    if (languageSelect) {
      languageSelect.addEventListener('change', () => {
        generalLanguage = languageSelect.value === 'it' ? 'it' : 'en';
        cseSaveState();
      });
    }

    const numbersSelect = grid.querySelector('#cse-general-numbers');
    if (numbersSelect) {
      numbersSelect.addEventListener('change', () => {
        generalNumbersFormat = numbersSelect.value === 'eu' ? 'eu' : 'default';
        cseSaveState();
      });
    }

    const minimizeTrayCb = grid.querySelector('#cse-general-minimize-tray');
    if (minimizeTrayCb) {
      minimizeTrayCb.addEventListener('change', () => {
        generalMinimizeToTray = !!minimizeTrayCb.checked;
        cseSaveState();
      });
    }

    cseSyncAnimatedRanges(grid);
    syncGuiHudPanel();
    return;
  }

  if (mods.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:30px;text-align:center;color:#666;font-size:12px;">No modules in this category</div>';
    return;
  }

  mods.forEach(mod => {
    const isFav = cseGuiState.favorites[mod.id];
    const card = document.createElement('div');
    card.className = 'cse-mc-card';

    const iconMap = {
      AutoMove: {
        color: '#4a9e5c', bg: 'rgba(74,158,92,0.15)',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
      },
      PuzzleRush: {
        color: '#d35454', bg: 'rgba(211,84,84,0.15)',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><path d="M14 17h2a2 2 0 0 0 2-2v-1a1 1 0 0 1 1-1h1a2 2 0 0 0 0-4h-1a1 1 0 0 1-1-1v-1a2 2 0 0 0-2-2h-2v4a1 1 0 0 0 1 1h1a1 1 0 0 1 0 2h-1a1 1 0 0 0-1 1v4z"/></svg>`
      },
      AutoPlay: {
        color: '#4ac0a8', bg: 'rgba(74,192,168,0.13)',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
      },
      ToxicChat: {
        color: '#cf5a87', bg: 'rgba(207,90,135,0.14)',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>`
      },
      GameInsights: {
        color: '#6bb58b', bg: 'rgba(107,181,139,0.14)',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19h16"/><path d="M7 16l3-4 3 2 4-6"/></svg>`
      },
      SuggestMove: {
        color: '#5b8fc9', bg: 'rgba(91,143,201,0.15)',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`
      },
      EvaluationBar: {
        color: '#c9a44a', bg: 'rgba(201,164,74,0.13)',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`
      },
      CheaterFinder: {
        color: '#b58a4a', bg: 'rgba(181,138,74,0.13)',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
      },
      GUI: {
        color: '#9b9bbb', bg: 'rgba(155,155,187,0.12)',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="9" y2="9"/></svg>`
      },
    };
    const descMap = {
      AutoMove: 'Automatic best moves',
      PuzzleRush: 'Solve puzzles faster',
      AutoPlay: 'Play full games automatically',
      ToxicChat: 'Send auto chat message',
      GameInsights: 'Live move quality and recap',
      SuggestMove: 'Suggest the best moves',
      EvaluationBar: 'Show position evaluation',
      CheaterFinder: 'Detect engine assistance',
      GUI: 'Customize interface',
    };
    const icon = iconMap[mod.id] || { color: '#888', bg: 'rgba(136,136,136,0.12)', svg: '?' };
    const desc = descMap[mod.id] || '';
    const isRunning = mod.active && (mod.id === 'AutoPlay' || mod.id === 'AutoMove' || mod.id === 'PuzzleRush' || mod.id === 'ToxicChat' || mod.id === 'GameInsights');

    card.innerHTML = `
      <div class="cse-mc-card-top">
        <div class="cse-mc-icon" style="color:${icon.color};background:${icon.bg};">${icon.svg}</div>
        <div class="cse-mc-card-controls">
          <div class="cse-mc-toggle ${mod.active ? 'cse-mc-on' : ''}" data-id="${mod.id}">
            <div class="cse-mc-knob"></div>
          </div>
          ${mod.hasSettings ? `<div class="cse-mc-dots" data-id="${mod.id}" title="Settings">
            <span></span><span></span><span></span>
          </div>` : '<div class="cse-mc-dots cse-mc-dots-disabled" title="No settings"><span></span><span></span><span></span></div>'}
        </div>
      </div>
      <div class="cse-mc-card-name">${mod.label}${mod.id === 'AutoMove' && isAutomoveEnabled ? '<span class="cse-mc-timer" id="cse-mc-timer-automove"></span>' : ''}${mod.id === 'PuzzleRush' && isPuzzleRushEnabled ? '<span class="cse-mc-timer" id="cse-mc-timer-puzzlerush"></span>' : ''}${mod.id === 'AutoPlay' && isAutoPlayEnabled ? '<span class="cse-mc-timer" id="cse-mc-timer-autoplay"></span>' : ''}</div>
      <div class="cse-mc-card-desc">${desc}</div>
      ${isRunning ? '<div class="cse-mc-running"><span class="cse-mc-running-dot"></span>Running</div>' : ''}
      <div class="cse-mc-fav ${isFav ? 'cse-mc-fav-on' : ''}" data-id="${mod.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">&#9733;</div>
    `;

    card.querySelector('.cse-mc-toggle').addEventListener('click', () => {
      const wasActive = !!mod.active;
      const activateAnim = () => {
        card.classList.add('cse-mc-card-activating');
        setTimeout(() => card.classList.remove('cse-mc-card-activating'), 200);
      };
      const finalizeModuleToggle = () => {
      if (mod.id === 'AutoMove') {
        setAutomoveEnabled(!isAutomoveEnabled);
        return;
      } else if (mod.id === 'PuzzleRush') {
        isPuzzleRushEnabled = !isPuzzleRushEnabled;
        clearPuzzleRushDepthFallback();
        if (!isPuzzleRushEnabled) {
          clearAutomoveSchedule();
          if (!isAutomoveEnabled) stopAutomoveUiTicker();
        } else {
          startAutomoveUiTicker();
        }
      } else if (mod.id === 'AutoPlay') {
        isAutoPlayEnabled = !isAutoPlayEnabled;
        if (!isAutoPlayEnabled) {
          clearAutoPlaySchedule(true);
          stopAutoPlayTicker();
        } else {
          startAutoPlayTicker();
        }
      } else if (mod.id === 'ToxicChat') {
        isToxicChatEnabled = !isToxicChatEnabled;
        if (!isToxicChatEnabled) {
          stopToxicChatTicker();
          clearToxicChatState();
        } else {
          startToxicChatTicker();
        }
      } else if (mod.id === 'GameInsights') {
        isGameInsightsEnabled = !isGameInsightsEnabled;
        window.CSEGameInsights?.setEnabled?.(isGameInsightsEnabled);
        window.CSEGameInsights?.handleGameTransition?.(getToxicChatGameToken());
      } else if (mod.id === 'SuggestMove') {
        setSuggestMoveEnabled(!arrowsEnabled);
        return;
      } else if (mod.id === 'EvaluationBar') {
        isEvalBarEnabled = !isEvalBarEnabled;
        if (isEvalBarEnabled) createEvaluationBarPanel();
        else removeEvaluationBarPanel();
      } else if (mod.id === 'GUI') {
        isGuiHudEnabled = !isGuiHudEnabled;
        syncGuiHudPanel();
      }

      ensureEvalEngineState(true);
      if (isAutomoveEnabled || isPuzzleRushEnabled) performAutomove();
      updateAutomoveButtonState();
      syncGuiHudPanel();
      cseSaveState();
      cseNotify('moduleUpdate', mod.label + (mod.active ? ' disabled' : ' enabled'), 'Module state updated', { id: 'module-' + mod.id });
      cseRenderGui();
      };
      if (!wasActive) {
        activateAnim();
        setTimeout(finalizeModuleToggle, 120);
      } else {
        finalizeModuleToggle();
      }
    });

    const dots = card.querySelector('.cse-mc-dots');
    if (mod.hasSettings && dots) {
      dots.addEventListener('click', e => {
        e.stopPropagation();
        cseGuiState.openSettings = mod.id;
        cseRenderSettingsPanel(mod.id);
      });
    }

    const favBtn = card.querySelector('.cse-mc-fav');
    favBtn.addEventListener('click', e => {
      e.stopPropagation();
      const willBeFavorite = !cseGuiState.favorites[mod.id];
      favBtn.style.pointerEvents = 'none';
      favBtn.classList.remove('cse-fav-anim-add', 'cse-fav-anim-remove');
      void favBtn.offsetWidth;
      favBtn.classList.add(willBeFavorite ? 'cse-fav-anim-add' : 'cse-fav-anim-remove');
      setTimeout(() => {
        cseGuiState.favorites[mod.id] = willBeFavorite;
        cseSaveState();
        cseRenderGui();
      }, 260);
    });

    grid.appendChild(card);
  });

  updateAutomoveButtonState();

  if (cseGuiState.openSettings && !mods.find(m => m.id === cseGuiState.openSettings)) {
    cseGuiState.openSettings = null;
    const ov = modal.querySelector('#cse-mc-settings-overlay');
    if (ov) {
      ov.style.display = 'none';
      ov.classList.remove('is-open', 'is-closing');
    }
  }
  syncGuiHudPanel();
}

function refreshGuiIfOpen() {
  if (toolsModal?.isConnected) cseRenderGui();
}

function setAutomoveEnabled(enabled) {
  const next = !!enabled;
  if (isAutomoveEnabled === next) return;
  isAutomoveEnabled = next;
  if (!isAutomoveEnabled) {
    clearAutomoveSchedule();
    clearPremoveSchedule();
    if (!isPuzzleRushEnabled) stopAutomoveUiTicker();
  } else {
    startAutomoveUiTicker();
    if (automoveMode === 'legit') ensureLocalMaiaEngine().catch(() => {});
  }
  ensureEvalEngineState(true);
  if (isAutomoveEnabled || isPuzzleRushEnabled) performAutomove();
  updateAutomoveButtonState();
  syncGuiHudPanel();
  cseSaveState();
  refreshGuiIfOpen();
}

function setSuggestMoveEnabled(enabled) {
  const next = !!enabled;
  if (arrowsEnabled === next) return;
  arrowsEnabled = next;
  if (!arrowsEnabled) hideBestMoveOverlay();
  ensureEvalEngineState(true);
  if (isAutomoveEnabled || isPuzzleRushEnabled) performAutomove();
  updateAutomoveButtonState();
  syncGuiHudPanel();
  cseSaveState();
  refreshGuiIfOpen();
}

function isEditableTarget(el) {
  if (!el || !(el instanceof Element)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function installModuleHotkeys() {
  document.addEventListener('keydown', e => {
    if (e.repeat || isEditableTarget(e.target)) return;
    if (automoveToggleHotkey !== 'none' && e.code === automoveToggleHotkey) {
      e.preventDefault();
      setAutomoveEnabled(!isAutomoveEnabled);
      return;
    }
    if (suggestMoveToggleHotkey !== 'none' && e.code === suggestMoveToggleHotkey) {
      e.preventDefault();
      setSuggestMoveEnabled(!arrowsEnabled);
    }
  });
}

function bindHotkeyCapture(overlayEl, inputId, onChange) {
  const input = overlayEl.querySelector(`#${inputId}`);
  if (!input) return;
  let armed = false;

  const setDisplay = code => {
    input.value = code === 'none' ? 'None' : formatHotkeyLabel(code);
    input.dataset.hotkey = code;
  };

  input.addEventListener('click', () => {
    armed = true;
    input.value = 'Press a key... (Esc = None)';
    input.focus();
  });

  input.addEventListener('keydown', e => {
    if (!armed) return;
    e.preventDefault();
    e.stopPropagation();
    let code = e.code || 'none';
    if (code === 'Escape') code = 'none';
    if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'ControlLeft' || code === 'ControlRight' || code === 'AltLeft' || code === 'AltRight' || code === 'MetaLeft' || code === 'MetaRight') return;
    code = normalizeModuleHotkey(code);
    onChange(code);
    setDisplay(code);
    armed = false;
    input.blur();
  });

  input.addEventListener('blur', () => {
    armed = false;
    const current = normalizeModuleHotkey(input.dataset.hotkey || 'none');
    setDisplay(current);
  });
}

function cseRenderSettingsPanel(modId) {
  const modal = document.getElementById('cse-mc-gui');
  if (!modal) return;
  const ov = modal.querySelector('#cse-mc-settings-overlay');
  if (!ov) return;
  ov.style.display = 'block';
  ov.classList.remove('is-closing');
  ov.classList.remove('is-open');
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (!ov.isConnected || ov.style.display === 'none') return;
      ov.classList.add('is-open');
    });
  });

  const isAuto = modId === 'AutoMove';
  const isPuzzleRush = modId === 'PuzzleRush';
  const isAutoPlay = modId === 'AutoPlay';
  const isToxicChat = modId === 'ToxicChat';
  const isEvalBar = modId === 'EvaluationBar';
  const isDepth = modId === 'SuggestMove';
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
          <div class="cse-mc-slabel-row"><span class="cse-mc-slabel">Maia strength</span><span class="cse-mc-sval" id="cse-sp-maia-elo-val">${normalizeMaiaElo(maiaElo)}</span></div>
          <input type="range" class="cse-mc-slider" id="cse-sp-maia-elo" min="${MAIA_ELO_MIN}" max="${MAIA_ELO_MAX}" step="${MAIA_ELO_STEP}" value="${normalizeMaiaElo(maiaElo)}">
        </div>
        <div class="cse-mc-srow">
          <div class="cse-mc-slabel-row"><span class="cse-mc-slabel">Delay min</span><span class="cse-mc-sval" id="cse-sp-dmin-val">${automoveDelayMin}s</span></div>
          <input type="range" class="cse-mc-slider" id="cse-sp-dmin" min="0" max="15" step="1" value="${automoveDelayMin}">
        </div>
        <div class="cse-mc-srow">
          <div class="cse-mc-slabel-row"><span class="cse-mc-slabel">Delay max</span><span class="cse-mc-sval" id="cse-sp-dmax-val">${automoveDelayMax}s</span></div>
          <input type="range" class="cse-mc-slider" id="cse-sp-dmax" min="0" max="15" step="1" value="${automoveDelayMax}">
        </div>
        <div class="cse-mc-srow cse-mc-check-row">
          <label class="cse-mc-check">
            <input type="checkbox" id="cse-sp-fast-lowtime" ${automoveFastWhenLowTime ? 'checked' : ''}>
            <span>Fast under 30s</span>
          </label>
        </div>
        <div class="cse-mc-srow cse-mc-check-row">
          <label class="cse-mc-check">
            <input type="checkbox" id="cse-sp-fast-opening" ${automoveFastInOpening ? 'checked' : ''}>
            <span>Fast in opening (first 8 moves)</span>
          </label>
        </div>
        <div class="cse-mc-srow cse-mc-check-row">
          <label class="cse-mc-check">
            <input type="checkbox" id="cse-sp-smart-premoves" ${automoveUseSmartPremoves ? 'checked' : ''}>
            <span>Smart premoves</span>
          </label>
        </div>
        <div class="cse-mc-srow">
          <span class="cse-mc-slabel">Toggle hotkey</span>
          <input type="text" class="cse-mc-hotkey-input" id="cse-sp-automove-hotkey" value="${escapeHtmlAttr(formatHotkeyLabel(automoveToggleHotkey))}" data-hotkey="${escapeHtmlAttr(automoveToggleHotkey)}" readonly>
        </div>
      ` : isPuzzleRush ? `
        <div class="cse-mc-srow">
          <div class="cse-mc-slabel-row"><span class="cse-mc-slabel">Depth</span><span class="cse-mc-sval" id="cse-sp-pr-depth-val">${puzzleRushDepth}</span></div>
          <input type="range" class="cse-mc-slider" id="cse-sp-pr-depth" min="1" max="15" step="1" value="${puzzleRushDepth}">
        </div>
        <div class="cse-mc-srow">
          <span class="cse-mc-slabel">Turbo mode for puzzles only.</span>
        </div>
      ` : isAutoPlay ? `
        <div class="cse-mc-srow cse-mc-check-row">
          <label class="cse-mc-check">
            <input type="checkbox" id="cse-sp-autoplay-rematch" ${autoPlayAcceptRematch ? 'checked' : ''}>
            <span>Accept rematches if requested</span>
          </label>
        </div>
      ` : isToxicChat ? `
        <div class="cse-mc-srow">
          <span class="cse-mc-slabel">Message</span>
          <input type="text" class="cse-mc-slider" id="cse-sp-toxic-message" value="${escapeHtmlAttr(toxicChatMessage)}" style="height:34px;padding:0 10px;border-radius:8px;outline:none;">
        </div>
        <div class="cse-mc-srow cse-mc-check-row">
          <label class="cse-mc-check">
            <input type="checkbox" id="cse-sp-toxic-start" ${toxicChatSendOnStart ? 'checked' : ''}>
            <span>Send at game start</span>
          </label>
        </div>
        <div class="cse-mc-srow cse-mc-check-row">
          <label class="cse-mc-check">
            <input type="checkbox" id="cse-sp-toxic-end" ${toxicChatSendOnEnd ? 'checked' : ''}>
            <span>Send at game end</span>
          </label>
        </div>
      ` : isEvalBar ? `
        <div class="cse-mc-srow">
          <div class="cse-mc-slabel-row"><span class="cse-mc-slabel">Depth</span><span class="cse-mc-sval" id="cse-sp-depth-val">${suggestMoveDepth}</span></div>
          <input type="range" class="cse-mc-slider" id="cse-sp-depth" min="1" max="15" step="1" value="${suggestMoveDepth}">
        </div>
        <div class="cse-mc-srow cse-mc-check-row">
          <label class="cse-mc-check">
            <input type="checkbox" id="cse-sp-eval-percent" ${evalBarDisplayMode === 'percent' ? 'checked' : ''} style="accent-color:#4a9e5c;width:15px;height:15px;flex-shrink:0;margin-top:1px;">
            <span>Compact numeric evaluation</span>
          </label>
        </div>
      ` : isDepth ? `
        <div class="cse-mc-srow">
          <div class="cse-mc-slabel-row"><span class="cse-mc-slabel">Depth</span><span class="cse-mc-sval" id="cse-sp-depth-val">${suggestMoveDepth}</span></div>
          <input type="range" class="cse-mc-slider" id="cse-sp-depth" min="1" max="15" step="1" value="${suggestMoveDepth}">
        </div>
        <div class="cse-mc-srow">
          <span class="cse-mc-slabel">Toggle hotkey</span>
          <input type="text" class="cse-mc-hotkey-input" id="cse-sp-suggest-hotkey" value="${escapeHtmlAttr(formatHotkeyLabel(suggestMoveToggleHotkey))}" data-hotkey="${escapeHtmlAttr(suggestMoveToggleHotkey)}" readonly>
        </div>
      ` : `
        <div class="cse-mc-srow">
          <span class="cse-mc-slabel">No settings for this module.</span>
        </div>
      `}
    </div>
  `;
  cseSyncAnimatedRanges(ov);

  const closeSettingsPanel = () => {
    ov.classList.remove('is-open');
    ov.classList.add('is-closing');
    cseGuiState.openSettings = null;
    window.setTimeout(() => {
      ov.style.display = 'none';
      ov.classList.remove('is-closing');
    }, 240);
  };

  ov.querySelector('#cse-mc-sp-close').addEventListener('click', closeSettingsPanel);
  ov.addEventListener('mousedown', e => {
    if (e.target === ov) {
      closeSettingsPanel();
    }
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
        evalCache.clear();
        lastEvalFen = null;
        lastEvalMoveSourceFen = null;
        currentBestMove = null;
        lastEvalTopMoves = [];
        lastEvalPvLines = [];
        lastEvalMate = null;
        cseSaveState();
        updateAutomoveModeUI();
        if (isAutomoveEnabled && automoveMode === 'legit') ensureLocalMaiaEngine().catch(() => {});
        ensureEvalEngineState(true);
      });
    });

    const maiaEloSl = ov.querySelector('#cse-sp-maia-elo');
    if (maiaEloSl) {
      maiaEloSl.addEventListener('input', () => {
        const nextElo = normalizeMaiaElo(parseInt(maiaEloSl.value, 10));
        maiaElo = nextElo;
        maiaEloSl.value = String(nextElo);
        ov.querySelector('#cse-sp-maia-elo-val').textContent = String(nextElo);
        releaseLocalMaiaEngine();
        evalCache.clear();
        lastEvalFen = null;
        lastEvalMoveSourceFen = null;
        currentBestMove = null;
        lastEvalTopMoves = [];
        lastEvalPvLines = [];
        lastEvalMate = null;
        cseSaveState();
        ensureEvalEngineState(true);
      });
    }

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

    const lowtimeCb = ov.querySelector('#cse-sp-fast-lowtime');
    const openingCb = ov.querySelector('#cse-sp-fast-opening');
    const premoveCb = ov.querySelector('#cse-sp-smart-premoves');
    if (lowtimeCb) {
      lowtimeCb.addEventListener('change', () => {
        automoveFastWhenLowTime = !!lowtimeCb.checked;
        cseSaveState();
      });
    }
    if (openingCb) {
      openingCb.addEventListener('change', () => {
        automoveFastInOpening = !!openingCb.checked;
        cseSaveState();
      });
    }
    if (premoveCb) {
      premoveCb.addEventListener('change', () => {
        automoveUseSmartPremoves = !!premoveCb.checked;
        if (!automoveUseSmartPremoves) clearPremoveSchedule();
        cseSaveState();
      });
    }
    bindHotkeyCapture(ov, 'cse-sp-automove-hotkey', code => {
      automoveToggleHotkey = code;
      cseSaveState();
    });
  } else if (isPuzzleRush) {
    const prDepth = ov.querySelector('#cse-sp-pr-depth');
    if (!prDepth) return;
    prDepth.addEventListener('input', () => {
      puzzleRushDepth = parseInt(prDepth.value, 10);
      ov.querySelector('#cse-sp-pr-depth-val').textContent = puzzleRushDepth;
      clearPuzzleRushDepthFallback();
      evalCache.clear();
      lastEvalFen = null;
      lastEvalPvLines = [];
      lastEvalMate = null;
      cseSaveState();
      ensureEvalEngineState(true);
    });
  } else if (isAutoPlay) {
    const rematchCb = ov.querySelector('#cse-sp-autoplay-rematch');
    if (!rematchCb) return;
    rematchCb.addEventListener('change', () => {
      autoPlayAcceptRematch = !!rematchCb.checked;
      autoPlayHandledToken = null;
      cseSaveState();
      if (isAutoPlayEnabled) performAutoPlayTick();
    });
  } else if (isToxicChat) {
    const messageInput = ov.querySelector('#cse-sp-toxic-message');
    const startCb = ov.querySelector('#cse-sp-toxic-start');
    const endCb = ov.querySelector('#cse-sp-toxic-end');
    if (messageInput) {
      messageInput.addEventListener('input', () => {
        toxicChatMessage = String(messageInput.value || '').slice(0, 240);
        cseSaveState();
      });
    }
    if (startCb) {
      startCb.addEventListener('change', () => {
        toxicChatSendOnStart = !!startCb.checked;
        cseSaveState();
      });
    }
    if (endCb) {
      endCb.addEventListener('change', () => {
        toxicChatSendOnEnd = !!endCb.checked;
        cseSaveState();
      });
    }
  } else if (isEvalBar) {
    const depSl = ov.querySelector('#cse-sp-depth');
    if (depSl) {
      depSl.addEventListener('input', () => {
        suggestMoveDepth = parseInt(depSl.value, 10);
        ov.querySelector('#cse-sp-depth-val').textContent = suggestMoveDepth;
        evalCache.clear();
        lastEvalFen = null;
        lastEvalPvLines = [];
        lastEvalMate = null;
        cseSaveState();
        ensureEvalEngineState(true);
      });
    }
    const percentCb = ov.querySelector('#cse-sp-eval-percent');
    if (percentCb) {
      percentCb.addEventListener('change', () => {
        evalBarDisplayMode = percentCb.checked ? 'percent' : 'bar';
        applyEvalBarDisplayMode();
        cseSaveState();
      });
    }
  } else if (isDepth) {
    const depSl = ov.querySelector('#cse-sp-depth');
    if (depSl) {
      depSl.addEventListener('input', () => {
        suggestMoveDepth = parseInt(depSl.value, 10);
        ov.querySelector('#cse-sp-depth-val').textContent = suggestMoveDepth;
        evalCache.clear();
        lastEvalFen = null;
        lastEvalPvLines = [];
        lastEvalMate = null;
        cseSaveState();
        ensureEvalEngineState(true);
      });
    }
    bindHotkeyCapture(ov, 'cse-sp-suggest-hotkey', code => {
      suggestMoveToggleHotkey = code;
      cseSaveState();
    });
  }
}

function applyEvalBarDisplayMode(bar) {
  if (!bar) bar = evalBarPanel;
  if (!bar) return;
  const inner = bar.querySelector('.cse-eval-inner');
  const label = bar.querySelector('.cse-eval-label');
  if (evalBarDisplayMode === 'percent') {
    bar.classList.add('cse-eval-mode-percent');
    if (inner) inner.style.display = 'none';
    if (label) label.style.display = 'none';
  } else {
    bar.classList.remove('cse-eval-mode-percent');
    if (inner) inner.style.display = '';
    if (label) label.style.display = '';
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
  applyEvalBarDisplayMode(bar);

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
  modal.dataset.cseTheme = uiTheme;
  const SVG_ALL = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="5.5" height="5.5" rx="1.2" fill="currentColor"/><rect x="7.5" y="0" width="5.5" height="5.5" rx="1.2" fill="currentColor"/><rect x="0" y="7.5" width="5.5" height="5.5" rx="1.2" fill="currentColor"/><rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1.2" fill="currentColor"/></svg>`;
  const SVG_FAV = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const SVG_SETTINGS = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="2"/></svg>`;

  modal.innerHTML = `
    <div class="cse-mc-header" id="cse-mc-drag">
      <div class="cse-mc-tabs">
        <button class="cse-mc-tab" data-tab="ALL" style="color:#fff;border-bottom:2px solid #4a9e5c;">${SVG_ALL} ALL</button>
        <button class="cse-mc-tab" data-tab="FAVORITE" style="color:#555;border-bottom:2px solid transparent;">${SVG_FAV} FAVORITE</button>
        <button class="cse-mc-tab" data-tab="SETTINGS" style="color:#555;border-bottom:2px solid transparent;">${SVG_SETTINGS} SETTINGS</button>
      </div>
      <button class="cse-mc-close-btn" id="cse-mc-close">&#10005;</button>
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
    if (e.target.closest('.cse-mc-tab')) return;
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
  cseSyncAnimatedRanges(modal);

  if (guiRefreshInterval) clearInterval(guiRefreshInterval);
  guiRefreshInterval = setInterval(() => {
    if (!toolsModal?.isConnected) return;
    updateAutomoveButtonState();
  }, 100);

  return modal;
}

function closeToolsGui() {
  if (toolsModal) {
    const modalToClose = toolsModal;
    toolsModal = null;
    modalToClose.classList.add('cse-mc-gui-closing');
    setTimeout(() => {
      if (modalToClose?.isConnected) modalToClose.remove();
    }, 180);
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
    if (!stockfishNoFenSinceAt) stockfishNoFenSinceAt = now();
    clearPuzzleRushDepthFallback();
    evalRequestSeq++;
    lastEvalFen = null;
    lastEvalMoveSourceFen = null;
    lastGameInsightsFen = null;
    currentBestMove = null;
    lastEvalTopMoves = [];
    lastEvalPvLines = [];
    lastEvalMate = null;
    if (evalBarPanel?.isConnected) {
      const scoreEl = evalBarPanel.querySelector('[data-cse-part="score"]');
      if (scoreEl) scoreEl.textContent = '?';
      evalBarPanel.title = 'Posizione non trovata sulla board';
    }
    hideBestMoveOverlay();
    clearAutomoveSchedule();
    clearPremoveSchedule();
    maybeAutoReloadStockfish();
    return;
  }
  stockfishNoFenSinceAt = 0;

  const fallbackDepthActivated = updatePuzzleRushDepthFallback(fen);

  const sameBoardTurnFen = !!(lastEvalFen && isSameFenBoardAndTurn(fen, lastEvalFen));
  if (sameBoardTurnFen && !fallbackDepthActivated) {
    const hasEvalMoveForFen = !!(
      lastEvalMoveSourceFen &&
      lastEvalFen &&
      isSameFenBoardAndTurn(lastEvalMoveSourceFen, lastEvalFen) &&
      extractUciMove(currentBestMove)
    );
    if (arrowsEnabled) syncBestMoveOverlay();
    else hideBestMoveOverlay();
    if (hasEvalMoveForFen && (isAutomoveEnabled || isPuzzleRushEnabled)) performAutomove();
    maybeAutoReloadStockfish();
    return;
  }

  if (fallbackDepthActivated) {
    lastEvalMoveSourceFen = null;
    currentBestMove = null;
    lastEvalTopMoves = [];
    lastEvalPvLines = [];
    lastEvalMate = null;
  }

  const prevFen = lastEvalMoveSourceFen;
  const insightPrevFen = lastGameInsightsFen;
  lastGameInsightsFen = fen;
  lastEvalFen = fen;
  const requestSeq = ++evalRequestSeq;
  const positionPly = getReliablePlyCount();

  if (insightPrevFen && insightPrevFen !== fen) {
    // Show an immediate marker while the engine evaluates the new position.
    window.CSEGameInsights?.handlePositionChange?.({
      fenBefore: insightPrevFen,
      fenAfter: fen,
      ply: positionPly,
    });
    const notificationBoard = getBoardElement();
    const notificationSide = getPlayerSide(notificationBoard);
    const notificationTurn = normalizeTurn(fen.split(' ')[1]);
    if (notificationSide && notificationTurn === notificationSide) {
      cseNotify('opponentMove', 'Opponent moved', 'Your turn', { id: 'opponent-move-' + positionPly, cooldown: 250 });
    }
  }

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
  const gameOverVisible = isGameOverVisible();
  window.CSEGameInsights?.handleEval?.({
    fen,
    ply: positionPly,
    cp: result && Number.isFinite(result.cp) ? result.cp : null,
    mate: result && Number.isFinite(result.mate) ? result.mate : null,
    bestMove: result?.bestMove || null,
    topMoves: Array.isArray(result?.topMoves) ? result.topMoves.slice(0, 4) : [],
    gameOver: gameOverVisible,
  });
  if (gameOverVisible) {
    cseNotify('gameFinished', 'Game finished', 'Open Game Insights for the recap', { id: 'game-finished-' + getToxicChatGameToken(), cooldown: 60000, duration: 5200 });
  }
  if (prevFen && prevFen !== fen) {
    window.CSEGameInsights?.handleMove?.({
      uci: null,
      san: null,
      fenBefore: prevFen,
      fenAfter: fen,
      ply: positionPly,
    });
  }
  if (!result) {
    // Eval transient error (API down/timeout/404 cache miss): retry same FEN on next tick.
    // Resetting lastEvalFen here avoids getting stuck on "?" forever for a position.
    lastEvalFen = null;
    if (!arrowsEnabled) hideBestMoveOverlay();
    maybeAutoReloadStockfish();
    return;
  }
  if (!arrowsEnabled) hideBestMoveOverlay();
  if (isAutomoveEnabled || isPuzzleRushEnabled) performAutomove();
  maybeAutoReloadStockfish();
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

// â”€â”€â”€ Inject Buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ Observer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

const observer = new MutationObserver(() => {
  try {
    window.CSEStatsCheater?.scanAndInject?.();
    window.CSEEvalTools?.scanAndInjectEval?.();
    syncBestMoveOverlay();
    if (isGuiHudEnabled && (!guiHudPanel || !guiHudPanel.isConnected)) syncGuiHudPanel();
  } catch (err) {
    console.error('[CSE] observer tick failed', err);
  }
});
observer.observe(document.body, { childList: true, subtree: true });
applySavedGuiAndModuleState();
applyUiTheme();
installModuleHotkeys();
window.CSEGameInsights?.init?.();
window.CSEGameInsights?.setEnabled?.(isGameInsightsEnabled);
window.CSEGameInsights?.handleGameTransition?.(getToxicChatGameToken());
if (isEvalBarEnabled) createEvaluationBarPanel();
if (isAutomoveEnabled || isPuzzleRushEnabled) startAutomoveUiTicker();
if (isAutoPlayEnabled) startAutoPlayTicker();
if (isToxicChatEnabled) startToxicChatTicker();
syncGuiHudPanel();
if (isAutomoveEnabled && automoveMode === 'legit') ensureLocalMaiaEngine().catch(() => {});
ensureEvalEngineState(true);
cseSaveState();
window.CSEStatsCheater?.scanAndInject?.();
window.CSEEvalTools?.scanAndInjectEval?.();

// Re-scan on navigation (SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    playerSideCache = { side: null, ts: 0 };
    lastLoggedPlayerSide = null;
    lastEvalFen = null;
    lastGameInsightsFen = null;
    currentBestMove = null;
    lastEvalTopMoves = [];
    lastEvalPvLines = [];
    lastEvalMate = null;
    lastEvalMoveSourceFen = null;
    clearPremoveSchedule();
    clearAutoPlaySchedule(true);
    clearToxicChatState();
    window.CSEGameInsights?.handleGameTransition?.(getToxicChatGameToken());
    window.CSEAutoModules?.onUrlChanged?.();
    if (isAutoPlayEnabled) performAutoPlayTick();
    if (isToxicChatEnabled) performToxicChatTick();
    setTimeout(() => window.CSEStatsCheater?.scanAndInject?.(), 1000);
  }
}).observe(document, { subtree: true, childList: true });
