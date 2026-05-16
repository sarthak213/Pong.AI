# Pong.AI

A modern single-player browser Pong game with configurable AI, powerups, multiple match formats, a trajectory visualizer, and four selectable visual themes.

🎮 **Play here → [Pong.AI on GitHub Pages](https://sarthak213.github.io/Pong.AI/)**

---

## File structure

```text
PONG.AI/
├── index.html      — UI layout: scoreboard, panels, canvas, footer
├── styles.css      — Theme-aware styles, viewport-fitted no-scroll layout, grid alignment
├── main.js         — Orchestrator: game loop, input, resize, state management
├── physics.js      — Ball creation, asymptotic speed ramp, swept collision, prediction
├── ai.js           — AI paddle targeting with fatigue system and trajectory builder
├── difficulty.js   — Per-level parameters: speed, AI behaviour, and fatigue config
├── powerups.js     — Powerup state, activation, per-point and per-game resets
├── scoring.js      — Point scoring, deuce rules, game/match win detection, win order
├── renderer.js     — Theme-aware canvas drawing: paddles, ball, net, trajectory
├── themes.js       — Four theme definitions and CSS variable application
├── LICENSE
└── README.md
```

`main.js` is the sole entry point, loaded via `<script type="module">` in `index.html`. All other files export pure functions with no side effects — `main.js` owns all mutable state.

---

## How to run

ES modules require a local server — browsers block `import` over `file://`.

```bash
# Node (recommended)
npx serve .

# Python
python -m http.server 8080
```

Then open `http://localhost:8080`. Alternatively use the **Live Server** extension in VS Code (right-click `index.html` → Open with Live Server).

The GitHub Pages deployment at `https://sarthak213.github.io/Pong.AI/` always serves the latest `main` branch.

---

## Rules

- Standard Pong: player paddle on the left, AI on the right. Ball serves from centre.
- A point is scored when the opponent fails to return the ball.
- First player to reach **7 points** wins the game. Win score is fixed.
- **Deuce rules apply** when both players reach 6–6: a two-point lead is then required to win the game. Deuce can repeat indefinitely.

---

## Match formats

Select via the Format tab strip in the footer. Locked once a game starts; re-enabled on Restart.

| Format | Games needed to win |
| --- | --- |
| One-shot | First to 7 points, single game |
| Best of 3 | First to win 2 games |
| Best of 5 | First to win 3 games |
| Best of 7 | First to win 4 games |

---

## Scoreboard

The scoreboard is centred at the top, directly above the canvas. All elements align to the canvas column edges.

- **Score** — shows the current point count, or `ADV` when a player has advantage during deuce.
- **Game point (n)** — appears under a player's score when they are one point from winning the game. `n` is the cumulative count of times that player has reached game point this game (tennis-style).
- **Match point (n)** — same, but when winning this point would also win the match.
- **Deuce (#n)** — a pill centred below both scores, shown only while deuce is active. `#n` is the deuce count for the current game, starting at 1 on the first 6–6.

Both game point and match point pills are fully suppressed during deuce and advantage states — the `ADV` score display is sufficient.

### Shared match track

When a multi-game format is selected, a row of dots appears centred below the scores. Each dot represents one possible game in the series. As games are won they fill in chronologically in the winner's colour — player colour for player wins, AI colour for AI wins. Dot colours follow the active theme. The track shows/hides automatically based on format and resets on Restart.

The player name is editable (up to 14 characters) before a game starts and locks during play. The AI name is fixed.

---

## Controls

| Action | Input |
| --- | --- |
| Move paddle | Mouse over canvas |
| Start / Serve | Click canvas or Space |
| Pause | Space during play, or Pause button |
| Resume | Space while paused, or Resume button |
| Restart | Restart button (resets full match) |
| Speed powerup | **W** key (during a running point) |
| Size powerup | **D** key (during a running point) |

Powerup keys are ignored when a text input is focused.

---

## Powerups

- 2 uses per game, reset each new game. Disabled entirely in Extreme mode.
- Only one powerup per point — once used the key is ignored until the next serve.
- Effects reset automatically when the point ends.

| Key | Effect |
| --- | --- |
| **W** — Speed | Player paddle tracks mouse 4× faster; AI movement slowed to 60% |
| **D** — Size | Player paddle height increases to 1.6× for the duration of the point |

Remaining uses are shown as pip dots in the left panel. Active powerup name is shown below the pips.

---

## AI difficulty

The difficulty slider (1–5) is on the right panel. It is locked during active play and re-enabled on Restart. When Extreme mode is on the slider is disabled and visually dimmed — the slider value is irrelevant in Extreme mode and the label never shows "Extreme".

Each level has a distinct named character: **Beginner**, **Easy**, **Medium**, **Hard**, **Expert**.

### Speed model

Ball speed uses an asymptotic ramp per level. There is no user-facing speed ramp slider.

```javascript
speed(t) = maxSpeed − (maxSpeed − startSpeed) × e^(−t / rampTau)
```

`t` is elapsed play time in seconds. The ball approaches `maxSpeed` smoothly and never exceeds it. Bounces do not compound speed — the ramp is the sole driver of acceleration.

| Level | Name | Start speed | Max speed | Time to ~95% max |
| --- | --- | --- | --- | --- |
| 1 | Beginner | 5 | 9 | ~60 s |
| 2 | Easy | 6 | 11 | ~45 s |
| 3 | Medium | 7 | 14 | ~33 s |
| 4 | Hard | 8 | 17 | ~24 s |
| 5 | Expert | 9 | 21 | ~15 s |
| — | Extreme | 10 | 26 | ~9 s |

### AI prediction model

Each level blends between tracking the live ball position and tracking the fully predicted contact point after wall bounces.

| Level | Name | Prediction blend | Aggression | Max paddle speed |
| --- | --- | --- | --- | --- |
| 1 | Beginner | 0% | 0.06 | 4.5 |
| 2 | Easy | 10% | 0.09 | 6 |
| 3 | Medium | 32% | 0.13 | 8 |
| 4 | Hard | 85% | 0.18 | 11 |
| 5 | Expert | 100% | 0.26 | 15 |
| — | Extreme | 100% + angle aim | 0.55 | 40 |

### Fatigue factor

From Medium difficulty upwards, the AI degrades dynamically as a rally lengthens. This rewards sustained pressure and makes longer exchanges feel like a real opponent tiring out.

```javascript
fatigue(n) = 1 − e^(−n / fatigueOnset)
```

`n` is the rally hit count (increments on every paddle contact, resets on every point). Fatigue is applied as a multiplier to prediction blend, aggression, and max paddle speed simultaneously.

| Level | Onset (hits to ~63% fatigue) | Max degradation |
| --- | --- | --- |
| Medium | 6 hits | 55% |
| Hard | 10 hits | 45% |
| Expert | 16 hits | 35% |
| Extreme | 22 hits | 25% |

Beginner and Easy have no fatigue. Extreme's fatigue is barely perceptible — only marathon rallies produce a meaningful effect.

---

## Extreme mode

Toggle in the right panel before starting. Locked during play. The AI difficulty slider is disabled when Extreme is active.

- AI uses fully predictive targeting and aims for steep outgoing angles rather than just the contact point.
- AI speed and aggression are far above the Expert slider maximum.
- Ball speed ramp is exponential and reaches near-maximum within the first few exchanges.
- All powerups are disabled.
- The Mode panel pulses red. Theme and format buttons lock as normal.

---

## Themes

Four themes are selectable from the Theme tab strip in the footer. The selected theme persists across page reloads via `localStorage`. Theme buttons lock during an active match and re-enable on Restart.

| Theme | Player colour | AI colour | Canvas style |
| --- | --- | --- | --- |
| **Neon** | Cyan `#00d4e0` | Orange `#ff7c2a` | Deep black, gradient paddles, sphere-shaded ball |
| **Retro** | White | White/grey | Pure black, flat rectangles — classic 1972 Pong |
| **Synthwave** | Magenta `#e040fb` | Electric cyan `#00e5ff` | Deep purple, perspective grid on lower half of canvas |
| **Arctic** | Blue `#0088cc` | Burnt orange `#e05500` | White-to-pale-blue gradient — the only light theme |

Each theme applies a full set of CSS custom properties to `:root`, so every UI element — scoreboard colours, panel borders, slider thumbs, toggle tracks, status pills, match track dots — updates automatically. The canvas renderer reads the active theme from `themes.js` and adjusts paddle style, ball rendering, net style, and trajectory colour accordingly.

Paddle styles per theme:

- Neon / Synthwave — gradient body with a thin bright edge highlight
- Retro — flat crisp rectangle, no gradient, no glow
- Arctic — solid fill with a subtle drop shadow

---

## Trajectory visualizer

Toggle in the right panel at any time, including during play.

When on, a dashed line traces the ball's predicted path to the AI paddle including wall bounces, with a small contact-point dot at the end. The line colour and style follow the active theme. The prediction uses the same algorithm as the AI's targeting so the line accurately reflects where the AI expects the ball.

---

## Layout and scaling

The UI uses a strict three-column grid (`clamp(148px, 13vw, 210px) 1fr clamp(148px, 13vw, 210px)`) applied identically to the top bar and the main area. This means every element is pixel-locked to the canvas column edges:

- The brand and action buttons (Pause/Restart) sit in the left and right columns of the top bar, vertically centred relative to the scoreboard height.
- The scoreboard, VS label, game badge, deuce pill, and match track dots all sit in the centre column, directly above the canvas.
- The left and right side panels align exactly under the brand and action button columns respectively.
- The footer tab strips (Format and Theme) are a simple flex row centred across the full width, independent of the grid.

All panel text, pips, keys, sliders, and toggles scale with `clamp()` so the layout adapts from narrow to wide viewports without scrollbars. The canvas is letterboxed to 3:2 inside the centre column using a `ResizeObserver`, rescaling all game object positions proportionally on every resize.

---

## Physics notes

- **Swept collision** — ball-paddle collision uses slab-intersection sweep rather than AABB overlap, preventing tunnelling at high speed.
- **Velocity model** — `vx`/`vy` are the true velocity. `moveBall` applies them directly per frame. `handlePaddleBounce` preserves current speed and changes only angle — no per-hit compounding.
- **Asymptotic ramp** — `applySpeedRamp` nudges `vx`/`vy` toward the level's `maxSpeed` each frame using the exponential formula. Speed never spikes, never exceeds the cap.
- **Wall bounce** — uses `Math.abs(vy)` to prevent floating-point sign drift.
- **Rally hit counter** — increments on every paddle contact (both swept and AABB paths), resets on every point scored. Drives the AI fatigue system.

---

## Developer notes

### Key areas in `main.js`

- `init()` — canvas sizing, ResizeObserver, theme restore from localStorage, first render.
- `startGame()` — reads settings, locks inputs, creates ball with difficulty-appropriate parameters.
- `onPointScored(side)` — handles point/game/match resolution, resets `rallyHits`, updates score state.
- `update(dt, timestamp)` — per-frame: asymptotic ramp, swept collision, `rallyHits` increment, AI move.
- `doResizeCanvas()` — letterboxes 3:2 canvas into centre panel; rescales positions proportionally.
- `refreshUI()` — single function syncing all DOM to current state; called after every state change.
- `applyTheme(themeId)` — applies CSS vars, sets renderer theme, persists to localStorage.

### Key areas in `scoring.js`

- `handlePointScored(side, state)` — pure function; returns `{ state, result }`. Appends winner to `gameWinOrder[]` on every game won.
- `getPointStatus(state)` — suppresses pills entirely during deuce zone (both equal and advantage states).
- `getAdvantage(state)` — drives `ADV` score display.
- `gameWinOrder[]` — chronological array of `'player'`/`'ai'` strings; drives match track dot colouring.

### Key areas in `difficulty.js`

- `DIFFICULTY[1..5]` and `DIFFICULTY.extreme` — each entry is a self-contained config object with speed, AI, and fatigue parameters.
- `getFatigue(cfg, rallyHits)` — returns fatigue value 0..1 using exponential curve.
- `applyFatigue(base, fatigue, depth)` — scales any parameter down by `fatigue × depth`.

### Key areas in `themes.js`

- `THEMES` — four theme objects each containing a `css` map (CSS variable overrides) and a `canvas` config (colours, paddle style, ball style, net, trajectory, optional grid).
- `applyThemeCSS(themeId)` — iterates the CSS map and sets properties on `:root`; also sets `document.body.dataset.theme` for per-theme CSS overrides.
- `setRendererTheme(themeId)` in `renderer.js` — updates the module-level `TC` canvas config reference used by all draw functions.

### Browser compatibility

- Requires ES module support (all modern browsers).
- `ctx.roundRect` used for paddle rendering with `arcTo` fallback for Safari < 15.4.
- `ResizeObserver` for canvas sizing (all modern browsers).
- `localStorage` for theme persistence (gracefully caught if unavailable).

---

## Potential future improvements

- Sound effects: paddle hits, wall bounces, point scored, match won.
- Mobile/touch support: `touchmove` handler on the canvas.
- Unit tests for `scoring.js`, `physics.js`, and `difficulty.js` (all export pure functions, straightforward to test with Vitest or Jest).
- Visual feedback on powerup activation (brief flash on the paddle).
- Persist player name to `localStorage` between sessions.
- Additional themes (e.g. a warm amber/sepia theme, a high-contrast accessibility theme).
  