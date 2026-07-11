(function () {
  const QUALITY = {
    brilliant: { label: 'Brilliant', icon: '!!' },
    great: { label: 'Great', icon: '!' },
    best: { label: 'Best', icon: '★' },
    good: { label: 'Good', icon: '✓' },
    ok: { label: 'OK', icon: '·' },
    inaccuracy: { label: 'Inaccuracy', icon: '?!' },
    mistake: { label: 'Mistake', icon: '?' },
    blunder: { label: 'Blunder', icon: '??' },
    pending: { label: 'Analysing', icon: '…' },
  };

  const state = {
    enabled: false,
    gameToken: null,
    recapShownForToken: null,
    evalByFen: new Map(),
    analysedMoveKeys: new Set(),
    badgeRecords: new Map(),
    lastObservedPly: null,
    stats: createEmptyStats(),
  };

  function createEmptyStats() {
    return {
      moveCount: 0,
      avgCpl: 0,
      totalCpl: 0,
      brilliant: 0,
      great: 0,
      best: 0,
      good: 0,
      ok: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
      tacticalFlags: 0,
      phase: { opening: 0, middlegame: 0, endgame: 0 },
      lastMove: null,
    };
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

  // A move is inferred from the two board states so analysis also works when
  // chess.com's notation DOM has not settled yet. Castling and promotion are covered.
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
    let promotion = '';
    if (String(from.before).toLowerCase() === 'p' && String(to.after).toLowerCase() !== 'p') promotion = String(to.after).toLowerCase();
    return squareAt(from.row, from.col) + squareAt(to.row, to.col) + promotion;
  }

  function materialValue(piece) {
    return ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 })[String(piece || '').toLowerCase()] || 0;
  }

  function materialFor(fen, color) {
    return Array.from(boardPart(fen)).reduce((sum, piece) => {
      const belongsToColor = color === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
      return belongsToColor ? sum + materialValue(piece) : sum;
    }, 0);
  }

  function materialPhaseFromFen(fen, fallbackPly) {
    const board = boardPart(fen);
    if (!board) return Number.isFinite(fallbackPly) && fallbackPly <= 16 ? 'opening' : 'middlegame';
    const heavy = (board.match(/[qQrR]/g) || []).length;
    const minors = (board.match(/[bBnN]/g) || []).length;
    if (heavy >= 7 || minors >= 8 || (Number.isFinite(fallbackPly) && fallbackPly <= 16)) return 'opening';
    return heavy <= 2 && minors <= 3 ? 'endgame' : 'middlegame';
  }

  function evaluationLoss(before, after, mover) {
    if (Number.isFinite(before.cp) && Number.isFinite(after.cp)) {
      return mover === 'w' ? Math.max(0, before.cp - after.cp) : Math.max(0, after.cp - before.cp);
    }
    if (Number.isFinite(before.mate) || Number.isFinite(after.mate)) {
      const beforeScore = Number.isFinite(before.mate) ? (mover === 'w' ? before.mate : -before.mate) : 0;
      const afterScore = Number.isFinite(after.mate) ? (mover === 'w' ? after.mate : -after.mate) : 0;
      return Math.max(0, beforeScore - afterScore) * 1000;
    }
    return null;
  }

  function classifyMove({ cpl, uci, bestMove, beforeFen, afterFen, mover }) {
    if (!Number.isFinite(cpl)) return null;
    const playedBest = !!uci && !!bestMove && uci === bestMove;
    const sacrificedMaterial = materialFor(afterFen, mover) <= materialFor(beforeFen, mover) - 2;
    if (playedBest && sacrificedMaterial && cpl <= 15) return 'brilliant';
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
    state.badgeRecords.clear();
    state.lastObservedPly = null;
    state.stats = createEmptyStats();
    document.querySelectorAll('.cse-move-quality').forEach(el => el.remove());
    removeRecap();
  }

  function setEnabled(enabled) {
    state.enabled = !!enabled;
    if (!state.enabled) {
      document.querySelectorAll('.cse-move-quality').forEach(el => el.remove());
      removeRecap();
    }
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
    // A rematch can keep the same route, so a return to the opening is a
    // reliable signal that this is a new game.
    if (Number.isFinite(snapshot.ply)) {
      if (Number.isFinite(state.lastObservedPly) && snapshot.ply + 1 < state.lastObservedPly) reset();
      state.lastObservedPly = snapshot.ply;
    }
    if (typeof snapshot.fen === 'string' && snapshot.fen && (Number.isFinite(snapshot.cp) || Number.isFinite(snapshot.mate))) {
      state.evalByFen.set(snapshot.fen, {
        cp: Number.isFinite(snapshot.cp) ? snapshot.cp : null,
        mate: Number.isFinite(snapshot.mate) ? snapshot.mate : null,
        bestMove: typeof snapshot.bestMove === 'string' ? snapshot.bestMove.toLowerCase() : null,
      });
      if (state.evalByFen.size > 220) state.evalByFen.delete(state.evalByFen.keys().next().value);
    }
    syncMoveBadges();
    if (snapshot.gameOver && state.gameToken && state.recapShownForToken !== state.gameToken) {
      state.recapShownForToken = state.gameToken;
      window.setTimeout(showRecap, 0);
    }
  }

  function getNotationTextNodes() {
    const raw = Array.from(document.querySelectorAll(
      '.move-text-component, [class*="move-text"], .move-node-component, .move-node'
    ));
    // A move node often contains another move node after a chess.com DOM update.
    // Keeping only the innermost node gives one item per half-move, not duplicates.
    return raw.filter(node => !raw.some(other => other !== node && node.contains?.(other)));
  }

  function findNotationMove(ply) {
    if (!Number.isFinite(ply) || ply < 1) return null;
    const byPly = ['data-ply', 'data-ply-index', 'data-move-index'];
    for (const attr of byPly) {
      // Chess.com has used both zero- and one-based values for these attributes.
      const exact = Array.from(document.querySelectorAll(`[${attr}]`))
        .filter(el => [ply, ply - 1].includes(Number(el.getAttribute(attr))))
        .reverse();
      for (const el of exact) {
        const text = el.querySelector('.move-text-component, [class*="move-text"]');
        if (text || el.textContent?.trim()) return text || el;
      }
    }
    return getNotationTextNodes()[ply - 1] || null;
  }

  function renderBadge(record) {
    if (!state.enabled || !record || !QUALITY[record.bucket]) return false;
    const target = findNotationMove(record.ply);
    if (!target) return false;
    const existing = target.querySelector?.('.cse-move-quality');
    if (existing?.dataset.cseBucket === record.bucket) return true;
    if (existing) existing.remove?.();
    const quality = QUALITY[record.bucket];
    const badge = document.createElement('span');
    badge.className = `cse-move-quality cse-quality-${record.bucket}`;
    badge.dataset.cseBucket = record.bucket;
    badge.textContent = quality.icon;
    badge.title = `${quality.label}${Number.isFinite(record.cpl) ? ` (${record.cpl} CPL)` : ''}`;
    target.appendChild(badge);
    return true;
  }

  function syncMoveBadges() {
    state.badgeRecords.forEach(renderBadge);
  }

  function handlePositionChange(snapshot) {
    if (!state.enabled || !snapshot?.fenBefore || !snapshot?.fenAfter) return;
    const key = `${snapshot.fenBefore}>${snapshot.fenAfter}`;
    const record = state.badgeRecords.get(key) || {
      ply: Number.isFinite(snapshot.ply) ? snapshot.ply : null,
      cpl: null,
      bucket: 'pending',
    };
    // The placeholder appears on the new notation entry immediately, then is
    // replaced in-place once Stockfish returns the position evaluation.
    record.ply = Number.isFinite(snapshot.ply) ? snapshot.ply : record.ply;
    state.badgeRecords.set(key, record);
    renderBadge(record);
  }

  function handleMove(snapshot) {
    if (!state.enabled || !snapshot || typeof snapshot !== 'object') return;
    const key = `${snapshot.fenBefore || ''}>${snapshot.fenAfter || ''}`;
    if (!snapshot.fenBefore || !snapshot.fenAfter || state.analysedMoveKeys.has(key)) return;
    const before = state.evalByFen.get(snapshot.fenBefore);
    const after = state.evalByFen.get(snapshot.fenAfter);
    const mover = getFenTurn(snapshot.fenBefore);
    if (!before || !after || !mover) return;

    const cpl = evaluationLoss(before, after, mover);
    const uci = (snapshot.uci || inferUciFromFens(snapshot.fenBefore, snapshot.fenAfter) || '').toLowerCase() || null;
    const bucket = classifyMove({ cpl, uci, bestMove: before.bestMove, beforeFen: snapshot.fenBefore, afterFen: snapshot.fenAfter, mover });
    if (!bucket) return;

    state.analysedMoveKeys.add(key);
    const s = state.stats;
    s.moveCount += 1;
    s.totalCpl += cpl;
    s.avgCpl = s.totalCpl / s.moveCount;
    s[bucket] += 1;
    const phase = materialPhaseFromFen(snapshot.fenAfter, snapshot.ply);
    s.phase[phase] += 1;
    if (bucket === 'brilliant' || bucket === 'blunder' || cpl >= 170) s.tacticalFlags += 1;
    const record = { ply: Number.isFinite(snapshot.ply) ? snapshot.ply : null, cpl: Math.round(cpl), bucket, uci, phase };
    s.lastMove = record;
    state.badgeRecords.set(key, record);
    renderBadge(record);
    window.setTimeout(syncMoveBadges, 250);
  }

  function getLiveStats() {
    const s = state.stats;
    return { ...s, avgCpl: Math.round(s.avgCpl || 0), phase: { ...s.phase }, lastMove: s.lastMove ? { ...s.lastMove } : null };
  }

  function removeRecap() {
    document.getElementById('cse-gi-recap')?.remove();
  }

  function showRecap() {
    if (!state.enabled) return;
    removeRecap();
    const s = getLiveStats();
    const wrap = document.createElement('section');
    wrap.id = 'cse-gi-recap';
    wrap.className = 'cse-gi-recap';
    wrap.innerHTML = `
      <div class="cse-gi-recap-head"><strong>Game analysis</strong><button type="button" aria-label="Close">×</button></div>
      <div class="cse-gi-recap-meta">${s.moveCount} analysed moves · ${s.avgCpl} average CPL</div>
      <div class="cse-gi-quality-grid">
        ${['brilliant', 'great', 'best', 'good', 'ok', 'inaccuracy', 'mistake', 'blunder'].map(key => `<div class="cse-gi-quality-row cse-quality-${key}"><span>${QUALITY[key].icon} ${QUALITY[key].label}</span><b>${s[key]}</b></div>`).join('')}
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('button')?.addEventListener('click', removeRecap);
  }

  window.CSEGameInsights = {
    init() {}, setEnabled, handleEval, handleMove, handlePositionChange,
    handleGameTransition, getLiveStats, reset,
    flushPendingBadges: syncMoveBadges,
  };
})();
