# EloVision V2

Chrome extension for Chess.com with opponent statistics, live engine analysis,
move-quality insights, configurable HUD themes, and optional automation tools.

> Built as a Manifest V3 unpacked extension. No build step is required.

---

## What It Does

| Area | Features |
| --- | --- |
| Opponent stats | Recent performance, W/L/D, WLR, win rate, current ratings, peak rating |
| Cheater Finder | Suspicion score, radar-style report, account and accuracy signals |
| Analysis | Local Stockfish eval bar, top-move arrows, optional Stockfish Online API |
| Game Insights | Live move labels, CPL-style classification, end-game recap |
| Automation | AutoMove, Puzzle Rush solver, AutoPlay, optional premoves |
| Game flow | Engine-aware draw responses, draw offers, resignations, and limited rematches |
| Interface | Draggable HUD, favorites, settings panel, themes, language and number format |

---

## Main Features

### Opponent Stats

The extension injects quick action buttons next to Chess.com usernames and can
show:

- Win, loss, and draw totals for the last 1, 7, and 30 days.
- Win/loss ratio and win rate with visual indicators.
- Current Bullet, Blitz, and Rapid ratings.
- Peak rating across supported time controls.
- Cached Chess.com API responses to avoid repeated requests.

### Cheater Finder

Cheater Finder uses public Chess.com data to build a local suspicion report:

- Score from 0 to 100.
- Account age and recent-game volume.
- Win-rate spikes by time control.
- High-accuracy game frequency when available in archived games.
- Animated panel with visual summary and reason list.

### Stockfish Evaluation Bar

The eval bar can run with:

- Local bundled Stockfish, loaded from `modules/stockfish/`.
- Optional Stockfish Online API provider.
- Configurable depth for suggestions and analysis.
- Centipawn or percent display mode.
- Draggable floating bar.
- Board arrows for the suggested move.
- Auto-reload and hash-clear controls for the local engine.
- SPA-aware state reset when Chess.com changes route without a full reload.

### Game Insights

Game Insights tracks positions and move transitions during a game:

- Classifies moves as Brilliant, Great, Best, Good, OK, Inaccuracy, Mistake, or Blunder.
- Stores recent evaluated positions in memory.
- Adds move-quality badges to the notation where possible.
- Shows a recap when the game ends.
- Resets cleanly on new games and navigation changes.

### AutoMove

AutoMove supports three modes:

| Mode | Behavior |
| --- | --- |
| `Blatant` | Uses the strongest available move and executes quickly. |
| `Legit` | Uses local Maia with configurable strength and randomized user delay. |
| `Human` | Uses local Stockfish MultiPV and automatically chooses strength, move, timing, and forced premoves. |

The GUI always shows the active mode next to AutoMove, for example
`AutoMove [Human]`, and displays move execution timing while automation is
running.

### Human Mode

Human mode is automatic by design. It ignores saved ELO, delay, and fast-mode
settings while preserving them for when you switch back to Legit or Blatant.

Human mode uses:

- Local Stockfish only.
- MultiPV 4.
- Automatic depth:
  - 8 with at least 60 seconds on the clock.
  - 6 from 20 to 60 seconds.
  - 5 from 5 to 20 seconds.
  - 4 below 5 seconds.
  - Plus one extra depth level in complex positions.
- Complexity scoring from `0` to `1`, based on MultiPV gaps, valid alternatives,
  game phase, captures, mate threats, and forced-response signals.
- Weighted random move selection among safe candidates.
- Blunder filtering, normally excluding losses above 120 cp.
- A tighter loss limit when clearly winning.
- Forced best move selection for short mates, unique legal moves, and large
  evaluation gaps.
- Per-game state to avoid artificial chains of weak moves.
- Clock-aware timing that subtracts engine time already spent.
- Opening acceleration, with real variation so repeated moves do not use the
  same constant delay.
- Bullet-safe caps, including 30-180 ms behavior below 5 seconds.
- Fallback timing when no clock is readable.

Human settings intentionally show only:

```text
Strength, timing and forced premoves are automatic
```

### Premoves

Premoves are guarded to reduce invalid or suspicious behavior.

