'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(ROOT, 'modules', 'core-main.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

test('Blockcraft uses a dedicated modal utility-client renderer', () => {
  assert.match(core, /function cseRenderBlockcraftGui\(modal, allMods\)/);
  assert.match(core, /cse-bc-theme-plaque/);
  assert.match(core, /cse-bc-sidebar/);
  assert.match(core, /cse-bc-filters/);
  assert.match(core, /cse-bc-cards/);
  assert.match(css, /#cse-mc-gui\.cse-blockcraft-window/);
});

test('Blockcraft renders every available module', () => {
  for (const id of ['AutoMove', 'PuzzleRush', 'AutoPlay', 'GameFlow', 'ToxicChat', 'GameInsights', 'SuggestMove', 'EvaluationBar', 'GUI']) {
    assert.match(core, new RegExp(`${id}: \\[`));
  }
  assert.doesNotMatch(core, /Cheater Finder/);
});

test('Blockcraft module settings reuse the real persisted controls', () => {
  assert.match(core, /function cseBlockcraftSettingsMarkup\(modId\)/);
  for (const control of [
    'cse-sp-maia-elo',
    'cse-sp-dmin',
    'cse-sp-dmax',
    'cse-sp-fast-lowtime',
    'cse-sp-fast-opening',
    'cse-sp-smart-premoves',
    'cse-sp-automove-hotkey',
    'cse-sp-pr-depth',
    'cse-sp-autoplay-rematch',
    'cse-sp-toxic-message',
    'cse-sp-eval-percent',
    'cse-sp-suggest-hotkey',
  ]) {
    assert.match(core, new RegExp(`id="${control}"`));
  }
});

test('Blockcraft exposes working category, view, toggle, favorite and settings actions', () => {
  for (const action of ['data-bc-category', 'data-bc-view', 'data-bc-toggle', 'data-bc-favorite', 'data-bc-settings']) {
    assert.match(core, new RegExp(action));
  }
});

test('Blockcraft global settings cover every real application section', () => {
  assert.match(core, /function cseRenderBlockcraftGlobalSettings\(modal\)/);
  assert.match(core, /general: \['gear', 'SETTINGS'/);
  assert.match(core, /stockfish: \['engine', 'ENGINES'/);
  assert.match(core, /appearance: \['torch', 'APPEARANCE'/);
  assert.match(core, /notifications: \['bell', 'NOTIFICATIONS'/);
  assert.match(core, /about: \['book', 'ABOUT'/);
  assert.doesNotMatch(core, /THEME 1:/);
});
