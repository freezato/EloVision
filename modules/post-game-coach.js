(function () {
  'use strict';

  const state = {
    enabled: false,
    lastReview: null,
    lastData: null,
    panel: null,
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);

  function moveLabel(move) {
    const value = String(move || '').trim();
    if (!value) return '—';
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value)) return value;
    return value.slice(0, 2) + ' → ' + value.slice(2, 4) + (value[4] ? '=' + value[4].toUpperCase() : '');
  }

  function accuracyFromRecords(records) {
    if (!records.length) return 0;
    const avg = records.reduce((sum, record) => sum + Math.max(0, Number(record.cpl) || 0), 0) / records.length;
    return Math.round(clamp(100 * Math.exp(-avg / 145), 0, 100));
  }

  function gradePhase(records) {
    if (!records.length) return { label: 'Not enough data', tone: 'muted', avg: null };
    const avg = records.reduce((sum, record) => sum + (Number(record.cpl) || 0), 0) / records.length;
    if (avg <= 22) return { label: 'Excellent', tone: 'excellent', avg: Math.round(avg) };
    if (avg <= 48) return { label: 'Good', tone: 'good', avg: Math.round(avg) };
    if (avg <= 85) return { label: 'Mixed', tone: 'mixed', avg: Math.round(avg) };
    return { label: 'Weak', tone: 'weak', avg: Math.round(avg) };
  }

  function perspectiveCp(evaluation, side) {
    if (!evaluation || !Number.isFinite(evaluation.cp)) return null;
    return side === 'b' ? -evaluation.cp : evaluation.cp;
  }

  function findRecurringIssue(records) {
    const opening = records.filter(record => record.phase === 'opening');
    let repeatCount = 0;
    let queenMoves = 0;
    let pawnMoves = 0;

    for (let index = 0; index < opening.length; index++) {
      const move = opening[index].playedMove || '';
      const previous = opening[index - 1]?.playedMove || '';
      if (previous.slice(2, 4) && previous.slice(2, 4) === move.slice(0, 2)) repeatCount++;
      if (/^(d1|d8)/.test(move) || (index > 0 && /^(d1|d8)/.test(previous) && previous.slice(2, 4) === move.slice(0, 2))) queenMoves++;
      if (/^[a-h][27]/.test(move)) pawnMoves++;
    }

    if (repeatCount >= 2) return 'You moved the same piece repeatedly during development.';
    if (queenMoves >= 2) return 'Your queen moved repeatedly before development was complete.';
    if (pawnMoves >= 5) return 'Too many pawn moves slowed down your development.';
    const bad = records.filter(record => record.bucket === 'mistake' || record.bucket === 'blunder');
    if (bad.length >= 2) return 'Tactical checks and captures need a final verification before moving.';
    const inaccurate = records.filter(record => record.bucket === 'inaccuracy').length;
    if (inaccurate >= 3) return 'Small inaccuracies accumulated in quiet positions.';
    return 'No clear recurring weakness was detected in this game.';
  }

  function buildReview(data) {
    const allRecords = Array.isArray(data?.records) ? data.records.slice().sort((a, b) => a.ply - b.ply) : [];
    const side = data?.playerSide === 'b' ? 'b' : data?.playerSide === 'w' ? 'w' : null;
    const records = side ? allRecords.filter(record => record.mover === side) : allRecords;
    const phaseRecords = phase => records.filter(record => record.phase === phase);
    const worst = records.reduce((current, record) => !current || record.cpl > current.cpl ? record : current, null);
    const critical = records.reduce((current, record) => !current || record.cpl > current.cpl ? record : current, null);
    const missedTactic = records
      .filter(record => record.cpl >= 110 && record.bestMove)
      .sort((a, b) => b.cpl - a.cpl)[0] || null;

    let maxAdvantage = null;
    let maxAdvantageRecord = null;
    records.forEach(record => {
      const cp = perspectiveCp(record.evalAfter, side || record.mover);
      if (Number.isFinite(cp) && (maxAdvantage === null || cp > maxAdvantage)) {
        maxAdvantage = cp;
        maxAdvantageRecord = record;
      }
    });

    return {
      gameToken: data?.gameToken || null,
      side,
      records,
      accuracy: records.length ? accuracyFromRecords(records) : null,
      opening: gradePhase(phaseRecords('opening')),
      middlegame: gradePhase(phaseRecords('middlegame')),
      endgame: gradePhase(phaseRecords('endgame')),
      worst,
      critical,
      missedTactic,
      maxAdvantage,
      maxAdvantageRecord,
      recurringIssue: findRecurringIssue(records),
    };
  }

  function moveNumber(ply) {
    if (!Number.isFinite(ply)) return '—';
    return Math.ceil(ply / 2) + (ply % 2 ? '.' : '...');
  }

  function phaseRow(label, phase) {
    return `<div class="cse-coach-phase"><span>${label}</span><b class="is-${phase.tone}">${esc(phase.label)}</b><small>${phase.avg === null ? '—' : phase.avg + ' CPL'}</small></div>`;
  }

  function insightCard(label, record, detail) {
    return `<article class="cse-coach-insight">
      <span>${esc(label)}</span>
      <strong>${record ? esc(moveNumber(record.ply) + ' ' + moveLabel(record.playedMove)) : '—'}</strong>
      <small>${esc(detail || 'Not detected')}</small>
    </article>`;
  }

  function removePanel() {
    state.panel?.remove();
    state.panel = null;
  }

  function makeMovable(panel) {
    const handle = panel.querySelector('.cse-coach-head');
    if (!handle) return;

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const clampPosition = (left, top) => {
      const visibleWidth = Math.min(110, panel.offsetWidth);
      const minLeft = Math.min(8, visibleWidth - panel.offsetWidth);
      const maxLeft = Math.max(8, window.innerWidth - visibleWidth);
      const minTop = 8;
      const maxTop = Math.max(minTop, window.innerHeight - 58);
      return {
        left: clamp(left, minLeft, maxLeft),
        top: clamp(top, minTop, maxTop),
      };
    };

    const onMove = event => {
      if (event.pointerId !== pointerId) return;
      const next = clampPosition(
        startLeft + event.clientX - startX,
        startTop + event.clientY - startY
      );
      panel.style.left = next.left + 'px';
      panel.style.top = next.top + 'px';
    };

    const stop = event => {
      if (pointerId === null || (event?.pointerId != null && event.pointerId !== pointerId)) return;
      try {
        if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      } catch {}
      pointerId = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };

    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      event.preventDefault();

      const rect = panel.getBoundingClientRect();
      panel.getAnimations?.().forEach(animation => {
        try { animation.cancel(); } catch {}
      });
      panel.style.animation = 'none';
      panel.style.transform = 'none';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';

      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      pointerId = event.pointerId;

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      try { handle.setPointerCapture?.(pointerId); } catch {}
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });
  }

  function showReview(data) {
    if (!state.enabled) return;
    const review = buildReview(data);
    state.lastReview = review;
    state.lastData = data;
    removePanel();

    const panel = document.createElement('section');
    panel.id = 'cse-post-game-coach';
    panel.className = 'cse-post-game-coach';
    panel.innerHTML = `
      <header class="cse-coach-head">
        <div><span>POST-GAME COACH</span><strong>Game review</strong></div>
        <button type="button" aria-label="Close coach report">×</button>
      </header>
      <div class="cse-coach-body">
        <section class="cse-coach-score">
          <div><strong>${review.accuracy === null ? '—' : review.accuracy + '%'}</strong><span>Accuracy</span></div>
          <p>${review.records.length ? review.records.length + ' player moves analysed' : 'No completed game is available yet'}</p>
        </section>
        <section class="cse-coach-phases">
          ${phaseRow('Opening', review.opening)}
          ${phaseRow('Middlegame', review.middlegame)}
          ${phaseRow('Endgame', review.endgame)}
        </section>
        <section class="cse-coach-grid">
          ${insightCard('Critical moment', review.critical, review.critical ? review.critical.cpl + ' centipawns lost' : '')}
          ${insightCard('Maximum advantage', review.maxAdvantageRecord, Number.isFinite(review.maxAdvantage) ? (review.maxAdvantage >= 0 ? '+' : '') + (review.maxAdvantage / 100).toFixed(2) : '')}
          ${insightCard('Missed tactic', review.missedTactic, review.missedTactic ? 'Better: ' + moveLabel(review.missedTactic.bestMove) : '')}
          ${insightCard('Costliest mistake', review.worst, review.worst ? review.worst.cpl + ' CPL' : '')}
        </section>
        <section class="cse-coach-comparison">
          <span>MOVE COMPARISON</span>
          <div><small>Played</small><b>${esc(moveLabel(review.worst?.playedMove))}</b></div>
          <div><small>Best</small><b>${esc(moveLabel(review.worst?.bestMove))}</b></div>
          <div><small>More human</small><b>${esc(moveLabel(review.worst?.humanMove))}</b></div>
        </section>
        <section class="cse-coach-recurring">
          <span>RECURRING ISSUE</span>
          <p>${esc(review.recurringIssue)}</p>
        </section>
      </div>
    `;
    document.body.appendChild(panel);
    state.panel = panel;
    panel.querySelector('.cse-coach-head button')?.addEventListener('click', removePanel);
    makeMovable(panel);
  }

  function setEnabled(enabled) {
    state.enabled = !!enabled;
    if (!state.enabled) removePanel();
  }

  window.addEventListener('cse-game-review-ready', event => {
    if (state.enabled && event.detail) showReview(event.detail);
  });

  window.CSEPostGameCoach = {
    setEnabled,
    showReview,
    showLastReview() {
      if (!state.enabled) return false;
      const current = window.CSEGameInsights?.getReviewData?.();
      const fallback = current && Array.isArray(current.records) && current.records.length ? current : null;
      showReview(state.lastData || fallback || { gameToken: null, playerSide: null, records: [] });
      return true;
    },
    close: removePanel,
  };
})();
