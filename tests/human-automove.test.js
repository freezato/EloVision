'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const human = require(path.join(ROOT, 'modules', 'human-automove.js'));
const core = fs.readFileSync(path.join(ROOT, 'modules', 'core-main.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const lines = (values, moves = ['a2a3', 'b2b3', 'c2c3', 'd2d3']) =>
  values.map((cp, index) => ({ moves: [moves[index]], cp, mate: null }));

test('Human depth follows clock bands and gains one level in complex positions', () => {
  assert.equal(human.getHumanDepth(60, 0.2), 8);
  assert.equal(human.getHumanDepth(59.9, 0.2), 6);
  assert.equal(human.getHumanDepth(20, 0.2), 6);
  assert.equal(human.getHumanDepth(19.9, 0.2), 5);
  assert.equal(human.getHumanDepth(5, 0.2), 5);
  assert.equal(human.getHumanDepth(4.9, 0.2), 4);
  assert.equal(human.getHumanDepth(60, 0.8), 9);
});

test('Human always selects short forced mates, unique moves and large evaluation gaps', () => {
  const mate = human.chooseHumanMove({
    moves: ['h5f7', 'h5e5'],
    pvLines: [{ moves: ['h5f7'], mate: 4, cp: null }, { moves: ['h5e5'], cp: 200, mate: null }],
    side: 'w',
    random: () => 0.99,
  });
  assert.equal(mate.move, 'h5f7');
  assert.equal(mate.reason, 'forced-mate');

  const distantMate = human.chooseHumanMove({
    moves: ['h5f7', 'h5e5'],
    pvLines: [{ moves: ['h5f7'], mate: 9, cp: null }, { moves: ['h5e5'], cp: 200, mate: null }],
    side: 'w', complexity: 1, random: () => 0.99,
  });
  assert.equal(distantMate.move, 'h5e5', 'mates beyond six should not force a single engine line');

  const unique = human.chooseHumanMove({ moves: ['e1e2'], pvLines: lines([0], ['e1e2']), side: 'w' });
  assert.equal(unique.reason, 'only-valid-move');

  const gap = human.chooseHumanMove({
    moves: ['a2a3', 'b2b3'], pvLines: lines([300, 100]), side: 'w', random: () => 0.99,
  });
  assert.equal(gap.move, 'a2a3');
  assert.equal(gap.reason, 'large-eval-gap');
});

test('Human samples near-equal moves but excludes blunders and tightens conversion when winning', () => {
  const nearCounts = new Map();
  for (let i = 0; i < 100; i += 1) {
    const choice = human.chooseHumanMove({
      moves: ['a2a3', 'b2b3', 'c2c3'],
      pvLines: lines([30, 25, 20]),
      side: 'w', complexity: 0.8, random: () => (i + 0.5) / 100,
    });
    nearCounts.set(choice.move, (nearCounts.get(choice.move) || 0) + 1);
  }
  assert.ok(nearCounts.size >= 2, 'near-equal moves should not collapse to one deterministic choice');

  const noBlunder = human.chooseHumanMove({
    moves: ['a2a3', 'b2b3', 'c2c3'], pvLines: lines([50, 0, -100]),
    side: 'w', complexity: 1, random: () => 0.999,
  });
  assert.notEqual(noBlunder.move, 'c2c3');

  const winning = human.chooseHumanMove({
    moves: ['a2a3', 'b2b3'], pvLines: lines([400, 330]),
    side: 'w', complexity: 1, random: () => 0.999,
  });
  assert.equal(winning.move, 'a2a3');
  assert.equal(winning.maxLossCp, 60);
});

test('a previous inaccuracy temporarily increases best-move probability', () => {
  const countBest = previousSuboptimal => {
    let count = 0;
    for (let i = 0; i < 200; i += 1) {
      const choice = human.chooseHumanMove({
        moves: ['a2a3', 'b2b3'], pvLines: lines([40, 10]), side: 'w', complexity: 0.5,
        previousSuboptimal, random: () => (i + 0.5) / 200,
      });
      if (choice.move === 'a2a3') count += 1;
    }
    return count;
  };
  assert.ok(countBest(true) > countBest(false));
});

test('clock budgets honor every cap, the 12% reserve, engine elapsed time and no-clock fallback', () => {
  const cases = [
    [240, 12],
    [180, 8],
    [60, 8],
    [59, 3],
    [20, 3],
    [19, 0.8],
    [5, 0.8],
    [4.9, 0.18],
  ];
  for (const [clockSec, cap] of cases) {
    const budget = human.computeHumanThinkBudget({ clockSec, complexity: 1, fullmove: 20, random: () => 0.5 });
    assert.ok(budget.budgetSec <= cap + 1e-9, `${clockSec}s must stay under ${cap}s`);
    assert.equal(budget.reserveSec, clockSec * 0.12);
    assert.ok(budget.budgetSec <= budget.usableSec + 1e-9);
  }
  const bullet = human.computeHumanThinkBudget({ clockSec: 4, complexity: 0, random: () => 0.5 });
  assert.ok(bullet.budgetSec >= 0.03 && bullet.budgetSec <= 0.18);
  assert.equal(human.getRemainingDelaySeconds(2.5, 1.1), 1.4);
  assert.equal(human.getRemainingDelaySeconds(1, 1.5), 0);

  const fallbackLow = human.computeHumanThinkBudget({ clockSec: null, complexity: 0, random: () => 0.5 });
  const fallbackHigh = human.computeHumanThinkBudget({ clockSec: null, complexity: 1, random: () => 0.5 });
  assert.ok(fallbackLow.budgetSec >= 0.3);
  assert.ok(fallbackHigh.budgetSec <= 4);
  assert.ok(fallbackHigh.budgetSec > fallbackLow.budgetSec);
});

test('opening timing is fast unless the position is genuinely complex', () => {
  const easy = human.computeHumanThinkBudget({ clockSec: 60, complexity: 0.25, fullmove: 4, random: () => 0.5 });
  const medium = human.computeHumanThinkBudget({ clockSec: 60, complexity: 0.5, fullmove: 7, random: () => 0.5 });
  const difficult = human.computeHumanThinkBudget({ clockSec: 60, complexity: 0.95, fullmove: 9, random: () => 0.5 });
  assert.ok(easy.budgetSec <= 0.3, `easy opening budget was ${easy.budgetSec}s`);
  assert.ok(medium.budgetSec <= 0.45, `normal opening budget was ${medium.budgetSec}s`);
  assert.ok(difficult.budgetSec > medium.budgetSec);
  assert.ok(difficult.budgetSec <= 1.65);
  assert.match(easy.band, /opening/);

  const lowTime = human.computeHumanThinkBudget({ clockSec: 12, complexity: 0.5, fullmove: 5, random: () => 0.5 });
  assert.ok(lowTime.budgetSec <= 0.16);

  const fasterJitter = human.computeHumanThinkBudget({ clockSec: 60, complexity: 0.5, fullmove: 5, random: () => 0 });
  const slowerJitter = human.computeHumanThinkBudget({ clockSec: 60, complexity: 0.5, fullmove: 5, random: () => 1 });
  assert.ok(slowerJitter.budgetSec > fasterJitter.budgetSec, 'opening times must not collapse to a fixed cap');
});

test('forced premoves allow safe recaptures or unanimous forced replies only', () => {
  assert.deepEqual(
    human.classifyForcedPremove({ isRecapture: true, pseudoLegalCount: 2, plausibleReplies: ['e4d5'], opponentGapCp: 0 }),
    { allowed: true, reason: 'obvious-recapture' },
  );
  assert.deepEqual(
    human.classifyForcedPremove({ isRecapture: false, pseudoLegalCount: 2, plausibleReplies: ['e1f1', 'e1f1'], opponentGapCp: 180 }),
    { allowed: true, reason: 'forced-response' },
  );
  assert.deepEqual(
    human.classifyForcedPremove({ isRecapture: true, pseudoLegalCount: 12, plausibleReplies: ['e4d5'], opponentGapCp: 180 }),
    { allowed: true, reason: 'obvious-recapture' },
  );
  assert.equal(human.classifyForcedPremove({ isRecapture: true, pseudoLegalCount: 12, plausibleReplies: ['e4d5'], opponentGapCp: 80 }).allowed, false);
  assert.equal(human.classifyForcedPremove({ isRecapture: false, pseudoLegalCount: 3, plausibleReplies: ['e1f1'], opponentGapCp: 180 }).allowed, false);
  assert.equal(human.classifyForcedPremove({ isRecapture: false, pseudoLegalCount: 2, plausibleReplies: ['e1f1', 'e1d1'], opponentGapCp: 180 }).allowed, false);
  assert.equal(human.classifyForcedPremove({ isRecapture: false, pseudoLegalCount: 2, plausibleReplies: ['e1f1'], opponentGapCp: 80 }).allowed, false);
});

test('Human is loaded before core, supports online games and keeps FEN, legality and navigation guards', () => {
  const scripts = manifest.content_scripts[0].js;
  assert.ok(scripts.indexOf('modules/human-automove.js') < scripts.indexOf('modules/core-main.js'));
  assert.match(core, /automoveMode === 'human' && \(isOnlineGameContext\(\) \|\| isComputerGameContext\(\)\)/);
  assert.match(core, /profile === 'automove' && automoveMode === 'human' && !isHumanAutomoveAllowedContext\(\)/);
  assert.match(core, /isSameFenBoardAndTurn\(liveFen, premoveTargetFen\)/);
  assert.match(core, /const revalidated = getSmartPremoveCandidate\(side\)/);
  assert.match(core, /isMovePlayableNow\(automovePlannedMove, automoveTargetFen\)/);
  assert.match(core, /lastUrl = location\.href;[\s\S]*?clearAutomoveSchedule\(\);[\s\S]*?clearPremoveSchedule\(\);/);
});

test('Human settings persist as a third mode while keeping manual values untouched', () => {
  assert.match(core, /const AUTOMOVE_MODES = \['legit', 'blatant', 'human'\]/);
  assert.match(core, /AUTOMOVE_MODES\.includes\(saved\.settings\.automoveMode\)/);
  assert.match(core, /data-mode="human">Human<\/button>/);
  assert.match(core, /Strength, timing and forced premoves are automatic/);
  assert.match(core, /automoveMode === 'human' \? `[\s\S]*?` : `/);
});

test('AutoMove GUI exposes colored mode while timing stays in the top-right HUD', () => {
  assert.match(core, /function getAutomoveModeLabel\(mode = automoveMode\)/);
  assert.match(core, /function getAutomoveTimingText\(\)/);
  assert.match(core, /return `\$\{elapsedSec\.toFixed\(1\)\}s · ETA \$\{remainingSec\.toFixed\(1\)\}s`/);
  assert.match(core, /`last \$\{\(automoveLastExecutionMs \/ 1000\)\.toFixed\(1\)\}s`/);
  assert.match(core, /cse-mc-mode-badge \$\{getAutomoveModeCssClass\(\)\}">\[\$\{getAutomoveModeLabel\(\)\}\]/);
  assert.match(core, /cse-gui-hud-mode \$\{modeClass\}">\[\$\{modeLabel\}\]/);
  assert.doesNotMatch(core, /cse-mc-mode-badge[^\n]*cse-mc-timer[^\n]*cse-mc-timer-automove/);
  assert.match(core, /cse-gui-hud-timer">\$\{timer\}/);
  assert.match(core, /const executionMs = sent \? finishAutomoveTiming\(dispatchedFen\) : null/);
});

test('Human local search is prewarmed and returns partial MultiPV work at its bullet deadline', () => {
  assert.match(core, /function getHumanLocalSearchTimeoutMs\(fen, queryDepth\)/);
  assert.match(core, /clockSec < 5\) bandLimitMs = 180/);
  assert.match(core, /clockSec < 20\) bandLimitMs = 450/);
  assert.match(core, /isOpening[\s\S]*?clockSec < 60 \? 240[\s\S]*?: 350/);
  assert.match(core, /engineDeadlineJitter = 0\.65 \+ \(Math\.random\(\) \* 0\.70\)/);
  assert.match(core, /const styles = \['fast', 'normal', 'slow'\]/);
  assert.match(core, /const lastTwoSame = history\.length >= 2/);
  assert.match(core, /lastTwoSame \? styles\.filter\(style => style !== history\[history\.length - 1\]\) : styles/);
  assert.match(core, /engineElapsedSec \+ postEnginePauseSec/);
  assert.match(core, /const partialResult = buildLocalStockfishResult\(search\.turn, null, search\.linesByPv\)/);
  assert.match(core, /clearLocalStockfishSearch\(partialResult\)/);
  assert.match(core, /automoveMode === 'human'\) ensureLocalStockfishEngine\(\)/);
});
