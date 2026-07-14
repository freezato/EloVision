(function () {
  'use strict';

  const QUALITY = Object.freeze({
    brilliant: { label: 'Brilliant', icon: '!!' },
    great: { label: 'Great', icon: '!' },
    best: { label: 'Best', icon: '★' },
    good: { label: 'Good', icon: '✓' },
    ok: { label: 'OK', icon: '·' },
    inaccuracy: { label: 'Inaccuracy', icon: '?!' },
    mistake: { label: 'Mistake', icon: '?' },
    blunder: { label: 'Blunder', icon: '??' },
    pending: { label: 'Analysing', icon: '…' },
  });
  const MAX_EVALS = 48;
  const MAX_BADGES = 48;

  const state = {
    enabled: false,
    liveUiEnabled: true,
    gameToken: null,
    playerSide: null,
    records: [],
    recapShownForToken: null,
    evalByFen: new Map(),
    analysedMoveKeys: new Set(),
    badgeByPly: new Map(),
    pendingMoves: new Map(),
    lastObservedPly: null,
    syncFrame: 0,
    retryTimers: new Set(),
    stats: createEmptyStats(),
  };

  function createEmptyStats() {
    return {
      moveCount: 0, avgCpl: 0, totalCpl: 0,
      brilliant: 0, great: 0, best: 0, good: 0, ok: 0,
      inaccuracy: 0, mistake: 0, blunder: 0, tacticalFlags: 0,
      phase: { opening: 0, middlegame: 0, endgame: 0 },
      lastMove: null,
    };
  }

  function trimMap(map, max) {
    while (map.size > max) map.delete(map.keys().next().value);
  }

  function normalizeTurn(value) {
    const t = String(value || '').trim().toLowerCase();
    return t === 'w' || t === 'white' ? 'w' : t === 'b' || t === 'black' ? 'b' : null;
  }

  function getFenTurn(fen) {
    return typeof fen === 'string' ? normalizeTurn(fen.trim().split(/\s+/)[1]) : null;
  }

  function boardPart(fen) {
    return typeof fen === 'string' ? fen.trim().split(/\s+/)[0] || '' : '';
  }

  function expandBoard(fen) {
    const ranks = boardPart(fen).split('/');
    if (ranks.length !== 8) return null;
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let row = 0; row < 8; row++) {
      let col = 0;
      for (const ch of ranks[row]) {
        if (/^[1-8]$/.test(ch)) col += Number(ch);
        else if (/^[prnbqkPRNBQK]$/.test(ch) && col < 8) board[row][col++] = ch;
        else return null;
      }
      if (col !== 8) return null;
    }
    return board;
  }

  function squareAt(row, col) {
    return String.fromCharCode(97 + col) + String(8 - row);
  }

  function inferUciFromFens(beforeFen, afterFen) {
    const before = expandBoard(beforeFen);
    const after = expandBoard(afterFen);
    const mover = getFenTurn(beforeFen);
    if (!before || !after || !mover) return null;
    const own = piece => piece && (mover === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase());
    const changes = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (before[row][col] !== after[row][col]) changes.push({ row, col, before: before[row][col], after: after[row][col] });
      }
    }
    const from = changes.find(c => own(c.before) && !own(c.after));
    const to = changes.find(c => own(c.after) && (!own(c.before) || c.before !== c.after));
    if (!from || !to) return null;
    const promotion = String(from.before).toLowerCase() === 'p' && String(to.after).toLowerCase() !== 'p'
      ? String(to.after).toLowerCase() : '';
    return squareAt(from.row, from.col) + squareAt(to.row, to.col) + promotion;
  }

  function materialValue(piece) {
    return ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 })[String(piece || '').toLowerCase()] || 0;
  }

  function materialFor(fen, color) {
    return Array.from(boardPart(fen)).reduce((sum, piece) => {
      const belongs = color === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
      return belongs ? sum + materialValue(piece) : sum;
    }, 0);
  }

  function phaseFromFen(fen, ply) {
    const board = boardPart(fen);
    if (!board) return Number.isFinite(ply) && ply <= 16 ? 'opening' : 'middlegame';
    const heavy = (board.match(/[qQrR]/g) || []).length;
    const minors = (board.match(/[bBnN]/g) || []).length;
    if (heavy >= 7 || minors >= 8 || (Number.isFinite(ply) && ply <= 16)) return 'opening';
    return heavy <= 2 && minors <= 3 ? 'endgame' : 'middlegame';
  }

  function evaluationLoss(before, after, mover) {
    if (Number.isFinite(before.cp) && Number.isFinite(after.cp)) {
      return mover === 'w' ? Math.max(0, before.cp - after.cp) : Math.max(0, after.cp - before.cp);
    }
    if (Number.isFinite(before.mate) || Number.isFinite(after.mate)) {
      const a = Number.isFinite(before.mate) ? (mover === 'w' ? before.mate : -before.mate) : 0;
      const b = Number.isFinite(after.mate) ? (mover === 'w' ? after.mate : -after.mate) : 0;
      return Math.max(0, a - b) * 1000;
    }
    return null;
  }

  function classifyMove({ cpl, uci, bestMove, beforeFen, afterFen, mover }) {
    if (!Number.isFinite(cpl)) return null;
    const playedBest = !!uci && !!bestMove && uci === bestMove;
    const sacrificed = materialFor(afterFen, mover) <= materialFor(beforeFen, mover) - 2;
    if (playedBest && sacrificed && cpl <= 15) return 'brilliant';
    if (playedBest) return 'best';
    if (cpl <= 8) return 'great';
    if (cpl <= 25) return 'good';
    if (cpl <= 55) return 'ok';
    if (cpl <= 110) return 'inaccuracy';
    if (cpl <= 220) return 'mistake';
    return 'blunder';
  }

  function reset() {
    state.evalByFen.clear();
    state.analysedMoveKeys.clear();
    state.badgeByPly.clear();
    state.pendingMoves.clear();
    state.records = [];
    state.playerSide = null;
    state.lastObservedPly = null;
    state.stats = createEmptyStats();
    if (state.syncFrame) cancelAnimationFrame(state.syncFrame);
    state.syncFrame = 0;
    state.retryTimers.forEach(timer => clearTimeout(timer));
    state.retryTimers.clear();
    document.querySelectorAll('.cse-move-quality').forEach(el => el.remove());
    removeRecap();
  }

  function setEnabled(enabled) {
    state.enabled = !!enabled;
    if (!state.enabled) reset();
    else if (state.liveUiEnabled) scheduleBadgeSync();
  }

  function setLiveUiEnabled(enabled) {
    state.liveUiEnabled = !!enabled;
    if (!state.liveUiEnabled) {
      document.querySelectorAll('.cse-move-quality').forEach(el => el.remove());
      removeRecap();
      return;
    }
    if (state.enabled) scheduleBadgeSync();
  }

  function handleGameTransition(token) {
    const safeToken = token ? String(token) : null;
    if (safeToken === state.gameToken) return;
    state.gameToken = safeToken;
    state.recapShownForToken = null;
    reset();
  }

  function handleEval(snapshot) {
    if (!state.enabled || !snapshot || typeof snapshot !== 'object') return;
    const side = normalizeTurn(snapshot.playerSide);
    if (side) state.playerSide = side;
    if (Number.isFinite(snapshot.ply)) {
      if (Number.isFinite(state.lastObservedPly) && snapshot.ply + 1 < state.lastObservedPly) reset();
      state.lastObservedPly = snapshot.ply;
    }
    if (typeof snapshot.fen === 'string' && snapshot.fen && (Number.isFinite(snapshot.cp) || Number.isFinite(snapshot.mate))) {
      state.evalByFen.set(snapshot.fen, {
        cp: Number.isFinite(snapshot.cp) ? snapshot.cp : null,
        mate: Number.isFinite(snapshot.mate) ? snapshot.mate : null,
        bestMove: typeof snapshot.bestMove === 'string' ? snapshot.bestMove.toLowerCase() : null,
        topMoves: Array.isArray(snapshot.topMoves)
          ? snapshot.topMoves.map(move => String(move || '').toLowerCase()).filter(Boolean).slice(0, 4)
          : [],
      });
      trimMap(state.evalByFen, MAX_EVALS);
      flushPendingMoves();
    }
    if (state.liveUiEnabled) scheduleBadgeSync();
    if (snapshot.gameOver && state.gameToken && state.recapShownForToken !== state.gameToken) {
      state.recapShownForToken = state.gameToken;
      if (state.liveUiEnabled) setTimeout(showRecap, 0);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('cse-game-review-ready', {
          detail: getReviewData(),
        }));
      }, 80);
    }
  }

  function getNotationMoves() {
    const selectors = '.move-text-component, [class*="move-text"], .move-node-component, .move-node';
    const scopes = document.querySelectorAll('.vertical-move-list, .vertical-move-list-component, .move-list, [data-cy="move-list"], .notation-window');
    const scope = scopes.length ? scopes[scopes.length - 1] : document;
    const nodes = Array.from(scope.querySelectorAll(selectors));
    const seen = new Set();
    return nodes.filter(node => {
      const target = node.matches?.('.move-text-component, [class*="move-text"]')
        ? node : node.querySelector?.('.move-text-component, [class*="move-text"]') || node;
      if (!target || seen.has(target)) return false;
      seen.add(target);
      return true;
    }).map(node => node.matches?.('.move-text-component, [class*="move-text"]')
      ? node : node.querySelector?.('.move-text-component, [class*="move-text"]') || node);
  }

  function findNotationTarget(ply, fallbackMoves) {
    if (!Number.isFinite(ply) || ply < 1) return null;
    const values = [ply, ply - 1];
    const attrs = ['data-ply', 'data-ply-index', 'data-move-index'];
    for (const attr of attrs) {
      for (const value of values) {
        const nodes = document.querySelectorAll(`[${attr}="${value}"]`);
        for (const node of nodes) {
          if (node.closest?.('#cse-mc-gui, .cse-gi-recap')) continue;
          const target = node.matches?.('.move-text-component, [class*="move-text"], .move-node-component, .move-node')
            ? node
            : node.querySelector?.('.move-text-component, [class*="move-text"], .move-node-component, .move-node') || node;
          if (target && target.textContent?.trim()) return target;
        }
      }
    }
    return fallbackMoves[ply - 1] || null;
  }

  function syncMoveBadges() {
    if (!state.enabled || !state.liveUiEnabled) return;
    const moves = getNotationMoves();
    for (const [ply, record] of state.badgeByPly) {
      const target = findNotationTarget(ply, moves);
      if (!target || !target.parentNode || !QUALITY[record.bucket]) continue;
      let badge = document.querySelector(`.cse-move-quality[data-cse-ply="${ply}"]`);
      const quality = QUALITY[record.bucket];
      if (!badge) badge = document.createElement('span');
      if (badge.previousElementSibling !== target) target.insertAdjacentElement('afterend', badge);
      badge.className = `cse-move-quality cse-quality-${record.bucket}`;
      badge.dataset.cseBucket = record.bucket;
      badge.dataset.csePly = String(ply);
      badge.textContent = quality.icon;
      badge.title = `${quality.label}${Number.isFinite(record.cpl) ? ` (${record.cpl} CPL)` : ''}`;
      badge.setAttribute('aria-label', badge.title);
    }
  }

  function scheduleBadgeSync() {
    if (!state.enabled || !state.liveUiEnabled || state.syncFrame) return;
    state.syncFrame = requestAnimationFrame(() => {
      state.syncFrame = 0;
      syncMoveBadges();
    });
  }

  function scheduleBadgeRetries() {
    [80, 260, 700].forEach(delay => {
      const timer = setTimeout(() => {
        state.retryTimers.delete(timer);
        scheduleBadgeSync();
      }, delay);
      state.retryTimers.add(timer);
    });
  }

  function handlePositionChange(snapshot) {
    if (!state.enabled || !snapshot?.fenBefore || !snapshot?.fenAfter || !Number.isFinite(snapshot.ply)) return;
    if (!state.liveUiEnabled) return;
    if (!state.badgeByPly.has(snapshot.ply)) {
      state.badgeByPly.set(snapshot.ply, { ply: snapshot.ply, cpl: null, bucket: 'pending' });
      trimMap(state.badgeByPly, MAX_BADGES);
    }
    scheduleBadgeSync();
    scheduleBadgeRetries();
  }

  function flushPendingMoves() {
    for (const [key, snapshot] of Array.from(state.pendingMoves.entries())) {
      if (!state.evalByFen.has(snapshot.fenBefore) || !state.evalByFen.has(snapshot.fenAfter)) continue;
      state.pendingMoves.delete(key);
      handleMove(snapshot);
    }
  }

  function handleMove(snapshot) {
    if (!state.enabled || !snapshot?.fenBefore || !snapshot?.fenAfter) return;
    const key = `${snapshot.fenBefore}>${snapshot.fenAfter}`;
    if (state.analysedMoveKeys.has(key)) return;
    const before = state.evalByFen.get(snapshot.fenBefore);
    const after = state.evalByFen.get(snapshot.fenAfter);
    const mover = getFenTurn(snapshot.fenBefore);
    if (!before || !after || !mover) {
      state.pendingMoves.set(key, { ...snapshot });
      trimMap(state.pendingMoves, MAX_BADGES);
      return;
    }
    state.pendingMoves.delete(key);

    const cpl = evaluationLoss(before, after, mover);
    const uci = (snapshot.uci || inferUciFromFens(snapshot.fenBefore, snapshot.fenAfter) || '').toLowerCase() || null;
    const bucket = classifyMove({ cpl, uci, bestMove: before.bestMove, beforeFen: snapshot.fenBefore, afterFen: snapshot.fenAfter, mover });
    if (!bucket || !Number.isFinite(snapshot.ply)) return;

    state.analysedMoveKeys.add(key);
    if (state.analysedMoveKeys.size > MAX_BADGES) state.analysedMoveKeys.delete(state.analysedMoveKeys.values().next().value);
    const s = state.stats;
    s.moveCount += 1;
    s.totalCpl += cpl;
    s.avgCpl = s.totalCpl / s.moveCount;
    s[bucket] += 1;
    const phase = phaseFromFen(snapshot.fenAfter, snapshot.ply);
    s.phase[phase] += 1;
    if (bucket === 'brilliant' || bucket === 'blunder' || cpl >= 170) s.tacticalFlags += 1;
    const topMoves = Array.isArray(before.topMoves) ? before.topMoves : [];
    const record = {
      ply: snapshot.ply,
      cpl: Math.round(cpl),
      bucket,
      uci,
      playedMove: uci,
      bestMove: before.bestMove || null,
      humanMove: topMoves.find(move => move && move !== before.bestMove) || before.bestMove || null,
      phase,
      mover,
      fenBefore: snapshot.fenBefore,
      fenAfter: snapshot.fenAfter,
      evalBefore: { cp: before.cp, mate: before.mate },
      evalAfter: { cp: after.cp, mate: after.mate },
    };
    state.records.push(record);
    if (state.records.length > MAX_BADGES) state.records.shift();
    s.lastMove = record;
    state.badgeByPly.set(snapshot.ply, record);
    trimMap(state.badgeByPly, MAX_BADGES);
    scheduleBadgeSync();
    scheduleBadgeRetries();
    if (bucket === 'mistake' || bucket === 'blunder') {
      window.CSENotify?.('analysisWarning', QUALITY[bucket].icon + ' ' + QUALITY[bucket].label, Math.round(cpl) + ' CPL on move ' + snapshot.ply, {
        id: 'analysis-' + snapshot.ply,
        cooldown: 250,
      });
    }
  }

  function getLiveStats() {
    const s = state.stats;
    return { ...s, avgCpl: Math.round(s.avgCpl || 0), phase: { ...s.phase }, lastMove: s.lastMove ? { ...s.lastMove } : null };
  }

  function getReviewData() {
    return {
      gameToken: state.gameToken,
      playerSide: state.playerSide,
      stats: getLiveStats(),
      records: state.records.map(record => ({
        ...record,
        evalBefore: { ...record.evalBefore },
        evalAfter: { ...record.evalAfter },
      })),
    };
  }

  function removeRecap() {
    document.getElementById('cse-gi-recap')?.remove();
  }

  function showRecap() {
    if (!state.enabled || !state.liveUiEnabled) return;
    removeRecap();
    const s = getLiveStats();
    const wrap = document.createElement('section');
    wrap.id = 'cse-gi-recap';
    wrap.className = 'cse-gi-recap';
    wrap.innerHTML = `
      <div class="cse-gi-recap-head"><strong>Game analysis</strong><button type="button" aria-label="Close">×</button></div>
      <div class="cse-gi-recap-meta">${s.moveCount} analysed moves · ${s.avgCpl} average CPL</div>
      <div class="cse-gi-quality-grid">
        ${['brilliant','great','best','good','ok','inaccuracy','mistake','blunder'].map(key => `<div class="cse-gi-quality-row cse-quality-${key}"><span>${QUALITY[key].icon} ${QUALITY[key].label}</span><b>${s[key]}</b></div>`).join('')}
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('button')?.addEventListener('click', removeRecap);
  }

  window.CSEGameInsights = {
    init() {}, setEnabled, setLiveUiEnabled, handleEval, handleMove, handlePositionChange,
    handleGameTransition, getLiveStats, getReviewData, reset, flushPendingBadges: scheduleBadgeSync,
  };
})();