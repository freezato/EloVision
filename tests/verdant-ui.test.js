'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(ROOT, 'modules', 'core-main.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

test('Verdant legacy skin was removed and replaced by the V2 client', () => {
  assert.equal(css.includes('Verdant: compact dark client'), false);
  assert.equal((css.match(/Verdant V2: standalone vertical client/g) || []).length, 1);
  assert.match(css, /#cse-mc-gui\.cse-verdant-window/);
  assert.match(core, /function cseRenderVerdantGui\(modal, allMods\)/);
});

test('Verdant renders its own grouped vertical module layout', () => {
  assert.match(core, /renderSection\('automation', 'Automation'/);
  assert.match(core, /renderSection\('analysis', 'Analysis'/);
  assert.match(core, /renderSection\('interface', 'Interface'/);
  assert.match(core, /cse-verdant-theme-option/);
  assert.match(core, /cse-verdant-footer/);
});

test('every Verdant module exposes inline settings on right click', () => {
  assert.match(core, /querySelectorAll\('\.cse-verdant-module'\)/);
  assert.match(core, /addEventListener\('contextmenu'/);
  assert.match(core, /data-settings-host/);
  assert.match(core, /host\.appendChild\(overlay\)/);
});

test('Verdant section state is persisted', () => {
  assert.match(core, /verdantSections: \{ automation: true, analysis: true, interface: true, security: false, themes: true \}/);
  assert.match(core, /verdantSections: \{ \.\.\.\(cseGuiState\?\.verdantSections \|\| \{\}\) \}/);
});

test('the Verdant window keeps the pointer-driven drag handle', () => {
  assert.match(core, /class="cse-mc-header" id="cse-mc-drag"/);
  assert.match(core, /handle\.setPointerCapture\(e\.pointerId\)/);
  assert.match(core, /clampToViewport\(modal/);
});

test('Verdant shows Mode as one compact click-to-switch value', () => {
  assert.match(css, /cse-mc-mbtn:not\(\.cse-mc-mbtn-on\) \{ display:none; \}/);
  assert.match(core, /uiTheme === 'verdant' && btn\.classList\.contains\('cse-mc-mbtn-on'\)/);
  assert.match(core, /automoveMode === 'legit' \? 'blatant' : 'legit'/);
});
