# Pong.AI

A modern single-player browser Pong game with configurable AI, powerups, multiple match formats, and a trajectory visualizer.

🎮 **Play here → [Pong.AI on GitHub Pages](https://sarthak213.github.io/Pong.AI/)**

---

## File structure

The original single-file `script.js` has been split into focused ES modules:

``` text
PONG.AI/
├── index.html      — UI layout: scoreboard, panels, canvas, footer
├── styles.css      — Dark theme, viewport-fitted no-scroll layout
├── main.js         — Orchestrator: game loop, input, resize, state management
├── physics.js      — Ball creation, swept collision, movement, wall bounce, trajectory prediction
├── ai.js           — AI paddle targeting and trajectory segment builder
├── powerups.js     — Powerup state, activation, per-point and per-game resets
├── scoring.js      — Point scoring, deuce rules, game/match win detection, counters
├── renderer.js     — Canvas drawing: paddles, ball, net, trajectory line
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
- First player to reach **7 points** wins the game. Win score is fixed and not configurable.
- **Deuce rules apply** when both players reach 6–6: a two-point lead is then required to win the game. Deuce can repeat indefinitely.

---

## Match formats

Select via the tab strip in the footer. Locked once a game starts; re-enabled on Restart.

| Format | Games needed to win |
| --- | --- |
| One-shot | First to 7 points, single game |
| Best of 3 | First to win 2 games |
| Best of 5 | First to win 3 games |
| Best of 7 | First to win 4 games |

Game dots in the scoreboard track wins per player and automatically show/hide based on the selected format.

---

## Scoreboard

The header scoreboard updates live with the following indicators:

- **Score** — shows the current point count, or `ADV` when a player has advantage during deuce.
- **Game point (n)** — appears under a player's score when they are one point from winning the game. `n` is the cumulative count of times that player has reached game point this game (tennis-style).
- **Match point (n)** — same, but when winning this point would also win the match.
- **Deuce (#n)** — a pill centred below both scores, shown only while deuce is active. `#n` is the number of times deuce has been reached in the current game, starting from 1 on the first 6–6.
- **Game dots** — filled circles below each score indicate games won in the current match.

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

Powerup keys are ignored when an input field is focused.

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

## AI settings

Both settings are on the right panel, locked during active play, and re-enabled on Restart.

**AI difficulty (1–5)** — controls how accurately the AI predicts the ball's contact point and how fast its paddle moves. At difficulty 1 the AI mostly tracks the current ball position; at 5 it fully predicts the bounced trajectory. The difficulty also determines how quickly the speed ramp advances — higher difficulty compresses the ramp so the ball reaches peak speed sooner.

**Speed ramp (1–60 s)** — sets the base duration for the ball speed ramp within each game. Ball speed starts at the base level and increases as play time accumulates. On each paddle hit, speed also increases by 5% (compounding), with an absolute cap to prevent the ball becoming invisible.

---

## Extreme mode

Toggle in the right panel before starting. Locked during play.

When enabled:

- AI speed and aggression are multiplied by 5×.
- AI predicts the exact contact point and angles its return to maximise difficulty for the player.
- Ball speed uses an exponential ramp instead of linear.
- All powerups are disabled for the duration.
- The status panel pulses red.

---

## Trajectory visualizer

Toggle in the right panel at any time, including during play.

When on, a faint dashed orange line traces the ball's predicted path to the AI paddle, including wall bounces. A small dot marks the predicted contact point. The line updates every frame based on current ball velocity. This is useful for learning how the AI positions itself and for understanding ball angles.

---

## Physics notes

- **Swept collision** — ball-paddle collision is resolved with a slab-intersection sweep rather than simple AABB overlap, so the ball cannot tunnel through paddles at high speed even at the top of the ramp.
- **Velocity model** — `vx`/`vy` are the true velocity vector. `moveBall` applies them directly per frame without re-normalising. `handlePaddleBounce` writes a new `vx`/`vy` derived from the bounce angle and a 5% speed increase, which persists and compounds across rallies.
- **Wall bounce** — top and bottom edges use `Math.abs(vy)` to ensure the ball always deflects correctly regardless of floating-point sign drift.
- **Ramp** — the speed ramp scales `ball.speed` (the base reference) over time and applies it as a gentle push in the current direction each frame, so the ball accelerates smoothly without snapping.

---

## Developer notes

### Key areas in `main.js`

- `init()` — canvas sizing, ResizeObserver setup, first render, overlay.
- `startGame()` — reads settings, locks inputs, sets ramp parameters.
- `onPointScored(side)` — handles point, game, and match resolution; resets appropriate state.
- `update(dt, timestamp)` — per-frame physics: ramp, swept collision, AI move, score check.
- `doResizeCanvas()` — fits a 3:2 canvas letterboxed into the center panel using `clientWidth`/`clientHeight`; rescales all game object positions proportionally.
- `refreshUI()` — single function that syncs all DOM elements to current state; called after every state change.

### Key areas in `scoring.js`

- `handlePointScored(side, state)` — pure function; returns `{ state, result }`. Results: `'point'`, `'deuce'`, `'gameWon:player'`, `'gameWon:ai'`, `'matchWon:player'`, `'matchWon:ai'`.
- `getPointStatus(state)` — returns `{ player, ai }` with `{ type, count }` or `null` for each side; drives the per-player status pills.
- `getAdvantage(state)` — returns `'player'`, `'ai'`, or `null`; drives the `ADV` score display.

### Layout

The UI is a full-viewport flex column (`height: 100vh; overflow: hidden`) with a fixed header, fixed footer, and a three-column grid (`150px 1fr 150px`) for the main area. The canvas is absolutely positioned inside `.center-panel` and letterboxed to maintain 3:2 at any viewport size. No scrollbars ever appear.

### Browser compatibility

- Requires ES module support (all modern browsers).
- `ctx.roundRect` is used for paddle rendering with an `arcTo` fallback for Safari < 15.4.
- `ResizeObserver` is used for canvas resizing (supported in all modern browsers).

---

## Potential future improvements

- Sound effects: paddle hits, wall bounces, point scored, match won.
- Mobile/touch support: `touchmove` handler on the canvas.
- Unit tests for `scoring.js` and `physics.js` (both export pure functions, making them straightforward to test with Vitest or Jest).
- AI difficulty names (e.g. Beginner / Easy / Medium / Hard / Expert) alongside the numeric slider.
- Visual feedback on powerup activation (brief flash or paddle glow).
- Persist player name to `localStorage` between sessions.
