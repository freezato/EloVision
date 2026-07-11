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
      if (e.target.classList.contains('cse-close')) return;
      startX = e.clientX; startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      el.style.right = 'auto';
      function onMove(ev){ el.style.left = (startLeft + ev.clientX - startX) + 'px'; el.style.top = (startTop + ev.clientY - startY) + 'px'; }
      function onUp(){ document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  const BOLT_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  const TROPHY_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1h2"/><path d="M18 9h2a2 2 0 0 0 2-2V5a1 1 0 0 0-1-1h-2"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V4H6v5z"/></svg>`;
  const USER_SVG = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const TARGET_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;

  function createPanel(username){
    const panel = document.createElement('div');
    panel.className = 'cse-panel';
    panel.innerHTML = `
      <div class="cse-header">
        <div class="cse-header-left">
          <div class="cse-avatar-icon">${USER_SVG}</div>
          <span class="cse-title"><a href="https://www.chess.com/member/${username}" target="_blank">${username}</a></span>
        </div>
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

    const modeLabel = { rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet' };
    const ratingHTML = Object.entries(currentRatings).map(([mode, rating]) =>
      `<span class="cse-badge"><span class="cse-badge-bolt">${BOLT_SVG}</span>${modeLabel[mode] || mode}: <b>${rating}</b></span>`
    ).join('');
    const peakHTML = peak > 0
      ? `<span class="cse-badge cse-peak"><span class="cse-badge-trophy">${TROPHY_SVG}</span>Peak ${peakMode}: <b>${peak}</b></span>`
      : '';

    const periodRow = (label, data) => {
      const pct = data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0;
      const wlrColor = parseFloat(data.wlr) >= 1.5 ? 'cse-wlr-high' : parseFloat(data.wlr) >= 1 ? 'cse-wlr-mid' : '';
      const pctColor = pct >= 55 ? 'cse-pct-high' : pct >= 50 ? 'cse-pct-mid' : 'cse-pct-low';
      return `<tr>
        <td class="cse-period">${label}</td>
        <td class="cse-w"><span class="cse-icon-check">✔</span> ${data.wins}</td>
        <td class="cse-l"><span class="cse-icon-x">✘</span> ${data.losses}</td>
        <td class="cse-d"><span class="cse-icon-shield">🛡</span> ${data.draws}</td>
        <td class="cse-wlr ${wlrColor}">${data.wlr}</td>
        <td class="cse-pct ${pctColor}">${data.total > 0 ? pct + '%' : '—'}</td>
      </tr>`;
    };

    const content = panel.querySelector('.cse-content');
    content.innerHTML = `
      <div class="cse-ratings">${ratingHTML}${peakHTML}</div>
      <table class="cse-table">
        <thead>
          <tr>
            <th>PERIODO</th>
            <th title="Vittorie"><span class="cse-th-win">✔</span></th>
            <th title="Sconfitte"><span class="cse-th-loss">✘</span></th>
            <th title="Patte"><span class="cse-th-draw">🛡</span></th>
            <th title="Win/Loss Ratio">WLR</th>
            <th title="Win Rate">WIN%</th>
          </tr>
        </thead>
        <tbody>
          ${periodRow('1 giorno', stats1)}
          ${periodRow('7 giorni', stats7)}
          ${periodRow('30 giorni', stats30)}
        </tbody>
      </table>
      <div class="cse-footer">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>
        Dati via chess.com API · <span class="cse-time">${new Date().toLocaleTimeString('it-IT')}</span>
      </div>
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
      renderStatsAnimated(panel, username, calcWLR(games1, username), calcWLR(games7, username), calcWLR(games30, username), playerStats);
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

  function buildRadarSVG(score) {
    // score 0-100, draw a simple radar/circle fill
    const cx = 70, cy = 70, r = 52;
    const pct = Math.min(1, score / 100);
    const sides = 6;
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i / sides) - Math.PI / 2;
      const rx = cx + r * pct * Math.cos(angle);
      const ry = cy + r * pct * Math.sin(angle);
      points.push(`${rx},${ry}`);
    }
    // grid lines
    const grids = [0.33, 0.66, 1].map(frac => {
      const gpts = [];
      for (let i = 0; i < sides; i++) {
        const angle = (Math.PI * 2 * i / sides) - Math.PI / 2;
        gpts.push(`${cx + r * frac * Math.cos(angle)},${cy + r * frac * Math.sin(angle)}`);
      }
      return `<polygon points="${gpts.join(' ')}" fill="none" stroke="rgba(138,92,200,0.18)" stroke-width="1"/>`;
    }).join('');
    // spokes
    const spokes = Array.from({length: sides}, (_, i) => {
      const angle = (Math.PI * 2 * i / sides) - Math.PI / 2;
      return `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(angle)}" y2="${cy + r * Math.sin(angle)}" stroke="rgba(138,92,200,0.15)" stroke-width="1"/>`;
    }).join('');
    // filled polygon
    const fillPoly = `<polygon points="${points.join(' ')}" fill="rgba(138,92,200,0.35)" stroke="rgba(168,112,230,0.8)" stroke-width="1.5"/>`;
    // skull icon in center (simplified)
    const skull = `<circle cx="${cx}" cy="${cy}" r="18" fill="rgba(30,20,50,0.9)" stroke="rgba(138,92,200,0.5)" stroke-width="1.5"/>
      <text x="${cx}" y="${cy+6}" text-anchor="middle" font-size="18" fill="rgba(160,120,220,0.9)">☠</text>`;
    return `<svg width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r+4}" fill="rgba(20,10,40,0.5)"/>
      ${grids}${spokes}${fillPoly}${skull}
    </svg>`;
  }

  function ensureCheaterFinderPanel(){
    let panel = document.getElementById('cse-cheater-panel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'cse-cheater-panel';
    panel.className = 'cse-panel cse-cheater-panel';
    panel.style.right = '420px';
    panel.style.top = '80px';
    panel.innerHTML = `
      <div class="cse-header cse-cheater-header">
        <div class="cse-header-left">
          <div class="cse-cheater-icon-wrap">${TARGET_SVG}</div>
          <span class="cse-title cse-cheater-title">Cheater Finder</span>
        </div>
        <button class="cse-close" title="Chiudi">✕</button>
      </div>
      <div class="cse-content cse-cheater-content" style="display:block;padding:14px 16px;">
        <div id="cse-cheater-body" class="cse-cheater-waiting">In attesa utente...</div>
      </div>
    `;
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
    renderCheaterFinderTextAnimated(`<div class="cse-cheater-loading"><div class="cse-spinner"></div><span>Analisi <b>${username}</b>...</span></div>`);
    try {
      const report = await buildCheaterAnalysis(username);
      const pct = (v) => `${Math.round(v * 100)}%`;
      const level = report.score >= 75 ? 'ALTO' : report.score >= 50 ? 'MEDIO' : 'BASSO';
      const levelClass = report.score >= 75 ? 'cse-level-alto' : report.score >= 50 ? 'cse-level-medio' : 'cse-level-basso';
      const reasons = report.reasons.length ? report.reasons : ['Nessun segnale forte'];

      const radarSVG = buildRadarSVG(report.score);

      const reasonsHTML = reasons.map(r =>
        `<span class="cse-reason-pill"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>${r}</span>`
      ).join(' · ');

      const CAL_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
      const TREND_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
      const BAR_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
      const AIM_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;

      renderCheaterFinderTextAnimated(`
        <div class="cse-cheater-body-inner">
          <div class="cse-cheater-radar">${radarSVG}</div>
          <div class="cse-cheater-info">
            <div class="cse-cheater-username-score">
              <span class="cse-cheater-uname">${username}</span>
              <span class="cse-cheater-dot">·</span>
              <span class="cse-cheater-score-label">Score: <b class="cse-score-val">${report.score}/100</b></span>
              <span class="cse-level-badge ${levelClass}">${level}</span>
            </div>
            <div class="cse-cheater-stats-list">
              <div class="cse-cf-stat">${CAL_SVG} Account age: <b>${report.accountAgeDays}g</b></div>
              <div class="cse-cf-stat">${TREND_SVG} Winrate 30g max: <b>${pct(report.maxWinRate30)}</b></div>
              <div class="cse-cf-stat">${BAR_SVG} Volume 30g: <b>${report.games30}</b> partite</div>
              <div class="cse-cf-stat">${AIM_SVG} Accuracy alta: <b>${report.highAccuracyGames}/${report.accuracyGames || 0}</b> (${pct(report.highAccuracyRatio)})</div>
            </div>
          </div>
        </div>
        <div class="cse-cheater-reasons">${reasonsHTML}</div>
      `);
    } catch (err) {
      renderCheaterFinderText(`<span class="cse-error">Errore analisi per <b>${username}</b>.</span>`);
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

  /* ── Animation helpers ──────────────────────────────────────── */

  // Animate a numeric text node counting up from 0 to final value
  function animateCount(el, target, duration = 600, suffix = '') {
    if (!el || isNaN(target)) return;
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (target - from) * ease) + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target + suffix;
    }
    requestAnimationFrame(tick);
  }

  // Run countup on all stat numbers inside a given container
  function runCountAnimations(container) {
    if (!container) return;
    // Table: wins, losses, draws, wlr, pct
    container.querySelectorAll('.cse-w, .cse-l, .cse-d').forEach(td => {
      const match = td.textContent.match(/(\d+)/);
      if (!match) return;
      const num = parseInt(match[1], 10);
      const icon = td.querySelector('span');
      const iconHTML = icon ? icon.outerHTML + ' ' : '';
      td.innerHTML = iconHTML + '<span class="cse-count-val">' + num + '</span>';
      const span = td.querySelector('.cse-count-val');
      animateCount(span, num, 700 + Math.random() * 200);
    });

    // WLR and WIN% cells
    container.querySelectorAll('.cse-wlr').forEach(td => {
      const raw = td.textContent.trim();
      if (raw === '—' || raw === '∞') return;
      const num = parseFloat(raw);
      if (isNaN(num)) return;
      const start = performance.now();
      const dur = 800;
      function tick(now) {
        const t = Math.min((now - start) / dur, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        td.textContent = (num * ease).toFixed(2);
        if (t < 1) requestAnimationFrame(tick);
        else td.textContent = raw;
      }
      requestAnimationFrame(tick);
    });

    container.querySelectorAll('.cse-pct').forEach(td => {
      const raw = td.textContent.trim();
      if (raw === '—') return;
      const num = parseInt(raw);
      if (isNaN(num)) return;
      const span = document.createElement('span');
      span.textContent = '0%';
      td.textContent = '';
      td.appendChild(span);
      animateCount(span, num, 750, '%');
    });

    // Cheater score
    const scoreEl = container.querySelector('.cse-score-val');
    if (scoreEl) {
      const match = scoreEl.textContent.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        scoreEl.textContent = '0/100';
        const s = performance.now();
        const dur = 900;
        function tickScore(now) {
          const t = Math.min((now - s) / dur, 1);
          const ease = 1 - Math.pow(1 - t, 3);
          scoreEl.textContent = Math.round(num * ease) + '/100';
          if (t < 1) requestAnimationFrame(tickScore);
          else scoreEl.textContent = num + '/100';
        }
        requestAnimationFrame(tickScore);
      }
    }

    // Account age, volume, accuracy counts
    container.querySelectorAll('.cse-cf-stat b').forEach(b => {
      const raw = b.textContent.trim();
      const match = raw.match(/^(\d+)/);
      if (!match) return;
      const num = parseInt(match[1]);
      const suffix = raw.slice(match[1].length);
      b.textContent = '0' + suffix;
      animateCount(b, num, 700, suffix);
    });
  }

  // Patch renderStats to trigger countup after DOM insert
  const _origRenderStats = renderStats;
  function renderStatsAnimated(panel, username, s1, s7, s30, playerStats) {
    _origRenderStats(panel, username, s1, s7, s30, playerStats);
    // Small delay to let the DOM paint first
    setTimeout(() => runCountAnimations(panel.querySelector('.cse-content')), 80);
  }

  // Patch renderCheaterFinderText to trigger countup after final result
  const _origRenderCheaterText = renderCheaterFinderText;
  function renderCheaterFinderTextAnimated(html) {
    _origRenderCheaterText(html);
    const panel = document.getElementById('cse-cheater-panel');
    if (!panel) return;
    // Only run countup when body has the full result layout
    if (html && html.includes('cse-cheater-body-inner')) {
      setTimeout(() => runCountAnimations(panel.querySelector('#cse-cheater-body')), 80);
      // Animate radar polygon drawing
      setTimeout(() => animateRadarPolygon(panel), 100);
    }
  }

  // Animate radar polygon fill from 0 to final
  function animateRadarPolygon(container) {
    const svg = container && container.querySelector('.cse-cheater-radar svg');
    if (!svg) return;
    const poly = svg.querySelector('polygon:last-of-type');
    if (!poly) return;
    const finalPoints = poly.getAttribute('points');
    if (!finalPoints) return;
    const cx = 70, cy = 70;
    // Parse target points
    const pts = finalPoints.trim().split(' ').map(p => {
      const [x, y] = p.split(',').map(Number);
      return { x, y };
    });
    const start = performance.now();
    const dur = 900;
    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const animated = pts.map(p => {
        const nx = cx + (p.x - cx) * ease;
        const ny = cy + (p.y - cy) * ease;
        return `${nx.toFixed(2)},${ny.toFixed(2)}`;
      });
      poly.setAttribute('points', animated.join(' '));
      if (t < 1) requestAnimationFrame(tick);
      else poly.setAttribute('points', finalPoints);
    }
    // Start with zero-sized polygon
    const zeroPts = pts.map(() => `${cx},${cy}`).join(' ');
    poly.setAttribute('points', zeroPts);
    requestAnimationFrame(tick);
  }

  window.CSEStatsCheater = { scanAndInject };

  // Override with animated versions (defined after the original functions)
  window._cseRenderStats = renderStatsAnimated;
  window._cseRenderCheaterText = renderCheaterFinderTextAnimated;
})();
