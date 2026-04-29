(function(){
  const CACHE = {};
  const CACHE_TTL = 5 * 60 * 1000;
  const panelByUsername = new Map();
  const injectedUsernameEls = new WeakSet();

  function now(){ return Date.now(); }
  function daysAgo(days){ return Math.floor((now() - days * 86400000) / 1000); }

  async function fetchJSON(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function cachedFetch(url) {
    if (CACHE[url] && now() - CACHE[url].ts < CACHE_TTL) return CACHE[url].data;
    const data = await fetchJSON(url);
    CACHE[url] = { ts: now(), data };
    return data;
  }

  async function getPlayerStats(username){ return cachedFetch(`https://api.chess.com/pub/player/${username}/stats`); }
  async function getPlayerProfile(username){ return cachedFetch(`https://api.chess.com/pub/player/${username}`); }
  async function getPlayerMonthArchives(username){
    const data = await cachedFetch(`https://api.chess.com/pub/player/${username}/games/archives`);
    return data.archives || [];
  }
  async function getGamesFromArchive(url){ try { const data = await cachedFetch(url); return data.games || []; } catch { return []; } }

  async function getRecentGames(username, days) {
    const archives = await getPlayerMonthArchives(username);
    const cutoff = daysAgo(days);
    const relevantArchives = archives.slice(-Math.min(3, archives.length));
    const allGames = [];
    for (const archiveUrl of relevantArchives) {
      const games = await getGamesFromArchive(archiveUrl);
      for (const g of games) if (g.end_time >= cutoff) allGames.push(g);
    }
    return allGames;
  }

  function calcWLR(games, username){
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

  function getPeakRating(stats){
    const modes = ['chess_rapid', 'chess_blitz', 'chess_bullet', 'chess_daily'];
    let peak = 0;
    let peakMode = '—';
    for (const mode of modes) {
      const best = stats?.[mode]?.best?.rating;
      if (best && best > peak) { peak = best; peakMode = mode.replace('chess_', ''); }
    }
    return { peak, peakMode };
  }

  function getCurrentRating(stats){
    const modes = ['chess_rapid', 'chess_blitz', 'chess_bullet'];
    const result = {};
    for (const mode of modes) {
      const last = stats?.[mode]?.last?.rating;
      if (last) result[mode.replace('chess_', '')] = last;
    }
    return result;
  }

  function makeDraggable(el) {
    if (typeof window.makeDraggable === 'function') return window.makeDraggable(el);
    const header = el.querySelector('.cse-header');
    if (!header) return;
    let startX, startY, startLeft, startTop;
    header.addEventListener('mousedown', e => {
      startX = e.clientX; startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      function onMove(ev){ el.style.left = (startLeft + ev.clientX - startX) + 'px'; el.style.top = (startTop + ev.clientY - startY) + 'px'; }
      function onUp(){ document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function createPanel(username){
    const panel = document.createElement('div');
    panel.className = 'cse-panel';
    panel.innerHTML = `
      <div class="cse-header">
        <span class="cse-title">♟ <a href="https://www.chess.com/member/${username}" target="_blank">${username}</a></span>
        <button class="cse-close" title="Chiudi">✕</button>
      </div>
      <div class="cse-loading"><div class="cse-spinner"></div><span>Caricamento statistiche...</span></div>
      <div class="cse-content" style="display:none"></div>
    `;
    panel.querySelector('.cse-close').addEventListener('click', () => { panelByUsername.delete(username); panel.remove(); });
    document.body.appendChild(panel);
    makeDraggable(panel);
    panelByUsername.set(username, panel);
    return panel;
  }

  function renderStats(panel, username, stats1, stats7, stats30, playerStats){
    const { peak, peakMode } = getPeakRating(playerStats);
    const currentRatings = getCurrentRating(playerStats);
    const ratingHTML = Object.entries(currentRatings).map(([mode, rating]) => `<span class="cse-badge">${mode}: <b>${rating}</b></span>`).join('');
    const peakHTML = peak > 0 ? `<span class="cse-badge cse-peak">🏆 Peak ${peakMode}: <b>${peak}</b></span>` : '';
    const periodRow = (label, data) => {
      const pct = data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0;
      return `<tr><td class="cse-period">${label}</td><td class="cse-w">✅ ${data.wins}</td><td class="cse-l">❌ ${data.losses}</td><td class="cse-d">🤝 ${data.draws}</td><td class="cse-wlr">${data.wlr}</td><td class="cse-pct">${data.total > 0 ? pct + '%' : '—'}</td></tr>`;
    };
    const content = panel.querySelector('.cse-content');
    content.innerHTML = `
      <div class="cse-ratings">${ratingHTML}${peakHTML}</div>
      <table class="cse-table"><thead><tr><th>Periodo</th><th title="Vittorie">✅</th><th title="Sconfitte">❌</th><th title="Patte">🤝</th><th title="Win/Loss Ratio">WLR</th><th title="Win Rate">Win%</th></tr></thead><tbody>${periodRow('1 giorno', stats1)}${periodRow('7 giorni', stats7)}${periodRow('30 giorni', stats30)}</tbody></table>
      <div class="cse-footer">Dati via chess.com API · <span class="cse-time">${new Date().toLocaleTimeString('it-IT')}</span></div>
    `;
    panel.querySelector('.cse-loading').style.display = 'none';
    content.style.display = 'block';
  }

  function renderError(panel, message){ panel.querySelector('.cse-loading').innerHTML = `<span class="cse-error">⚠️ ${message}</span>`; }

  async function loadStatsForUser(username){
    const existingPanel = panelByUsername.get(username);
    if (existingPanel) { existingPanel.remove(); panelByUsername.delete(username); }
    const panel = createPanel(username);
    try {
      const [playerStats, games30] = await Promise.all([getPlayerStats(username), getRecentGames(username, 30)]);
      const cutoff7 = daysAgo(7), cutoff1 = daysAgo(1);
      const games7 = games30.filter(g => g.end_time >= cutoff7);
      const games1 = games30.filter(g => g.end_time >= cutoff1);
      renderStats(panel, username, calcWLR(games1, username), calcWLR(games7, username), calcWLR(games30, username), playerStats);
    } catch (err) {
      renderError(panel, `Impossibile caricare le stats per "${username}"`);
      console.error('[ChessStats]', err);
    }
  }

  function safeRate(wins, losses, draws){ const total = (wins || 0) + (losses || 0) + (draws || 0); return total ? (wins || 0) / total : 0; }
  function confidenceFromGames(totalGames){ if (totalGames >= 120) return 1; if (totalGames >= 60) return 0.75; if (totalGames >= 25) return 0.5; if (totalGames >= 10) return 0.3; return 0.15; }
  function parseAccuracyValue(raw){ const n = typeof raw === 'number' ? raw : parseFloat(raw); return Number.isFinite(n) ? n : null; }
  function extractGameAccuracyForUser(game, username){
    const user = (username || '').toLowerCase();
    const whiteName = (game?.white?.username || '').toLowerCase();
    const isWhite = whiteName === user;
    const key = isWhite ? 'white' : 'black';
    const acc = parseAccuracyValue(game?.accuracies?.[key]);
    const rating = parseInt(isWhite ? game?.white?.rating : game?.black?.rating, 10);
    return { acc, rating: Number.isFinite(rating) ? rating : null };
  }

  function computeCheaterScore(analysis){
    let points = 0; const reasons = [];
    if (analysis.accountAgeDays < 30) { points += 20; reasons.push('Account recente (<30 giorni)'); }
    else if (analysis.accountAgeDays < 90) { points += 10; reasons.push('Account giovane (<90 giorni)'); }
    if (analysis.maxWinRate30 >= 0.7) { points += 30 * analysis.winrateConfidence; reasons.push('Winrate 30g molto alto (>70%)'); }
    else if (analysis.maxWinRate30 >= 0.55) { points += 15 * analysis.winrateConfidence; reasons.push('Winrate 30g alto (>55%)'); }
    if (analysis.games30 >= 100 && analysis.maxWinRate30 >= 0.55) { points += 20; reasons.push('Alto volume + winrate alto'); }
    else if (analysis.games30 >= 60 && analysis.maxWinRate30 >= 0.55) { points += 12; reasons.push('Volume significativo + winrate alto'); }
    if (analysis.highAccuracyRatio >= 0.6 && analysis.accuracyGames >= 20) { points += 30; reasons.push('Alta accuracy frequente'); }
    else if (analysis.highAccuracyRatio >= 0.45 && analysis.accuracyGames >= 10) { points += 18; reasons.push('Accuracy elevata spesso'); }
    return { score: Math.max(1, Math.min(100, Math.round(points))), reasons };
  }

  async function buildCheaterAnalysis(username){
    const [profile, stats, games30] = await Promise.all([getPlayerProfile(username), getPlayerStats(username), getRecentGames(username, 30)]);
    const joinedSec = parseInt(profile?.joined, 10);
    const accountAgeDays = Number.isFinite(joinedSec) ? Math.max(0, Math.floor((now() - joinedSec * 1000) / 86400000)) : 9999;
    const modes = ['chess_rapid', 'chess_blitz', 'chess_bullet'];
    const totalRates = {}, recentRates = {};
    let maxWinRateTotal = 0, maxWinRate30 = 0, recentGamesCounted = 0;
    for (const mode of modes) {
      const modeKey = mode.replace('chess_', '');
      const rec = stats?.[mode]?.record || {};
      totalRates[modeKey] = safeRate(rec.win, rec.loss, rec.draw);
      if (totalRates[modeKey] > maxWinRateTotal) maxWinRateTotal = totalRates[modeKey];
      const modeGames30 = games30.filter(g => (g.time_class || '').toLowerCase() === modeKey);
      const wlr = calcWLR(modeGames30, username);
      const wr = safeRate(wlr.wins, wlr.losses, wlr.draws);
      recentRates[modeKey] = { rate: wr, games: wlr.total };
      recentGamesCounted += wlr.total;
      if (wlr.total >= 8 && wr > maxWinRate30) maxWinRate30 = wr;
    }
    if (maxWinRate30 === 0) maxWinRate30 = Math.max(recentRates.rapid?.rate || 0, recentRates.blitz?.rate || 0, recentRates.bullet?.rate || 0);
    let highAccuracyGames = 0, accuracyGames = 0;
    for (const game of games30) {
      const { acc, rating } = extractGameAccuracyForUser(game, username);
      if (acc === null) continue;
      accuracyGames++;
      const threshold = rating !== null && rating >= 1500 ? 90 : 80;
      if (acc >= threshold) highAccuracyGames++;
    }
    const highAccuracyRatio = accuracyGames ? highAccuracyGames / accuracyGames : 0;
    const winrateConfidence = confidenceFromGames(recentGamesCounted || games30.length);
    const analysis = { username, accountAgeDays, games30: games30.length, maxWinRateTotal, maxWinRate30, winrateConfidence, totalRates, recentRates, accuracyGames, highAccuracyGames, highAccuracyRatio };
    return { ...analysis, ...computeCheaterScore(analysis) };
  }

  function ensureCheaterFinderPanel(){
    let panel = document.getElementById('cse-cheater-panel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'cse-cheater-panel';
    panel.className = 'cse-panel';
    panel.style.right = '20px';
    panel.style.top = '140px';
    panel.innerHTML = `<div class="cse-header"><span class="cse-title">Cheater Finder</span><button class="cse-close" title="Chiudi">✕</button></div><div class="cse-content" style="display:block;padding:10px;"><div id="cse-cheater-body">In attesa utente...</div></div>`;
    panel.querySelector('.cse-close').addEventListener('click', () => panel.remove());
    document.body.appendChild(panel);
    makeDraggable(panel);
    return panel;
  }

  function renderCheaterFinderText(html){
    const panel = ensureCheaterFinderPanel();
    const body = panel.querySelector('#cse-cheater-body');
    if (body) body.innerHTML = html;
  }

  async function loadCheaterForUser(username){
    if (!username) return;
    renderCheaterFinderText(`Analisi <b>${username}</b> in corso...`);
    try {
      const report = await buildCheaterAnalysis(username);
      const pct = (v) => `${Math.round(v * 100)}%`;
      const level = report.score >= 75 ? 'ALTO' : report.score >= 50 ? 'MEDIO' : 'BASSO';
      const reasons = report.reasons.length ? report.reasons.join(' · ') : 'Nessun segnale forte';
      renderCheaterFinderText(`<div><b>${username}</b> · Score: <b>${report.score}/100</b> (${level})</div><div>Account age: <b>${report.accountAgeDays}g</b></div><div>Winrate 30g max: <b>${pct(report.maxWinRate30)}</b></div><div>Volume 30g: <b>${report.games30}</b> partite</div><div>Accuracy alta: <b>${report.highAccuracyGames}/${report.accuracyGames || 0}</b> (${pct(report.highAccuracyRatio)})</div><div style="margin-top:6px;opacity:.85;">${reasons}</div>`);
    } catch (err) {
      renderCheaterFinderText(`Errore analisi per <b>${username}</b>.`);
      console.error('[CheaterFinder]', err);
    }
  }

  function extractUsername(el){
    const user = el.dataset.username || el.dataset.user || el.getAttribute('data-player-username');
    if (user) {
      const clean = String(user).trim().toLowerCase();
      if (/^[a-z0-9_][a-z0-9_-]{1,24}$/.test(clean)) return clean;
    }
    const raw = (el.textContent || '').trim().toLowerCase();
    const m = raw.match(/[a-z0-9_][a-z0-9_-]{1,24}/);
    return m ? m[0] : null;
  }

  function addButtons(usernameEl, username){
    if (!username || injectedUsernameEls.has(usernameEl)) return;
    injectedUsernameEls.add(usernameEl);
    const btnStats = document.createElement('button');
    btnStats.className = 'cse-btn';
    btnStats.title = `Mostra statistiche di ${username}`;
    btnStats.textContent = '📈';
    btnStats.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); loadStatsForUser(username); });

    const btnCheater = document.createElement('button');
    btnCheater.className = 'cse-btn';
    btnCheater.style.right = '32px';
    btnCheater.title = `Analizza cheating di ${username}`;
    btnCheater.textContent = '🕵️';
    btnCheater.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); loadCheaterForUser(username); });

    usernameEl.style.position = 'relative';
    usernameEl.appendChild(btnStats);
    usernameEl.appendChild(btnCheater);
  }

  function scanAndInject(){
    const selectors = ['[data-username]', '.user-username-component', '.player-tagline-username', '.cc-user-display-name', '.username', '.game-over-username-component', '.lobby-player-username', '.opponents-username'];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const username = extractUsername(el);
        if (username) addButtons(el, username);
      });
    }
  }

  window.CSEStatsCheater = { scanAndInject };
})();
