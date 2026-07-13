'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(ROOT, 'modules', 'core-main.js'), 'utf8');

function loadActionScorer(acceptRematch = true) {
  const start = core.indexOf('function normalizeActionText(text)');
  const end = core.indexOf('function getAutoPlayActionCandidates()');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const context = { autoPlayAcceptRematch: acceptRematch };
  vm.createContext(context);
  vm.runInContext(`${core.slice(start, end)}\nglobalThis.score = scoreAutoPlayActionText;`, context);
  return context.score;
}

test('AutoPlay prefers a fresh match over a generic rematch', () => {
  const score = loadActionScorer(true);
  assert.ok(score('New Game') > score('Rematch'));
  assert.ok(score('New 1 min') > score('Rematch'));
  assert.ok(score('Accept rematch') > score('New Game'));
  assert.ok(score('Play Again') > 0);

  const withoutRematches = loadActionScorer(false);
  assert.equal(withoutRematches('Rematch'), 0);
  assert.ok(withoutRematches('New Game') > 0);
});

test('AutoPlay end-screen gate survives React node replacement and can retry a stale click', () => {
  assert.match(core, /if \(!isGameOverVisible\(\)\) \{[\s\S]*?clearAutoPlaySchedule\(true\)/);
  assert.match(core, /if \(autoPlayGameOverToken !== gameOverToken\) \{/);
  assert.doesNotMatch(core, /autoPlayGameOverToken !== gameOverToken \|\| autoPlayGameOverNode !== action\.node/);
  assert.match(core, /autoPlayHandledToken === action\.onceToken/);
  assert.match(core, /now\(\) - autoPlayHandledAt < 5000/);
  assert.match(core, /autoPlayHandledToken = live\.onceToken;[\s\S]*?autoPlayHandledAt = now\(\)/);
});
