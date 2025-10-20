# Pong.AI 

A modern single-file Pong implementation with configurable AI and powerups.

This repository contains a compact browser-based Pong game (HTML/JS/CSS). It's intended as a fun demo and starting point for experiments with game AI and small UI/UX niceties. The playable files are:

- `index.html` — game UI and canvas
- `script.js` — game logic, AI, inputs and powerups
- `styles.css` — visual styles and simple responsive behavior

Overview / Rules
----------------
- Standard Pong-style play: a player paddle on the left and an AI paddle on the right.
- The ball serves from the center. A point is scored when the opponent misses the ball.
- Two game modes:
  - One-shot: First to N points wins (configurable).
  - Match: Best of 3 games (first to win 2 games wins the match).
- Deuce rules: When both players reach the target - 1, deuce rules apply and a two-point lead is required to win.

Controls
--------
- Move your paddle: move the mouse over the canvas.
- Start game / Serve: Click the canvas or press Space.
- Pause / Resume: Press Space during play or click Pause.
- Restart: Click Restart to reset points and inputs.
- Cheat key powerups (when available during a running game):
  - W — speed powerup (boosts player paddle responsiveness for the point)
  - D — size powerup (increases player paddle height for the point)

Settings / UI
-------------
- Ball speed ramp (seconds): how quickly ball base speed ramps up during active play.
- First to: target points for one-shot games.
- Game mode: choose between One-shot and Match (best of 3).
- AI difficulty: range 1–5; affects AI lookahead and base speed for the next game.
- Extreme Mode (toggle): an optional "extreme" option that when enabled (and the game starts):
  - Substantially boosts AI performance (faster, more aggressive, and predictive).
  - Uses an exponential ball speed ramp (faster than normal ramping).
  - Disables all player powerups for the duration of the game/match.

Important behavior regarding inputs
----------------------------------
- Most inputs (game mode, names, difficulty, ramp, target) are editable before starting a game.
- When a game starts, settings are locked (disabled) until the game ends or you restart.
- In Match mode, once a match starts inputs stay locked for the full match (through all games) and are re-enabled only when the match ends or you Restart.
- The Extreme Mode toggle is editable pre-game and then disabled during active play; Restart re-enables it.

Powerups
--------
- Player has limited powerups per game (default 2).
- Powerups are consumed per point and reset when games are restarted or per-match logic triggers a reset.
- In Extreme Mode powerups are fully disabled.

AI behavior notes
-----------------
- Normal AI uses a predictive target and a difficulty parameter to tune lookahead and base speed.
- Extreme AI predicts the contact point, positions its paddle to force steep outgoing angles away from the player, and moves aggressively to reach that target while almost teleporting .

Developer notes
---------------
- `script.js` contains the main game loop, the AI, and UI toggling logic. Key areas to inspect/extend:
  - Initialization / startGame / announceWinner — input locking and game flow.
  - `update(dt, timestamp)` — main physics update, time-based speed ramping.
  - AI movement / targeting block — logic for predictive movement and extreme-mode strategies.
  - Powerup activation and UI update functions.
- `styles.css` contains a few helper styles and the toggle switch style added for Extreme mode.

How to run locally
------------------
- Open `index.html` in a modern browser (Chrome/Edge/Firefox). No build step is required.

How to play online
------------------

🎮 Play here → [Pong.AI on GitHub Pages](http://pong.ai/)


Potential next improvements
---------------------------
- Add unit tests for scoring and ramp math (requires refactoring into smaller modules).
- Add volume controls and sound effects for paddle hits and scoring.
- Add a small visual that previews the AI's predicted contact point and intended outgoing trajectory (helpful for debug and balancing).
- Tweak the Extreme mode parameters to balance fun vs. challenge.
