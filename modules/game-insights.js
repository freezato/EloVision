(function () {
  const state = {
    enabled: false,
    gameToken: null,
    recapShownForToken: null,
    evalByFen: new Map(),
    stats: createEmptyStats(),
  };

  function createEmptyStats() {
    return {
      moveCount: 0,
      avgCpl: 0,
      totalCpl: 0,
      best: 0,
      good: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
      tacticalFlags: 0,
      phase: { opening: 0, middlegame: 0, endgame: 0 },
      lastMove: null,
    };
  }

  function normalizeTurn(value) {
    if (typeof value !== 'string') return null;
    const t = value.trim().toLowerCase();
    if (t === 'w' || t === 'white') return 'w';
    if (t === 'b' || t === 'black') return 'b';
    return null;
  }

  function getFenTurn(fen) {
    if (typeof fen !== 'string') return null;
    return normalizeTurn((fen.trim().split(/\s+/)[1]) || '');
  }

  function materialPhaseFromFen(fen, fallbackPly) {
    if (typeof fen !== 'string') {
      if (Number.isFinite(fallbackPly)) return fallbackPly <= 16 ? 'opening' : fallbackPly <= 60 ? 'middlegame' : 'endgame';
      return 'middlegame';
    }
    const board = (fen.split(' ')[0] || '');
    let heavy = 0;
    let minors = 0;
    for (const ch of board) {
      if (ch === 'q' || ch === 'Q' || ch === 'r' || ch === 'R') heavy++;
      if (ch === 'b' || ch === 'B' || ch === 'n' || ch === 'N') minors++;
    }
    if (heavy >= 7 || minors >= 8) return 'opening';
    if (heavy <= 2 && minors <= 3) return 'endgame';
    if (Number.isFinite(fallbackPly) && fallbackPly <= 16) return 'opening';
    return 'middlegame';
  }

  function classifyCpl(cpl) {
    if (!Number.isFinite(cpl)) return null;
    if (cpl <= 10) return 'best';
    if (cpl <= 35) return 'good';
    if (cpl <= 90) return 'inaccuracy';
    if (cpl <= 180) return 'mistake';
    return 'blunder';
  }

  function reset() {
    state.evalByFen.clear();
    state.stats = createEmptyStats();
    removeRecap();
  }

  function setEnabled(enabled) {
    state.enabled = !!enabled;
    if (!state.enabled) removeRecap();
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
    if (typeof snapshot.fen === 'string' && snapshot.fen) {
      state.evalByFen.set(snapshot.fen, {
        cp: Number.isFinite(snapshot.cp) ? snapshot.cp : null,
        mate: Number.isFinite(snapshot.mate) ? snapshot.mate : null,
      });
      if (state.evalByFen.size > 180) {
        const first = state.evalByFen.keys().next();
        if (!first.done) state.evalByFen.delete(first.value);
      }
    }
    if (snapshot.gameOver && state.gameToken && state.recapShownForToken !== state.gameToken) {
      state.recapShownForToken = state.gameToken;
      showRecap();
    }
  }

  function handleMove(snapshot) {
    if (!state.enabled || !snapshot || typeof snapshot !== 'object') return;
    state.stats.moveCount += 1;

    const before = state.evalByFen.get(snapshot.fenBefore);
    const after = state.evalByFen.get(snapshot.fenAfter);
    if (!before || !after) return;

    const mover = getFenTurn(snapshot.fenBefore);
    if (!mover) return;

    let cpl = null;
    if (Number.isFinite(before.cp) && Number.isFinite(after.cp)) {
      cpl = mover === 'w'
        ? Math.max(0, before.cp - after.cp)
        : Math.max(0, after.cp - before.cp);
    } else if (Number.isFinite(before.mate) && Number.isFinite(after.mate)) {
      cpl = Math.max(0, Math.abs(after.mate) - Math.abs(before.mate)) * 40;
    }

    const bucket = classifyCpl(cpl);
    if (bucket) {
      state.stats.totalCpl += cpl;
      state.stats[bucket] += 1;
    }

    state.stats.avgCpl = state.stats.moveCount > 0 ? state.stats.totalCpl / state.stats.moveCount : 0;

    const phase = materialPhaseFromFen(snapshot.fenAfter, snapshot.ply);
    state.stats.phase[phase] += 1;

    const mateThreat = Number.isFinite(after.mate) && Math.abs(after.mate) <= 3;
    const bigSwing = Math.abs(after.cp - before.cp) >= 170;
    if (mateThreat || bigSwing) state.stats.tacticalFlags += 1;

    state.stats.lastMove = {
      ply: Number.isFinite(snapshot.ply) ? snapshot.ply : null,
      uci: snapshot.uci || null,
      cpl: Number.isFinite(cpl) ? Math.round(cpl) : null,
      bucket: bucket || 'unknown',
      phase,
    };
  }

  function getLiveStats() {
    const s = state.stats;
    return {
      moveCount: s.moveCount,
      avgCpl: Math.round(s.avgCpl || 0),
      best: s.best,
      good: s.good,
      inaccuracy: s.inaccuracy,
      mistake: s.mistake,
      blunder: s.blunder,
      tacticalFlags: s.tacticalFlags,
      phase: { ...s.phase },
      lastMove: s.lastMove ? { ...s.lastMove } : null,
    };
  }

  function removeRecap() {
    const el = document.getElementById('cse-gi-recap');
    if (el) el.remove();
  }

  function showRecap() {
    removeRecap();
    const s = getLiveStats();
    const wrap = document.createElement('div');
    wrap.id = 'cse-gi-recap';
    wrap.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#111;border:1px solid #2f2f2f;border-radius:10px;padding:12px 12px 10px;color:#ddd;min-width:260px;box-shadow:0 10px 30px rgba(0,0,0,.45);font:12px/1.4 Segoe UI,sans-serif;';
    wrap.innerHTML = [
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">',
      '<b style="color:#f0f0f0;">Game Insights</b>',
      '<button id="cse-gi-recap-close" style="background:none;border:0;color:#aaa;cursor:pointer;font-size:14px;">x</button>',
      '</div>',
      `<div>Moves: <b>${s.moveCount}</b> | Avg CPL: <b>${s.avgCpl}</b></div>`,
      `<div>Best ${s.best} | Good ${s.good} | Inacc ${s.inaccuracy}</div>`,
      `<div>Mistakes ${s.mistake} | Blunders ${s.blunder}</div>`,
      `<div>Tactical flags: <b>${s.tacticalFlags}</b></div>`,
    ].join('');
    document.body.appendChild(wrap);
    wrap.querySelector('#cse-gi-recap-close')?.addEventListener('click', removeRecap);
  }

  window.CSEGameInsights = {
    init() {},
    setEnabled,
    handleEval,
    handleMove,
    handleGameTransition,
    getLiveStats,
    reset,
  };
})();
