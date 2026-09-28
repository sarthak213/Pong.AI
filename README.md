# Pong.AI

A modern single-player browser Pong game against an adaptive AI. It has four difficulty levels, powerups, tennis-style deuce scoring, multiple match formats, a trajectory visualizer, four visual themes, and an online leaderboard.

🎮 **Play here → [Pong.AI on GitHub Pages](https://sarthak213.github.io/Pong.AI/)**

---

## File structure

```text
PONG.AI/
├── index.html           — Play page: menu, game and game-over screens
├── leaderboard.html     — Leaderboard page (top scores, recent matches, players)
├── how-to-play.html     — Rules and controls page
├── styles.css           — All UI styles; colours are HSL tokens switched by [data-game-theme]
├── main.js              — Play page orchestrator: screens, game loop, input, HUD, game-over, saving results
├── ui.js                — Shared UI: Lucide icons, theme pickers, leaderboard row rendering
├── leaderboard.js       — Supabase REST client + score formula (no SDK)
├── leaderboard-page.js  — Renders leaderboard.html
├── config.js            — Supabase project URL + public anon key
├── physics.js           — Ball creation, asymptotic speed ramp, swept collision, prediction
├── ai.js                — AI paddle targeting with fatigue, scaled aiming and trajectory builder
├── difficulty.js        — Per-level parameters: speed, AI behaviour, aiming and fatigue config
├── powerups.js          — Powerup state, activation, per-point and per-game resets
├── scoring.js           — Point scoring, deuce rules, game/match win detection
├── renderer.js          — Theme-aware canvas drawing: paddles, ball, net, trajectory
├── themes.js            — Theme definitions (canvas config, picker swatches) and theme persistence
├── supabase/schema.sql  — Leaderboard database: table, security rules and functions
├── favicon.svg          — Browser tab icon (paddles + ball); favicon.ico and apple-touch-icon.png are PNG renders of it
├── LICENSE
└── README.md
```

Every page loads its script as `<script type="module">`. Game logic files (`physics`, `ai`, `difficulty`, `powerups`, `scoring`) export pure functions with no side effects; `main.js` owns all mutable game state.

Icons come from [Lucide](https://lucide.dev) (loaded from jsDelivr). Fonts are Inter and JetBrains Mono from Google Fonts.

---

## How to run

ES modules need a local server, because browsers block `import` over `file://`.

```bash
# Node (recommended)
npx serve .

# Python
python -m http.server 8080
```

Then open `http://localhost:8080`, or use the **Live Server** extension in VS Code.

The GitHub Pages deployment at `https://sarthak213.github.io/Pong.AI/` always serves the latest `main` branch.

---

## Online leaderboard (Supabase)

GitHub Pages only serves static files, so finished matches are stored in a free [Supabase](https://supabase.com) Postgres database that the browser talks to directly.

### One-time setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon / publishable** key.
4. Paste them into [`config.js`](config.js):

   ```js
   export const SUPABASE_URL      = 'https://your-project.supabase.co';
   export const SUPABASE_ANON_KEY = 'your-anon-or-publishable-key';
   ```

5. Commit and push. The leaderboard is live.

If `config.js` is left empty, the game still works. The leaderboard panels show "not connected" and results aren't saved.

> Never put the **service_role / secret** key in `config.js`. Only the anon key is meant to be public.

### How it's secured

- `game_results` has row-level security: anyone can **read**, and nobody can insert, update or delete directly.
- New results go through the `submit_game_result()` database function. It validates every field (name length, difficulty, theme, format, games won vs. format) and **calculates the score on the server**, so a client can't post an arbitrary score.
- `leaderboard_players()` returns per-player stats for the Players tab.

### Scoring

```text
Score = (points won × 10 + 100 per game won + 50 for winning the match) × difficulty multiplier
```

| Difficulty | Multiplier |
| --- | --- |
| Easy | ×1 |
| Medium | ×1.5 |
| Hard | ×2 |
| Extreme | ×3 |

The formula lives in `compute_score()` in `supabase/schema.sql` (authoritative) and is mirrored in `computeScore()` in `leaderboard.js`, which shows the score on the game-over screen before the save finishes. Keep the two in sync.

---

## Screens

### Menu

- **Player name** (up to 14 characters, required to start).
- **AI difficulty** as four cards (Easy, Medium, Hard, Extreme), each showing ball speed range and score multiplier.
- **Theme** tiles with a mini court preview.
- **Match format**: One-shot, Best of 3, Best of 5, Best of 7.
- **Trajectory visualizer** toggle.
- An animated court preview drawn in the selected theme's canvas colours, and the top 3 scores for the selected difficulty. The right column is sized to the setup card, so both columns end together.

Name, difficulty, format and trajectory are remembered in `localStorage` (`pongai-settings`).

### Game

- **Scoreboard**: player and AI score (pops on every point; shows **ADV** on advantage, as in tennis), games-won pips, and a *Game point* / *Match point* tag under the name. With more than one, it shows the count, e.g. *4 game points*. The centre shows *first to 7*, format · difficulty · game number, and a *Deuce #n* pill on the same row as the tags. Names sit in a fixed-width column, so tags never move the scores.
- **Point flashes**: a large animated banner over the court after every point: `+1` / `AI +1`, `DEUCE`, `GAME · NAME`, and `VICTORY` / `DEFEAT`.
- **Side panel**: powerup buttons with remaining pips, trajectory toggle, Pause/Resume, Restart and Quit, and a Controls card that fills down to the court's bottom edge.

### Game over

Shown 1.8 s after the final point:

- Victory/Defeated, games score and final game score.
- Stats: points won, longest rally, deuces and duration.
- Leaderboard score (animated count-up) and save status with your rank on that difficulty and overall.
- **Rematch** (same settings) or **Menu**, plus the top 10 for that difficulty with your new entry highlighted.

---

## Rules

- Player paddle on the left, AI on the right. The ball serves from centre.
- A point is scored when the opponent fails to return the ball.
- First to **7 points** wins the game.
- **Deuce** at 6–6: win a point for Advantage, then one more to win the game. Losing the point on advantage returns to deuce, as many times as needed.

| Format | Games needed to win |
| --- | --- |
| One-shot | 1 |
| Best of 3 | 2 |
| Best of 5 | 3 |
| Best of 7 | 4 |

---

## Controls

| Action | Input |
| --- | --- |
| Move paddle | Mouse over the court, or drag on touch screens |
| Serve | Click the court or **Space** |
| Pause / Resume | **Space** during play, or the Pause button |
| Restart match | Restart button |
| Leave match | Quit button |
| Speed powerup | **W**, or click Speed (during a rally) |
| Size powerup | **D**, or click Size (during a rally) |

---

## Powerups

- 2 per game, reset each new game. Disabled in Extreme.
- One per point. Effects end when the point ends.

| Key | Effect |
| --- | --- |
| **W**: Speed | Player paddle tracks 4× faster; AI movement slowed to 60% |
| **D**: Size | Player paddle grows to 1.6× height for the point |

---

## AI difficulty

### Speed model

Ball speed follows an asymptotic ramp per level:

```javascript
speed(t) = maxSpeed − (maxSpeed − startSpeed) × e^(−t / rampTau)
```

`t` is elapsed play time in the current game. Bounces don't compound speed; the ramp is the only source of acceleration.

| Level | Start speed | Max speed | Time to ~95% max |
| --- | --- | --- | --- |
| Easy | 5 | 10 | ~42 s |
| Medium | 7 | 15 | ~33 s |
| Hard | 9 | 20 | ~21 s |
| Extreme | 10 | 26 | ~15 s |

### AI model

| Level | Prediction blend | Aggression | Max paddle speed | Aim aggression | Trap setup |
| --- | --- | --- | --- | --- | --- |
| Easy | 9% | 0.07 | 3.5 | 0.25 | No |
| Medium | 37% | 0.15 | 6.5 | 0.55 | No |
| Hard | 50% | 0.28 | 9.5 | 0.72 | Yes |
| Extreme | 75% | 0.55 | 12 | 0.97 | Yes |

- **Prediction blend** mixes tracking the live ball with tracking the predicted contact point after wall bounces.
- **Aim aggression** controls how hard the AI hunts steep angles instead of safe centre returns.
- **Trap setup** makes the AI aim at the edge of your paddle to force awkward returns.

### Fatigue

At every level the AI degrades as a rally gets longer:

```javascript
fatigue(n) = 1 − e^(−n / fatigueOnset)
```

`n` is the rally hit count (resets every point). Fatigue scales prediction, aggression, max speed and aim down together.

| Level | Onset (hits to ~63% fatigue) | Max degradation |
| --- | --- | --- |
| Easy | 8 | 55% |
| Medium | 12 | 45% |
| Hard | 15 | 40% |
| Extreme | 20 | 35% |

---

## Themes

Four themes: **Neon**, **Retro**, **Synthwave** and **Arctic** (the only light theme).

- Pick a theme from the menu tiles or the swatches in the header. It's saved in `localStorage` (`pongai-theme`) and used on every page.
- **The theme locks when a match starts.** On the game screen every theme picker is hidden (`body.in-match .theme-switcher`). They come back on the game-over screen and the menu.
- UI colours are HSL tokens in `styles.css` under `[data-game-theme='…']` on `<html>`. A tiny inline script in each page's `<head>` applies the saved theme before first paint to avoid a flash.
- The canvas look (paddle style, ball, net, trajectory colour, Synthwave grid) comes from each theme's `canvas` config in `themes.js`, applied through `setRendererTheme()`.

| Theme | Player colour | AI colour | Canvas style |
| --- | --- | --- | --- |
| **Neon** | Cyan `#00d4e0` | Orange `#ff7c2a` | Deep black, gradient paddles, sphere-shaded ball |
| **Retro** | White | Grey | Pure black, flat rectangles, like 1972 Pong |
| **Synthwave** | Magenta `#e040fb` | Cyan `#00e5ff` | Deep purple, perspective grid on the lower half |
| **Arctic** | Blue `#0088cc` | Burnt orange `#e05500` | White-to-pale-blue gradient |

---

## Trajectory visualizer

When on, a dashed line traces the ball's predicted path to the AI paddle, including wall bounces, with a dot at the contact point. It uses the same prediction as the AI. Toggle it on the menu or in the game side panel at any time.

---

## Physics notes

- **Swept collision**: ball–paddle collision uses a slab-intersection sweep, which prevents tunnelling at high speed.
- **Velocity model**: `handlePaddleBounce` keeps the current speed and changes only the angle.
- **Asymptotic ramp**: `applySpeedRamp` nudges the velocity toward `maxSpeed` each frame, never past it.
- **Canvas sizing**: the canvas is letterboxed to 3:2 inside the court using a `ResizeObserver`, and all positions rescale proportionally on resize.

---

## Developer notes

### `main.js`

- `startMatch()` resets score, powerups and match stats from the saved settings and shows the game screen (also used by Restart and Rematch).
- `showScreen(name)` switches between `menu`, `game` and `over`, and toggles `body.in-match`, which hides theme pickers.
- `onPointScored(side)` resolves point/deuce/game/match, fires the court flash and updates match stats.
- `refreshUI()` syncs the scoreboard, powerups and buttons with the current state.
- `finishMatch(winner)` builds the match summary, renders the game-over screen, saves the result, and switches screens after 1.8 s. `matchToken` discards late async work from a match that was quit or restarted.
- `update(dt, timestamp)` is the per-frame physics, collision, rally counter and AI move. The loop only updates and draws while the game screen is visible.

### `leaderboard.js` / `ui.js`

- `submitResult()`, `fetchResults()` and `fetchPlayers()` call Supabase's REST API with `fetch`. Legacy JWT anon keys are also sent as `Authorization`; new publishable keys go only in `apikey`.
- `mountResults(el, opts)` renders a loading/error/empty/list state into an element and returns a reload function.
- `initPage()` applies the saved theme, renders every `[data-theme-picker]`, and draws Lucide icons.

### Browser compatibility

- Requires ES modules, `ResizeObserver` and CSS `aspect-ratio` (all modern browsers).
- `ctx.roundRect` for paddles, with an `arcTo` fallback for Safari < 15.4.

---

## Potential future improvements

- Sound effects: paddle hits, wall bounces, points, match won.
- Unit tests for `scoring.js`, `physics.js` and `difficulty.js` (pure functions, straightforward with Vitest or Jest).
- Shot types (top spin, curve) with a meter; see `v4.0.txt`.
- Rate limiting or captcha on result submission if the leaderboard gets spammed.
