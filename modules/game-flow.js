(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CSEGameFlow = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    acceptDraws: true,
    offerDraws: true,
    autoResign: true,
    acceptRematches: true,
    drawThresholdCp: 35,
    resignThresholdCp: 650,
    stableSeconds: 8,
    lowTimeProtectionSec: 12,
    maxRematches: 2,
  });

  const clampInt = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
  };

  function normalizeSettings(value = {}) {
    return {
      acceptDraws: value.acceptDraws !== false,
      offerDraws: value.offerDraws !== false,
      autoResign: value.autoResign !== false,
      acceptRematches: value.acceptRematches !== false,
      drawThresholdCp: clampInt(value.drawThresholdCp, DEFAULTS.drawThresholdCp, 0, 300),
      resignThresholdCp: clampInt(value.resignThresholdCp, DEFAULTS.resignThresholdCp, 200, 2000),
      stableSeconds: clampInt(value.stableSeconds, DEFAULTS.stableSeconds, 2, 30),
      lowTimeProtectionSec: clampInt(value.lowTimeProtectionSec, DEFAULTS.lowTimeProtectionSec, 0, 60),
      maxRematches: clampInt(value.maxRematches, DEFAULTS.maxRematches, 0, 10),
    };
  }

  function getPlayerEvaluation(result, playerSide) {
    if (!result || (playerSide !== 'w' && playerSide !== 'b')) return { cp: null, mate: null };
    const sign = playerSide === 'w' ? 1 : -1;
    return {
      cp: Number.isFinite(result.cp) ? Math.round(result.cp * sign) : null,
      mate: Number.isFinite(result.mate) ? Math.trunc(result.mate * sign) : null,
    };
  }

  function formatEval(cp) {
    if (!Number.isFinite(cp)) return '?';
    const pawns = cp / 100;
    return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`;
  }

  function decideDrawResponse({ playerCp = null, playerMate = null, settings = DEFAULTS } = {}) {
    const cfg = normalizeSettings(settings);
    if (!cfg.acceptDraws) return { action: 'wait', reason: 'Gestione offerte di patta disattivata' };
    if (Number.isFinite(playerMate)) {
      return playerMate > 0
        ? { action: 'decline', reason: `Patta rifiutata: matto favorevole in ${Math.abs(playerMate)}` }
        : { action: 'accept', reason: `Patta accettata: matto avversario in ${Math.abs(playerMate)}` };
    }
    if (!Number.isFinite(playerCp)) return { action: 'wait', reason: 'Patta in attesa: valutazione non disponibile' };
    if (playerCp > cfg.drawThresholdCp) {
      return { action: 'decline', reason: `Patta rifiutata: vantaggio ${formatEval(playerCp)}` };
    }
    if (playerCp < -cfg.drawThresholdCp) {
      return { action: 'accept', reason: `Patta accettata: svantaggio ${formatEval(playerCp)}` };
    }
    return { action: 'accept', reason: `Patta accettata: posizione equilibrata ${formatEval(playerCp)}` };
  }

  function classifyLosingEvaluation({ playerCp = null, playerMate = null, settings = DEFAULTS } = {}) {
    const cfg = normalizeSettings(settings);
    if (Number.isFinite(playerMate)) {
      if (playerMate < 0) return { losing: true, reason: `matto avversario in ${Math.abs(playerMate)}` };
      return { losing: false, reason: 'matto favorevole' };
    }
    if (!Number.isFinite(playerCp)) return { losing: false, reason: 'valutazione non disponibile' };
    return playerCp <= -cfg.resignThresholdCp
      ? { losing: true, reason: `svantaggio ${formatEval(playerCp)}` }
      : { losing: false, reason: `valutazione ${formatEval(playerCp)}` };
  }

  function decideResign({
    playerCp = null,
    playerMate = null,
    stableForMs = 0,
    confirmations = 0,
    opponentClockSec = null,
    settings = DEFAULTS,
  } = {}) {
    const cfg = normalizeSettings(settings);
    if (!cfg.autoResign) return { action: 'hold', reason: 'Abbandono automatico disattivato' };
    const losing = classifyLosingEvaluation({ playerCp, playerMate, settings: cfg });
    if (!losing.losing) return { action: 'hold', reason: `Nessun abbandono: ${losing.reason}` };
    if (Number.isFinite(opponentClockSec) && opponentClockSec <= cfg.lowTimeProtectionSec) {
      return { action: 'hold', reason: `Nessun abbandono: avversario a ${opponentClockSec.toFixed(1)}s` };
    }
    if (confirmations < 2 || stableForMs < cfg.stableSeconds * 1000) {
      const elapsed = Math.max(0, stableForMs / 1000).toFixed(1);
      return { action: 'wait', reason: `Conferma abbandono: ${losing.reason}, stabile ${elapsed}s` };
    }
    return { action: 'resign', reason: `Abbandono: ${losing.reason}, confermato ${confirmations} volte` };
  }

  function decideDrawOffer({
    repetitionCount = 0,
    halfmoveClock = 0,
    pieceCount = null,
    playerCp = null,
    playerMate = null,
    alreadyOffered = false,
    settings = DEFAULTS,
  } = {}) {
    const cfg = normalizeSettings(settings);
    if (!cfg.offerDraws || alreadyOffered) return { action: 'hold', reason: 'Nessuna offerta di patta' };
    if (Number.isFinite(playerMate)) return { action: 'hold', reason: 'Nessuna patta: sequenza di matto' };
    if (repetitionCount >= 2) return { action: 'offer', reason: 'Patta proposta: ripetizione imminente' };
    const fortressLike = Number.isFinite(pieceCount) && pieceCount <= 8
      && Number.isFinite(halfmoveClock) && halfmoveClock >= 30
      && Number.isFinite(playerCp) && Math.abs(playerCp) <= cfg.drawThresholdCp;
    if (fortressLike) return { action: 'offer', reason: 'Patta proposta: finale bloccato ed equilibrato' };
    return { action: 'hold', reason: 'Nessuna offerta di patta' };
  }

  function decideRematch({ acceptedCount = 0, settings = DEFAULTS } = {}) {
    const cfg = normalizeSettings(settings);
    if (!cfg.acceptRematches) return { action: 'decline', reason: 'Rivincita ignorata: opzione disattivata' };
    if (acceptedCount >= cfg.maxRematches) {
      return { action: 'decline', reason: `Rivincita ignorata: limite ${cfg.maxRematches} raggiunto` };
    }
    return { action: 'accept', reason: `Rivincita accettata: ${acceptedCount + 1}/${cfg.maxRematches}` };
  }

  function getRepetitionKey(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    return parts.length >= 4 ? parts.slice(0, 4).join(' ') : null;
  }

  function getHalfmoveClock(fen) {
    const value = Number(String(fen || '').trim().split(/\s+/)[4]);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  return {
    DEFAULTS,
    normalizeSettings,
    getPlayerEvaluation,
    decideDrawResponse,
    classifyLosingEvaluation,
    decideResign,
    decideDrawOffer,
    decideRematch,
    getRepetitionKey,
    getHalfmoveClock,
  };
});
