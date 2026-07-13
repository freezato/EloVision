'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(ROOT, 'modules', 'core-main.js'), 'utf8');

test('promotion uses one board gesture and explicitly selects the requested piece', () => {
  const executeStart = core.indexOf('function executeAutomoveMove(bestMove)');
  const executeEnd = core.indexOf('async function performAutomove()', executeStart);
  const executeSource = core.slice(executeStart, executeEnd);
  const promotionStart = executeSource.indexOf('if (promotion) {', executeSource.indexOf('const dispatchAtPoint'));
  const normalMoveStart = executeSource.indexOf('// Try pointer + drag-like interaction first.', promotionStart);
  const promotionBranch = executeSource.slice(promotionStart, normalMoveStart);

  assert.ok(promotionStart >= 0 && normalMoveStart > promotionStart);
  assert.match(promotionBranch, /dispatchAtPoint\('click', fromPt/);
  assert.match(promotionBranch, /dispatchAtPoint\('click', toPt/);
  assert.match(promotionBranch, /schedulePromotionChoice\(promotion, moverColor, boardEl, bestMove\)/);
  assert.match(promotionBranch, /return true;/);
  assert.doesNotMatch(promotionBranch, /pointerdown|mousedown|executeAutomoveMove/);
});

test('promotion selector supports board shadow DOM and common piece labels', () => {
  assert.match(core, /const roots = \[boardEl\?\.shadowRoot, boardEl, document\]\.filter\(Boolean\)/);
  assert.match(core, /q: \['queen', 'regina', 'donna'\]/);
  assert.match(core, /r: \['rook', 'torre'\]/);
  assert.match(core, /b: \['bishop', 'alfiere'\]/);
  assert.match(core, /n: \['knight', 'cavallo'\]/);
  assert.match(core, /for \(const delayMs of \[35, 80, 150, 260, 420, 650\]\)/);
});

test('promotion verification never repeats the pawn move over the open selector', () => {
  assert.match(core, /const verificationDelayMs = dispatchedPromotion \? 850 : 220/);
  const retryStart = core.indexOf('if (dispatchedPromotion) {');
  const normalRetryStart = core.indexOf("automoveLog('retry: turn unchanged after first dispatch')", retryStart);
  const promotionRetry = core.slice(retryStart, normalRetryStart);

  assert.match(promotionRetry, /trySelectPromotionChoice\(/);
  assert.doesNotMatch(promotionRetry, /executeAutomoveMove\(/);
  assert.match(promotionRetry, /pawn move was not repeated/);
});