- Legit can use configurable smart premoves.
- Human enables premoves only for verified recaptures or forced replies.
- A Human premove requires a clearly dominant opponent move, a stable reply
  across plausible lines, and a very small reply set after simulation.
- Before sending, the extension rechecks the current FEN, legal move, board
  context, and page state.
- Pending premoves are invalidated on navigation, mode changes, game changes,
  and mismatched positions.

### Promotion Handling

AutoMove supports pawn promotion with a dedicated path:

- Sends only the source and destination board clicks for promotion moves.
- Selects the requested promotion piece explicitly after the selector opens.
- Supports common Chess.com selector layouts, including shadow DOM.
- Retries only the piece selection, not the pawn move, so the selector does not
  open and immediately close.
- Invalidates stale promotion choices after navigation or mode changes.

### Puzzle Rush Solver

Puzzle Rush automation uses Stockfish with configurable depth and a fallback
search path for stuck positions.

### AutoPlay

AutoPlay watches the end screen and can:

- Start a fresh match after a game ends.
- Optionally accept incoming rematches.
- Prefer "New Game" style actions over generic rematch buttons when configured.
- Survive React node replacement on Chess.com end screens.
- Avoid repeatedly clicking the same stale action token too quickly.

### GameFlow

GameFlow manages end-of-game decisions while keeping the reason visible in the
top-right HUD:

- Accepts draw offers in equal or worse positions and declines them when ahead.
- Offers draws on repeated positions and quiet fortress-like endings.
- Resigns only after a losing evaluation remains stable across multiple positions.
- Suppresses resignation while the opponent is below the configured clock threshold.
- Accepts rematches up to a configurable per-session limit.

---

## Interface

Open the Tools GUI with:

- Right Shift.
- The floating `Tools` button.

The HUD includes:

- `ALL`, `FAVORITE`, and `SETTINGS` tabs.
- Runtime module toggles.
- Per-module settings panels.
- Favorites.
- Dragging with pointer capture.
- Compact status badges.
- AutoMove mode badge.
- Timers for AutoMove, Puzzle Rush, and AutoPlay.

### Themes

Available interface themes:

| Theme | Description |
| --- | --- |
| Maia Classic | Modern emerald rounded interface. |
| EloVision | BlockCraft Theme. |
| Voidtech Neon | Angular cyan technical overlay. |
| Claude | Warm minimal interface. |
| Verdant | Compact dark vertical client with grouped sections. |

Verdant has its own grouped layout and cycles the compact AutoMove mode control
through Legit, Blatant, and Human.

---

## Configuration

Settings are persisted in `localStorage` under:

```text
cse_mod_state_v1
```

Main settings include:

| Setting | Notes |
| --- | --- |
| AutoMove mode | `legit`, `blatant`, or `human`. Unknown saved values fall back safely. |
| Maia strength | Used by Legit mode. Saved but ignored by Human. |
| Delay min/max | Used by Legit and Blatant. Saved but ignored by Human. |
| Fast when low time | Manual speed-up option outside Human's automatic timing. |
| Fast in opening | Manual opening speed-up option outside Human's automatic timing. |
| Smart premoves | Manual premove option outside Human's forced-premove policy. |
| AutoMove hotkey | Configurable toggle hotkey. |
| Suggest Move depth | Depth for arrows and hints. |
| Suggest Move hotkey | Configurable suggestion toggle hotkey. |
| Puzzle Rush depth | Depth for puzzle solving. |
| AutoPlay rematch | Allows or blocks rematch acceptance. |
| GameFlow | Draw threshold, resign threshold/stability, low-time protection, and rematch limit. |
| Engine provider | Local Stockfish or Stockfish Online API. |
| Eval display | Bar or percent display. |
| General language | English or Italian. |
| Number format | Default or European formatting. |
| UI theme | EloVision Classic, EloVision, Voidtech, Claude, or Verdant. |
| Notifications | Toggles for move sent, premove queued, game finished, analysis warnings, and similar events. |

---

## Project Structure

