(function initHumanAutomove(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CSEHumanAutomove = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createHumanAutomoveApi() {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function lineScoreForSide(line, side) {
    if (!line || (side !== 'w' && side !== 'b')) return null;
    let whiteScore = null;
    if (Number.isFinite(line.mate)) {
      const sign = Math.sign(line.mate);
      whiteScore = sign * (100000 - Math.min(99, Math.abs(line.mate)) * 100);
    } else if (Number.isFinite(line.cp)) {
      whiteScore = line.cp;
    }
    if (!Number.isFinite(whiteScore)) return null;
    return side === 'w' ? whiteScore : -whiteScore;
  }

  function getHumanBaseDepth(clockSec) {
    if (!Number.isFinite(clockSec)) return 6;
    if (clockSec >= 60) return 8;
    if (clockSec >= 20) return 6;
    if (clockSec >= 5) return 5;
    return 4;
  }

  function getHumanDepth(clockSec, complexity = 0) {
    return getHumanBaseDepth(clockSec) + (clamp(Number(complexity) || 0, 0, 1) >= 0.68 ? 1 : 0);
  }

  function estimateMovesRemaining(fullmove, pieceCount) {
    const move = Number.isFinite(fullmove) ? Math.max(1, fullmove) : 20;
    let estimate = clamp(Math.round(42 - move), 8, 30);
    if (Number.isFinite(pieceCount) && pieceCount <= 10) estimate = Math.min(estimate, 12);
    return estimate;
  }

  function getClockCapSeconds(clockSec) {
    if (!Number.isFinite(clockSec)) return 4;
    if (clockSec > 180) return 12;
    if (clockSec >= 60) return 8;
    if (clockSec >= 20) return 3;
    if (clockSec >= 5) return 0.8;
    return 0.18;
  }

  function computeHumanThinkBudget({
    clockSec,
    complexity = 0,
    fullmove = null,
    pieceCount = null,
    random = Math.random,
  } = {}) {
    const c = clamp(Number(complexity) || 0, 0, 1);
    const rand = typeof random === 'function' ? clamp(Number(random()) || 0, 0, 1) : 0.5;
    const jitter = 0.65 + (rand * 0.70);

    if (!Number.isFinite(clockSec)) {
      let fallback = clamp((0.3 + (3.7 * c)) * jitter, 0.3, 4);
      if (Number.isFinite(fullmove) && fullmove <= 10) {
        fallback = Math.min(fallback, (0.25 + (Math.pow(c, 3) * 1.20)) * jitter);
      }
      return {
        budgetSec: fallback,
        usableSec: null,
        reserveSec: null,
        movesRemaining: estimateMovesRemaining(fullmove, pieceCount),
        capSec: 4,
        band: 'fallback',
      };
    }

    const clock = Math.max(0, clockSec);
    const reserveSec = clock * 0.12;
    const usableSec = Math.max(0, clock - reserveSec);
    const movesRemaining = estimateMovesRemaining(fullmove, pieceCount);
    const capSec = Math.min(getClockCapSeconds(clock), usableSec);
    let budgetSec;
    let band;

    if (clock < 5) {
      band = 'under-5';
      const desired = (0.03 + (0.15 * c)) * jitter;
      const minimum = Math.min(0.03, capSec);
      budgetSec = clamp(desired, minimum, capSec);
    } else {
      band = clock > 180 ? 'over-180' : clock >= 60 ? '60-180' : clock >= 20 ? '20-60' : '5-20';
      const perMove = usableSec / movesRemaining;
      const complexityMultiplier = 0.65 + (1.10 * c);
      budgetSec = clamp(perMove * complexityMultiplier * jitter, 0, capSec);
    }

    if (clock >= 5 && Number.isFinite(fullmove) && fullmove <= 10) {
      const openingBase = clock >= 60 ? 0.25 : clock >= 20 ? 0.18 : 0.10;
      const openingComplexAllowance = clock >= 60 ? 1.40 : clock >= 20 ? 0.80 : 0.40;
      const openingCap = Math.min(capSec, (openingBase + (Math.pow(c, 3) * openingComplexAllowance)) * jitter);
      budgetSec = Math.min(budgetSec, openingCap);
      band += '-opening';
    }

    return { budgetSec, usableSec, reserveSec, movesRemaining, capSec, band };
  }

  function getRemainingDelaySeconds(totalBudgetSec, engineElapsedSec) {
    const budget = Number.isFinite(totalBudgetSec) ? Math.max(0, totalBudgetSec) : 0;
    const elapsed = Number.isFinite(engineElapsedSec) ? Math.max(0, engineElapsedSec) : 0;
    return Math.max(0, budget - elapsed);
  }

  function classifyForcedPremove({
    isRecapture = false,
    opponentGapCp = 0,
    plausibleReplies = [],
    pseudoLegalCount = null,
  } = {}) {
    const replySet = new Set((plausibleReplies || []).filter(Boolean));
    const replyCountSafe = Number.isFinite(pseudoLegalCount) && pseudoLegalCount >= 1 && pseudoLegalCount <= 2;
    const opponentMoveForced = opponentGapCp >= 160;
    const unanimousReply = replySet.size === 1;
    const forcedResponse = opponentMoveForced && unanimousReply && replyCountSafe;
    const safeRecapture = !!isRecapture && (replyCountSafe || (opponentMoveForced && unanimousReply));
    const allowed = safeRecapture || forcedResponse;
    return {
      allowed,
      reason: allowed ? (isRecapture ? 'obvious-recapture' : 'forced-response') : 'not-forced',
    };
  }

  function calculateHumanComplexity({
    pvLines = [],
    side,
    fullmove = null,
    pieceCount = null,
    captureCount = 0,
    pseudoLegalCount = null,
  } = {}) {
    const scored = (Array.isArray(pvLines) ? pvLines : [])
      .map(line => ({ line, score: lineScoreForSide(line, side) }))
      .filter(item => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score);
    const best = scored[0]?.score ?? null;
    const second = scored[1]?.score ?? null;
    const gap = Number.isFinite(best) && Number.isFinite(second) ? Math.max(0, best - second) : 240;
    const closeScores = 1 - clamp(gap / 180, 0, 1);
    const validAlternatives = Number.isFinite(best)
      ? scored.filter(item => best - item.score <= 120).length
      : 1;
    const alternatives = clamp((validAlternatives - 1) / 3, 0, 1);

    const move = Number.isFinite(fullmove) ? fullmove : 20;
    let phase = move <= 10 ? 0.35 : move <= 30 ? 1 : move <= 45 ? 0.72 : 0.38;
    if (Number.isFinite(pieceCount) && pieceCount <= 10) phase *= 0.55;
    const captures = clamp(captureCount / Math.max(1, scored.length || pvLines.length || 1), 0, 1);
    const mateThreat = scored.some(({ line }) => Number.isFinite(line.mate) && Math.abs(line.mate) <= 8) ? 1 : 0;
    const onlyResponse = Number.isFinite(pseudoLegalCount) && pseudoLegalCount <= 1 ? 1 : 0;

    const complexity = clamp(
      (closeScores * 0.30) +
      (alternatives * 0.20) +
      (phase * 0.15) +
      (captures * 0.15) +
      (mateThreat * 0.12) +
      (onlyResponse * 0.08),
      0,
      1,
    );

    return {
      complexity,
      gapCp: gap,
      validAlternatives,
      phase,
      captureRatio: captures,
      mateThreat: !!mateThreat,
      onlyResponse: !!onlyResponse,
    };
  }

  function chooseWeighted(items, random) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    if (!(total > 0)) return items[0] || null;
    let cursor = clamp(Number(random()) || 0, 0, 0.999999999) * total;
    for (const item of items) {
      cursor -= item.weight;
      if (cursor < 0) return item;
    }
    return items[items.length - 1] || null;
  }

  function chooseHumanMove({
    moves = [],
    pvLines = [],
    side,
    complexity = 0,
    previousSuboptimal = false,
    random = Math.random,
  } = {}) {
    const uniqueMoves = Array.from(new Set((moves || []).filter(Boolean)));
    const scoreByMove = new Map();
    const mateByMove = new Map();
    for (const line of Array.isArray(pvLines) ? pvLines : []) {
      const move = line?.moves?.[0];
      const score = lineScoreForSide(line, side);
      if (move && Number.isFinite(score)) scoreByMove.set(move, score);
      if (move && Number.isFinite(line?.mate)) {
        mateByMove.set(move, side === 'w' ? line.mate : -line.mate);
      }
    }

    const ranked = uniqueMoves
      .map(move => ({ move, score: scoreByMove.get(move) }))
      .filter(item => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) {
      const move = uniqueMoves[0] || null;
      return { move, lossCp: 0, reason: move ? 'fallback' : 'no-move', suboptimal: false };
    }

    const best = ranked[0];
    const second = ranked[1] || null;
    const bestMate = mateByMove.get(best.move);
    const longWinningMate = Number.isFinite(bestMate) && bestMate > 6;
    if (ranked.length === 1) {
      return { move: best.move, lossCp: 0, reason: 'only-valid-move', suboptimal: false };
    }
    if (Number.isFinite(bestMate) && bestMate > 0 && bestMate <= 6) {
      return { move: best.move, lossCp: 0, reason: 'forced-mate', suboptimal: false };
    }
    if (second && !longWinningMate && best.score - second.score >= 180) {
      return { move: best.move, lossCp: 0, reason: 'large-eval-gap', suboptimal: false };
    }

    // A distant mate is not treated as a compulsory engine line. Compress its
    // artificial mate score so other safe continuations can still be sampled.
    const comparisonBestScore = longWinningMate && second
      ? second.score + clamp(80 - (bestMate * 3), 20, 60)
      : best.score;
    const winningClearly = comparisonBestScore >= 300;
    const maxLossCp = winningClearly ? 60 : 120;
    const eligible = ranked
      .map(item => ({
        ...item,
        lossCp: item.move === best.move ? 0 : Math.max(0, comparisonBestScore - item.score),
      }))
      .filter(item => item.lossCp <= maxLossCp);
    const temperature = 22 + (clamp(Number(complexity) || 0, 0, 1) * 48);
    const weighted = eligible.map(item => ({
      ...item,
      weight: Math.exp(-item.lossCp / temperature) *
        (previousSuboptimal && item.move === best.move ? 4 : 1),
    }));
    const picked = chooseWeighted(weighted, typeof random === 'function' ? random : Math.random) || weighted[0];
    return {
      move: picked.move,
      lossCp: picked.lossCp,
      reason: picked.move === best.move ? (previousSuboptimal ? 'recovery-best' : 'weighted-best') : 'weighted-alternative',
      suboptimal: picked.lossCp > 12,
      maxLossCp,
    };
  }

  return {
    calculateHumanComplexity,
    classifyForcedPremove,
    chooseHumanMove,
    computeHumanThinkBudget,
    estimateMovesRemaining,
    getClockCapSeconds,
    getHumanBaseDepth,
    getHumanDepth,
    getRemainingDelaySeconds,
    lineScoreForSide,
  };
});
