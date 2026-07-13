'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const flow = require(path.join(ROOT, 'modules', 'game-flow.js'));
const core = fs.readFileSync(path.join(ROOT, 'modules', 'core-main.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

test('GameFlow is loaded before core and exposed as a persisted GUI module', () => {
  const scripts = manifest.content_scripts[0].js;
  assert.ok(scripts.indexOf('modules/game-flow.js') < scripts.indexOf('modules/core-main.js'));
  assert.match(core, /GameFlow: !!isGameFlowEnabled/);
  assert.match(core, /id: 'GameFlow', label: 'GameFlow'/);
  assert.match(core, /startGameFlowTicker\(\)/);
  assert.match(core, /if \(!isGuiHudEnabled && !isGameFlowEnabled\)/);
  assert.match(core, /isGuiHudEnabled \? getActiveModuleHudEntries\(\) : \[getGameFlowHudEntry\(\)\]/);
  assert.match(core, /if \(isGameFlowEnabled\) entries\.push\(getGameFlowHudEntry\(\)\)/);
});

test('draw responses accept equal or worse positions and decline winning ones', () => {
  assert.equal(flow.decideDrawResponse({ playerCp: 20 }).action, 'accept');
  assert.equal(flow.decideDrawResponse({ playerCp: -400 }).action, 'accept');
  assert.equal(flow.decideDrawResponse({ playerCp: 80 }).action, 'decline');
  assert.equal(flow.decideDrawResponse({ playerMate: -3 }).action, 'accept');
  assert.equal(flow.decideDrawResponse({ playerMate: 4 }).action, 'decline');
});

test('resign requires stable confirmations and is blocked by opponent low time', () => {
  const base = { playerCp: -900, confirmations: 2, stableForMs: 9000 };
  assert.equal(flow.decideResign(base).action, 'resign');
  assert.equal(flow.decideResign({ ...base, confirmations: 1 }).action, 'wait');
  assert.equal(flow.decideResign({ ...base, stableForMs: 1000 }).action, 'wait');
  assert.equal(flow.decideResign({ ...base, opponentClockSec: 8 }).action, 'hold');
});

test('draw offers cover repetition and quiet fortress-like endings', () => {
  assert.equal(flow.decideDrawOffer({ repetitionCount: 2, playerCp: 0 }).action, 'offer');
  assert.equal(flow.decideDrawOffer({ pieceCount: 7, halfmoveClock: 35, playerCp: 10 }).action, 'offer');
  assert.equal(flow.decideDrawOffer({ pieceCount: 12, halfmoveClock: 35, playerCp: 10 }).action, 'hold');
  assert.equal(flow.getRepetitionKey('8/8/8/8/8/8/8/K6k w - - 33 70'), '8/8/8/8/8/8/8/K6k w - -');
});

test('rematches stop at the configured session limit', () => {
  assert.equal(flow.decideRematch({ acceptedCount: 0, settings: { maxRematches: 2 } }).action, 'accept');
  assert.equal(flow.decideRematch({ acceptedCount: 2, settings: { maxRematches: 2 } }).action, 'decline');
});

test('AutoMove timing stays in the top-right HUD and mode colors are explicit', () => {
  assert.doesNotMatch(core, /cse-mc-mode-badge[^\n]*cse-mc-timer[^\n]*cse-mc-timer-automove/);
  assert.match(core, /cse-gui-hud-timer/);
  assert.match(core, /getAutomoveModeCssClass/);
  assert.match(css, /cse-mode-legit[\s\S]*?#f2c94c/);
  assert.match(css, /cse-mode-blatant[\s\S]*?#ff5f62/);
});

test('the main GUI saves, restores and clamps its dragged position', () => {
  assert.match(core, /guiPosition: guiRect/);
  assert.match(core, /function getSavedGuiPosition\(\)/);
  assert.match(core, /const savedPosition = getSavedGuiPosition\(\)/);
  assert.match(core, /clampToViewport\(modal, savedPosition\.left, savedPosition\.top\)/);
  assert.match(core, /function closeToolsGui\(\)[\s\S]*?cseSaveState\(\);[\s\S]*?toolsModal = null/);
});