```text
.
|-- manifest.json
|-- background.js
|-- offscreen.html
|-- offscreen.js
|-- styles.css
|-- modules/
|   |-- core-main.js
|   |-- human-automove.js
|   |-- game-insights.js
|   |-- stats-cheater.js
|   |-- eval-tools.js
|   |-- auto-modules.js
|   |-- tools-gui.js
|   |-- stockfish/
|   `-- maia/
`-- tests/
    |-- autoplay-regression.test.js
    |-- human-automove.test.js
    |-- maia-regression.test.js
    |-- promotion-regression.test.js
    `-- verdant-ui.test.js
```

### Key Files

| File | Purpose |
| --- | --- |
| `modules/core-main.js` | Main HUD, engine orchestration, board/FEN handling, AutoMove, Puzzle Rush, AutoPlay, settings. |
| `modules/human-automove.js` | Human complexity scoring, move selection, timing budget, forced-premove policy. |
| `modules/game-insights.js` | Move-quality tracking, badges, recap state. |
| `modules/stats-cheater.js` | Opponent stats and Cheater Finder panels. |
| `offscreen.js` | Offscreen engine support and worker keepalive path. |
| `styles.css` | HUD, panels, themes, eval bar, and Chess.com overlays. |

---

## Installation

1. Clone or download this repository.

   ```bash
   git clone https://github.com/YOUR_USERNAME/chess-opponent-stats.git
   ```

2. Open Chrome.

3. Go to:

   ```text
   chrome://extensions/
   ```

4. Enable `Developer mode`.

5. Click `Load unpacked`.

6. Select the repository root folder.

7. Open Chess.com.

After editing files locally, reload the unpacked extension from
`chrome://extensions/` and refresh the Chess.com tab.

---

## Usage

| Action | How |
| --- | --- |
| Open Tools GUI | Press Right Shift or click `Tools`. |
| View opponent stats | Click the stats button next to a username. |
| Run Cheater Finder | Click the detective button next to a username. |
| Enable eval bar | Tools GUI -> Evaluation Bar. |
| Enable top-move arrows | Tools GUI -> Suggest Move. |
| Enable AutoMove | Tools GUI -> AutoMove. |
| Change AutoMove mode | AutoMove settings -> Legit, Blatant, or Human. |
| Enable Game Insights | Tools GUI -> Game Insights. |
| Enable AutoPlay | Tools GUI -> AutoPlay. |

---

## Diagnostics

The extension writes diagnostic logs for engine and automation behavior. Human
AutoMove logs include:

- Mode.
- Position complexity.
- Clock remaining.
- Computed time budget.
- Engine time already consumed.
- Selected move.
- Centipawn loss.
- Move-selection reason.
- Premove decision and reason.
- Promotion selection attempts.

These logs are intended for debugging timing, premove, online-board, promotion,
and engine issues.

---

## Tests

The project uses Node's built-in test runner.

Run the full suite:

```bash
node --test tests/*.test.js
```

Current regression coverage includes:

- Human mode depth, timing bands, move choice, forced lines, premoves, settings,
  online context, and GUI mode/timing display.
- Maia worker lifecycle, search IDs, castling conversion, timeout recovery, and
  offscreen keepalive.
- Promotion execution and selector retry behavior.
- AutoPlay end-screen handling.
- Verdant theme layout and three-mode AutoMove cycle.

---

## Permissions

| Permission | Reason |
| --- | --- |
| `activeTab` | Read the active Chess.com page and board state. |
| `storage` | Persist extension state and settings. |
| `offscreen` | Keep engine work available through the MV3 offscreen path. |
| `https://www.chess.com/*` | Inject scripts and interact with Chess.com pages. |
| `https://api.chess.com/*` | Fetch public player stats and archived games. |
| `https://stockfish.online/*` | Optional online Stockfish API provider. |

---

## Tech Stack

- Chrome Extension Manifest V3.
- Vanilla JavaScript.
- No bundler and no build step.
- Local Stockfish worker.
- Local Maia/Zerofish engine and bundled Maia weights.
- Chess.com public API.
- Node test runner.

---

## Disclaimer

This project is for personal and educational use. Engine assistance, automated
move execution, premoves, puzzle solving, and similar automation may violate
Chess.com's rules in live games. Use responsibly and understand the platform's
terms before enabling automation features.
