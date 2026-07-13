# ♟️ Chess.com Opponent Stats

> A Chrome extension that supercharges your Chess.com experience with real-time opponent statistics, Stockfish-powered move evaluation, automation tools, and cheat detection — all in a sleek, draggable HUD.

---

## ✨ Features

### 📊 Opponent Stats Panel
Instantly view detailed statistics for any opponent directly on Chess.com:
- **Win / Loss / Draw** breakdown over the last **1, 7, and 30 days**
- **Win/Loss Ratio (WLR)** with color-coded indicators
- **Win Rate %** per time period
- **Current ratings** (Bullet, Blitz, Rapid)
- **Peak ELO** across all time controls
- Animated counters on panel open for a polished UX
- Draggable, closeable panel injected next to any username

### 🕵️ Cheater Finder
Click the 🕵️ button next to any username to run an automated cheating analysis:
- Suspicion score out of 100
- Animated **radar chart** visualizing cheating indicators (accuracy, volume, account age, rating patterns)
- Uses publicly available Chess.com API data — no third-party services

### 🤖 Auto-Move
Automated move execution powered by Stockfish evaluation:
- **Blatant mode**: plays instantly
- **Legit mode**: randomized delay between configurable min/max seconds
- **Human mode**: in online and computer games, automatically chooses Stockfish strength, a safe weighted MultiPV move, and reflection time from the position and clock
- **Speed-up when low on time** (< 30s on clock)
- **Opening speed-up** option (first 8 full moves)
- **Smart premoves**: configurable for Legit; Human enables them automatically only for verified recaptures or forced replies

### 📡 Stockfish Evaluation Bar
Real-time position evaluation with selectable engine provider:
- **Local Stockfish** (default): runs directly in-browser via bundled worker
- **Stockfish Online API** fallback/alternative provider
- Floating, draggable evaluation bar
- Displays score in **centipawns** or **percentage** (configurable)
- Top-move arrows overlaid directly on the board
- Configurable analysis depth
- Auto-reload on engine failure with failure streak tracking
- Persists position across page navigation (SPA-aware)

### 🧩 Puzzle Rush Solver
Automatically solves Chess.com Puzzle Rush puzzles:
- Configurable engine depth
- Fallback depth on stuck positions with timeout detection

### ▶️ Auto Play
Continuous game automation:
- Starts a fresh match from the end screen and can optionally accept an incoming rematch
- Persists across Chess.com's SPA navigation

### 🖥️ Tools GUI (HUD)
A central control panel accessible via the **right Shift key** or the floating `Tools` button:
- Toggle individual modules on/off at runtime
- Configure delays, depths, and modes
- Tabbed layout with favorites support
- Draggable, pointer-capture based drag (mobile-friendly)
- State persisted to `localStorage` across sessions

---

## 🏗️ Project Structure

```
├── manifest.json              # Chrome Extension Manifest v3
├── background.js              # Service worker (background)
├── content.js                 # Entry point (injected on chess.com)
├── styles.css                 # All UI styles
└── modules/
    ├── core-main.js           # Core engine: eval bar, automove, FEN extraction, Stockfish, GUI
    ├── human-automove.js      # Human complexity, move selection, timing, forced-premoves policy
    ├── stats-cheater.js       # Opponent stats panel + cheater finder
    ├── eval-tools.js          # Eval toggle button injection
    ├── auto-modules.js        # URL change / SPA navigation hooks
    └── tools-gui.js           # HUD hotkey binding (right Shift)
```

---

## 🚀 Installation

> This extension is not published on the Chrome Web Store. Install it manually in developer mode.

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/chess-opponent-stats.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the root folder of this repository

5. Navigate to [chess.com](https://www.chess.com) — the extension activates automatically

---

## 🎮 Usage

| Action | How |
|---|---|
| View opponent stats | Click the **📊** button next to any username |
| Analyze for cheating | Click the **🕵️** button next to any username |
| Open Tools GUI | Press **Right Shift** or click the `Tools` floating button |
| Toggle Eval Bar | Open Tools GUI → enable *Evaluation Bar* |
| Toggle AutoMove | Open Tools GUI → enable *Auto Move* |
| Toggle move arrows | Open Tools GUI → enable *Suggest Move* |

---

## ⚙️ Configuration

All settings are accessible through the **Tools GUI** and are automatically persisted via `localStorage`:

| Setting | Description |
|---|---|
| `AutoMove Mode` | `blatant` (instant), `legit` (Maia + configured delay), or `human` (fully automatic) |
| `Delay Min / Max` | Range in seconds for Legit and Blatant; retained but ignored by Human |
| `Fast when low time` | Speed up automove when clock < 30s |
| `Fast in opening` | Speed up during first 8 full moves |
| `Smart Premoves` | Queue premoves in forced tactical lines |
| `Suggest Move Depth` | Stockfish depth for arrows / hints (default: 15) |
| `Puzzle Rush Depth` | Stockfish depth for puzzle solving (default: 20) |
| `Eval Bar Display` | `bar` or `percent` |
| `Stockfish Auto-Reload` | Auto-restart engine on failure |
| `Engine Provider` | `local` (default) or `api` |
| `General Language` | `English` or `Italiano` |
| `Numbers Format` | `Default (1,234.56)` or `European (1.234,56)` |

---

## 🧠 How It Works

- **FEN Extraction**: Reads the current board position by scanning the DOM for `chess-board`, `wc-chess-board`, `[data-fen]`, and move list `[data-ply]` attributes, then reconstructs a valid FEN string including castling rights and turn.
- **Stockfish Integration**: Uses local bundled Stockfish by default and can switch to the [Stockfish Online REST API](https://stockfish.online). Results are cached for 12 seconds to avoid redundant requests.
- **Human AutoMove**: Always uses local Stockfish with MultiPV 4. Base depth is 8 at 60+ seconds, 6 at 20–60, 5 at 5–20, and 4 below 5 seconds, plus one level for complex positions. It keeps a 12% clock reserve, subtracts engine time from the total think budget, and uses a 0.3–4 second fallback when no clock can be read.
- **Human diagnostics**: AutoMove logs include mode, position complexity, remaining clock, computed budget, engine time, selected move, centipawn loss, and any premove reason.
- **Stats API**: Fetches data from the public [Chess.com API](https://api.chess.com) (`/pub/player/{username}/stats` and `/games/archives`). All responses are cached in-memory for 5 minutes.
- **SPA Navigation**: A `MutationObserver` on `document` watches for URL changes and resets all state (eval cache, move overlays, premove schedules) on navigation.
- **State Persistence**: Module states, settings, and eval bar position are serialized to `localStorage` under the key `cse_mod_state_v1` and restored on page load.

---

## 🔒 Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read the Chess.com DOM to extract game state |
| `storage` | Persist extension settings |
| `https://www.chess.com/*` | Inject content scripts and interact with the page |
| `https://api.chess.com/*` | Fetch player stats and game archives |
| `https://stockfish.online/*` | Query the Stockfish engine API |

---

## ⚠️ Disclaimer

This extension is built for **educational and personal use only**. Using automation tools, move engines, or cheating detection features in real games on Chess.com may violate their [Terms of Service](https://www.chess.com/legal/user-agreement). Use responsibly.

---

## 🛠️ Tech Stack

- Vanilla JavaScript (ES2020+), no build step required
- Chrome Extension Manifest v3
- Bundled Stockfish.js worker (local engine)
- [Stockfish Online API](https://stockfish.online)
- [Chess.com Public API](https://www.chess.com/news/view/published-data-api)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
