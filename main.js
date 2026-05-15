// main.js — game orchestrator

import { createBall, clamp, sweptPaddleCollision, collidesWithPaddle, handlePaddleBounce, moveBall, bounceWalls } from './physics.js';
import { moveAI } from './ai.js';
import { createPowerupState, tryActivatePowerup, getPowerupEffects, resetPowerupAfterPoint, resetPowerupForGame } from './powerups.js';
import { createScoreState, resetScoreForNewGame, resetScoreForNewMatch, handlePointScored, getPointStatus, getAdvantage, isDeuce, WIN_SCORE, MATCH_FORMATS } from './scoring.js';
import { draw, setRendererTheme } from './renderer.js';
import { THEMES, THEME_ORDER, applyThemeCSS } from './themes.js';

// ─── Overlay helpers ───────────────────────────────────────────────────────────
function showOverlay(text) {
    const el  = document.getElementById('overlay');
    const msg = document.getElementById('message');
    if (msg) msg.textContent = text;
    if (el)  el.style.display = 'flex';
}
function hideOverlay() {
    const el = document.getElementById('overlay');
    if (el)  el.style.display = 'none';
}

// ─── Canvas & context ──────────────────────────────────────────────────────────
const canvas = document.getElementById('pong');
const ctx    = canvas.getContext('2d');

// ─── Base proportions ─────────────────────────────────────────────────────────
const BASE_W = 900, BASE_H = 600;
const BASE_PADDLE_W = 16, BASE_PADDLE_H = 100, BASE_BALL_R = 10;
const BASE_PLAYER_X = 20, BASE_AI_MARGIN = 20;

// ─── Scaled constants — recomputed on resize ───────────────────────────────────
let PADDLE_WIDTH = BASE_PADDLE_W;
let PADDLE_HEIGHT = BASE_PADDLE_H;
let BALL_RADIUS   = BASE_BALL_R;
let PLAYER_X      = BASE_PLAYER_X;
let AI_MARGIN     = BASE_AI_MARGIN;
let gameplayScale = 1;

const getAI_X = () => (canvas.width / (window.devicePixelRatio || 1)) - PADDLE_WIDTH - AI_MARGIN;
const getDisplaySize = () => {
    const dpr = window.devicePixelRatio || 1;
    return { displayW: canvas.width / dpr, displayH: canvas.height / dpr };
};

// ─── Game state ────────────────────────────────────────────────────────────────
let score   = createScoreState();
let powerup = createPowerupState();

let ball;
let playerY = 0, aiY = 0;
let PADDLE_HEIGHT_current = PADDLE_HEIGHT;
let playerSpeedMult = 1, aiSpeedMult = 1;

let running        = false;
let isPaused       = false;
let extremeMode    = false;
let showTrajectory = true;

// FIX #2: speedMultiplier now only drives ball.speed on serve reset.
// During play, vx/vy carry the true velocity; ramp is applied at serve time.
let effectiveRampSeconds = 10;
let startTimestamp       = null;
let accumulatedPlayTime  = 0;
let lastTime             = null;

let settings = { aiDifficulty: 3, rampSeconds: 10 };

// ─── DOM refs ──────────────────────────────────────────────────────────────────
const playerNameInput = document.getElementById('playerName');
const pauseBtn        = document.getElementById('pauseBtn');
const restartBtn      = document.getElementById('restartBtn');
const rampInput       = document.getElementById('rampTime');
const aiDiffInput     = document.getElementById('aiDifficulty');
const aiDiffLabel     = document.getElementById('aiDiffLabel');
const rampLabel       = document.getElementById('rampLabel');
const extremeToggle   = document.getElementById('extremeMode');
const trajToggle      = document.getElementById('trajToggle');
const matchFormatBtns = document.querySelectorAll('.fmt-btn');
const themeBtns       = document.querySelectorAll('.theme-btn');

// ─── Theme state ───────────────────────────────────────────────────────────────
let currentTheme = 'neon';

function applyTheme(themeId) {
    if (!THEMES[themeId]) return;
    currentTheme = themeId;
    applyThemeCSS(themeId);
    setRendererTheme(themeId);
    themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === themeId));
    // Persist to localStorage so it survives page reloads
    try { localStorage.setItem('pongai-theme', themeId); } catch {}
}

// ─── Canvas sizing ─────────────────────────────────────────────────────────────
function doResizeCanvas() {
    const dpr   = window.devicePixelRatio || 1;
    const panel = canvas.parentElement;
    if (!panel) return;

    const availW = panel.clientWidth;
    const availH = panel.clientHeight;
    const ratio  = BASE_W / BASE_H;

    let cssW = availW;
    let cssH = availW / ratio;
    if (cssH > availH) { cssH = availH; cssW = availH * ratio; }
    cssW = Math.floor(cssW);
    cssH = Math.floor(cssH);

    canvas.style.position = 'absolute';
    canvas.style.left     = Math.floor((availW - cssW) / 2) + 'px';
    canvas.style.top      = Math.floor((availH - cssH) / 2) + 'px';
    canvas.style.width    = cssW + 'px';
    canvas.style.height   = cssH + 'px';

    const newW = Math.floor(cssW * dpr);
    const newH = Math.floor(cssH * dpr);

    if (canvas.width !== newW || canvas.height !== newH) {
        const prevW = canvas.width  || newW;
        const prevH = canvas.height || newH;

        canvas.width  = newW;
        canvas.height = newH;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const scaleX = newW / prevW;
        const scaleY = newH / prevH;
        if (ball) { ball.x *= scaleX; ball.y *= scaleY; }
        playerY *= scaleY;
        aiY     *= scaleY;

        const sf = cssW / BASE_W;
        gameplayScale = sf;
        PADDLE_WIDTH  = Math.max(6,  Math.round(BASE_PADDLE_W * sf));
        PADDLE_HEIGHT = Math.max(30, Math.round(BASE_PADDLE_H * sf));
        BALL_RADIUS   = Math.max(3,  Math.round(BASE_BALL_R   * sf));
        PLAYER_X      = Math.max(6,  Math.round(BASE_PLAYER_X  * sf));
        AI_MARGIN     = Math.max(6,  Math.round(BASE_AI_MARGIN * sf));

        // FIX #3: reapply active powerup scale after resize instead of blindly resetting.
        PADDLE_HEIGHT_current = powerup.active === 'size'
            ? Math.min(PADDLE_HEIGHT * 1.6, getDisplaySize().displayH - 10)
            : PADDLE_HEIGHT;

        const { displayH: dH } = getDisplaySize();
        playerY = clamp(playerY, 0, dH - PADDLE_HEIGHT_current);
        aiY     = clamp(aiY,     0, dH - PADDLE_HEIGHT);
    }
}

function getPlayerName() { return playerNameInput?.value?.trim() || 'Player'; }

function resetPositions() {
    const { displayH } = getDisplaySize();
    playerY = (displayH - PADDLE_HEIGHT_current) / 2;
    aiY     = (displayH - PADDLE_HEIGHT) / 2;
}

function newBall(servingTo) {
    const { displayW, displayH } = getDisplaySize();
    return createBall(displayW, displayH, gameplayScale, servingTo);
}

// ─── Speed ramp ────────────────────────────────────────────────────────────────
// Returns a multiplier applied to the ball's base speed at serve time only.
// During a rally, vx/vy grow naturally via bounce speed-ups.
function getRampMultiplier() {
    if (!startTimestamp) return 1;
    const elapsed = accumulatedPlayTime + (performance.now() - startTimestamp) / 1000;
    if (extremeMode) {
        return Math.min(3, 1 + (Math.exp(elapsed / Math.max(1, effectiveRampSeconds)) - 1) * 0.3);
    }
    return Math.max(1, 1 + elapsed / effectiveRampSeconds * 0.4);
}

// ─── Scoring / game flow ───────────────────────────────────────────────────────
function onPointScored(side) {
    const { state: newScore, result } = handlePointScored(side, score);
    score = newScore;

    powerup = resetPowerupAfterPoint(powerup, extremeMode);
    playerSpeedMult = 1;
    aiSpeedMult     = 1;
    PADDLE_HEIGHT_current = PADDLE_HEIGHT;
    running = false;
    refreshUI();

    if (result === 'deuce') {
        // FIX #13: serve toward the scorer (who just evened it up), not away.
        ball = newBall(side);
        showOverlay(`Deuce! — click or Space to serve`);
        return;
    }

    if (result?.startsWith('matchWon:')) {
        const winner = result.split(':')[1];
        const name   = winner === 'player' ? getPlayerName() : 'AI';
        const other  = winner === 'player' ? 'ai' : 'player';
        ball = newBall(side === 'player' ? 'ai' : 'player');
        resetPositions();
        score.matchEnded = true;
        unlockInputs();
        showOverlay(`${name} wins the match ${score.gamesWon[winner]}–${score.gamesWon[other]}! Click Restart to play again.`);
        return;
    }

    if (result?.startsWith('gameWon:')) {
        const winner = result.split(':')[1];
        const name   = winner === 'player' ? getPlayerName() : 'AI';
        // FIX #4: read gamesTotal from the returned state BEFORE resetting.
        const gamesTotal = newScore.gamesWon.player + newScore.gamesWon.ai;

        // FIX #9: reset ramp state between games in a match.
        accumulatedPlayTime = 0;
        startTimestamp      = null;

        score   = resetScoreForNewGame(score);
        powerup = resetPowerupForGame(extremeMode);
        ball    = newBall(winner === 'player' ? 'ai' : 'player');
        resetPositions();
        refreshUI();
        showOverlay(`${name} wins game ${gamesTotal}! Click or Space to start next game.`);
        return;
    }

    // Normal point
    ball = newBall(side === 'player' ? 'ai' : 'player');
    showOverlay(`Point for ${side === 'player' ? getPlayerName() : 'AI'} — click or Space to serve`);
}

// ─── Game start / pause / restart ─────────────────────────────────────────────
function startGame() {
    if (score.matchEnded) return;
    settings.aiDifficulty = parseInt(aiDiffInput?.value ?? '3', 10);
    settings.rampSeconds  = parseFloat(rampInput?.value ?? '10');
    extremeMode = !!(extremeToggle?.checked);

    if (extremeMode) powerup = resetPowerupForGame(true);

    const aiNorm = (settings.aiDifficulty - 1) / 4;
    effectiveRampSeconds = 20 - aiNorm * 14;

    // Only reset ramp if starting fresh (not resuming mid-match).
    if (accumulatedPlayTime === 0) startTimestamp = null;

    if (!ball) ball = newBall();
    running  = true;
    isPaused = false;
    lockInputs();
    hideOverlay();
    refreshUI();
}

function lockInputs() {
    if (playerNameInput) playerNameInput.disabled = true;
    if (aiDiffInput)     aiDiffInput.disabled     = true;
    if (extremeToggle)   extremeToggle.disabled   = true;
    if (rampInput)       rampInput.disabled        = true;
    matchFormatBtns.forEach(b => b.disabled = true);
}

function unlockInputs() {
    if (playerNameInput) playerNameInput.disabled = false;
    if (aiDiffInput)     aiDiffInput.disabled     = false;
    if (extremeToggle)   extremeToggle.disabled   = false;
    if (rampInput)       rampInput.disabled        = false;
    matchFormatBtns.forEach(b => b.disabled = false);
}

function doPause() {
    if (!running) return;
    isPaused = true; running = false;
    if (pauseBtn) pauseBtn.classList.add('paused');
    if (startTimestamp) {
        accumulatedPlayTime += (performance.now() - startTimestamp) / 1000;
        startTimestamp = null;
    }
    showOverlay('Paused — press Space or click Resume to continue');
}

function doResume() {
    if (!isPaused) return;
    isPaused       = false;
    running        = true;
    startTimestamp = performance.now();
    if (pauseBtn) pauseBtn.classList.remove('paused');
    hideOverlay();
}

function doRestart() {
    score   = resetScoreForNewMatch(score.matchFormat);
    powerup = resetPowerupForGame(extremeMode);
    accumulatedPlayTime = 0;
    startTimestamp      = null;
    running  = false;
    isPaused = false;
    PADDLE_HEIGHT_current = PADDLE_HEIGHT;
    playerSpeedMult = 1;
    aiSpeedMult     = 1;
    ball = newBall();
    resetPositions();
    unlockInputs();
    refreshUI();
    showOverlay('Click or press Space to start');
}

// ─── UI refresh ────────────────────────────────────────────────────────────────
function refreshUI() {
    const adv      = getAdvantage(score);
    const deuce    = isDeuce(score);
    const ptStatus = getPointStatus(score);

    // Scores
    const playerScoreEl = document.getElementById('playerScore');
    const aiScoreEl     = document.getElementById('aiScore');
    if (playerScoreEl) playerScoreEl.textContent = (adv === 'player') ? 'ADV' : score.points.player;
    if (aiScoreEl)     aiScoreEl.textContent     = (adv === 'ai')     ? 'ADV' : score.points.ai;

    // Status pills under each score
    for (const who of ['player', 'ai']) {
        const st = ptStatus[who];
        const el = document.getElementById(`${who}Status`);
        if (!el) continue;
        if (!st) { el.textContent = ''; el.className = 'status-pill'; continue; }
        el.textContent = st.type === 'matchPoint'
            ? `Match point (${st.count})`
            : `Game point (${st.count})`;
        el.className = 'status-pill ' + (st.type === 'matchPoint' ? 'status-mp' : 'status-gp');
    }

    // Deuce pill
    const deuceEl = document.getElementById('deuceStatus');
    if (deuceEl) {
        if (deuce) {
            deuceEl.textContent   = score.deuceCount > 0 ? `Deuce #${score.deuceCount}` : 'Deuce';
            deuceEl.style.display = 'inline-flex';
        } else {
            deuceEl.style.display = 'none';
        }
    }

    // Game dots
    for (const who of ['player', 'ai']) {
        document.querySelectorAll(`#${who}Games .game-dot`).forEach((dot, i) => {
            dot.classList.toggle('filled', i < score.gamesWon[who]);
        });
    }

    // Game number badge
    const gameNumEl = document.getElementById('gameNumber');
    if (gameNumEl) {
        const fmt = MATCH_FORMATS[score.matchFormat];
        gameNumEl.textContent = (fmt && fmt.gamesNeeded > 1)
            ? `Game ${score.gamesWon.player + score.gamesWon.ai + 1}`
            : '';
    }

    // Powerup pips — use new .pip-on class
    const puLeftEl   = document.getElementById('powerupLeft');
    const puActiveEl = document.getElementById('powerupActive');
    if (puLeftEl) {
        puLeftEl.innerHTML = [0, 1].map(i =>
            `<span class="pip${(!extremeMode && i < powerup.left) ? ' pip-on' : ''}"></span>`
        ).join('');
    }
    if (puActiveEl) {
        if (powerup.disabled) {
            puActiveEl.textContent = 'Disabled';
            puActiveEl.className   = 'active-powerup is-disabled';
        } else if (powerup.active) {
            puActiveEl.textContent = powerup.active;
            puActiveEl.className   = 'active-powerup is-active';
        } else {
            puActiveEl.textContent = 'None active';
            puActiveEl.className   = 'active-powerup';
        }
    }

    // Extreme panel
    const extremePanelEl    = document.getElementById('extremePanel');
    const extremeStatusText = document.getElementById('extremeStatusText');
    if (extremePanelEl)    extremePanelEl.classList.toggle('is-extreme', extremeMode);
    if (extremeStatusText) extremeStatusText.textContent = extremeMode ? 'EXTREME' : 'Normal';

    // Pause button — update icon label and class
    if (pauseBtn) {
        const lbl = document.getElementById('pauseBtnLabel');
        if (lbl) lbl.textContent = isPaused ? 'Resume' : 'Pause';
        pauseBtn.classList.toggle('paused', isPaused);
        // Update SVG icon: show play icon when paused, pause icon when playing
        const svgEl = pauseBtn.querySelector('svg');
        if (svgEl) {
            svgEl.innerHTML = isPaused
                ? '<polygon points="3,1.5 11,6.5 3,11.5" fill="currentColor"/>'
                : '<rect x="2" y="1.5" width="3.5" height="10" rx="1" fill="currentColor"/><rect x="7.5" y="1.5" width="3.5" height="10" rx="1" fill="currentColor"/>';
        }
    }

    // Slider labels
    if (aiDiffLabel && aiDiffInput) aiDiffLabel.textContent = aiDiffInput.value;
    if (rampLabel   && rampInput)   rampLabel.textContent   = rampInput.value + 's';

    // Format tabs — new class name .fmt-btn
    matchFormatBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === score.matchFormat);
    });

    // Match dots visibility + count
    const playerGamesEl = document.getElementById('playerGames');
    const aiGamesEl     = document.getElementById('aiGames');
    const fmt        = MATCH_FORMATS[score.matchFormat];
    const showDots   = fmt && fmt.gamesNeeded > 1;
    const dotsNeeded = fmt ? fmt.gamesNeeded : 2;
    for (const container of [playerGamesEl, aiGamesEl]) {
        if (!container) continue;
        container.style.display = showDots ? 'flex' : 'none';
        container.querySelectorAll('.game-dot').forEach((d, i) => {
            d.style.display = i < dotsNeeded ? '' : 'none';
        });
    }
}

// ─── Game loop ─────────────────────────────────────────────────────────────────
function update(dt, timestamp) {
    if (!running) return;
    if (!startTimestamp) startTimestamp = timestamp;

    // Ramp: scale ball's base speed reference, not vx/vy directly.
    // vx/vy grow through bounce speed-ups; ramp only affects new serves
    // and provides a mild velocity nudge here to counteract friction.
    const elapsed = accumulatedPlayTime + (timestamp - startTimestamp) / 1000;
    const ramp = extremeMode
        ? Math.min(3,   1 + (Math.exp(elapsed / Math.max(1, effectiveRampSeconds)) - 1) * 0.3)
        : Math.max(1,   1 + elapsed / effectiveRampSeconds * 0.4);

    // Apply ramp as a gentle push in the current direction so speed grows over time
    const currentSpeed = Math.hypot(ball.vx, ball.vy);
    const targetSpeed  = ball.speed * ramp;
    if (currentSpeed > 0 && targetSpeed > currentSpeed) {
        const scale = targetSpeed / currentSpeed;
        ball.vx *= scale;
        ball.vy *= scale;
    }

    // FIX #1: swept collision — compute the full move delta first, then test.
    const moveFactor = dt / (1000 / 60);
    const dx = ball.vx * moveFactor;
    const dy = ball.vy * moveFactor;

    const AI_X = getAI_X();
    const { displayW, displayH } = getDisplaySize();

    // Attach radius to ball object temporarily for swept test
    ball.r = BALL_RADIUS;

    // Player paddle sweep (only when ball moving left)
    if (ball.vx < 0) {
        const t = sweptPaddleCollision(ball, dx, dy, PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT_current);
        if (t !== null) {
            // Move to contact point
            ball.x += dx * t;
            ball.y += dy * t;
            ball.x  = PLAYER_X + PADDLE_WIDTH + BALL_RADIUS; // push out of paddle
            handlePaddleBounce(ball, playerY, PADDLE_HEIGHT_current, true);
            // Move remaining fraction after bounce
            const remaining = 1 - t;
            ball.x += (ball.vx / Math.hypot(ball.vx, ball.vy)) * Math.hypot(dx, dy) * remaining;
            ball.y += (ball.vy / Math.hypot(ball.vx, ball.vy)) * Math.hypot(dx, dy) * remaining;
        } else {
            moveBall(ball, dt);
        }
    } else if (ball.vx > 0) {
        // AI paddle sweep
        const t = sweptPaddleCollision(ball, dx, dy, AI_X, aiY, PADDLE_WIDTH, PADDLE_HEIGHT);
        if (t !== null) {
            ball.x += dx * t;
            ball.y += dy * t;
            ball.x  = AI_X - BALL_RADIUS;
            handlePaddleBounce(ball, aiY, PADDLE_HEIGHT, false);
            const remaining = 1 - t;
            ball.x += (ball.vx / Math.hypot(ball.vx, ball.vy)) * Math.hypot(dx, dy) * remaining;
            ball.y += (ball.vy / Math.hypot(ball.vx, ball.vy)) * Math.hypot(dx, dy) * remaining;
        } else {
            moveBall(ball, dt);
        }
    } else {
        moveBall(ball, dt);
    }

    bounceWalls(ball, BALL_RADIUS, displayH);

    // AABB guard — catches edge cases the sweep might miss at very low dt
    if (collidesWithPaddle(ball, BALL_RADIUS, PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT_current) && ball.vx < 0) {
        ball.x = PLAYER_X + PADDLE_WIDTH + BALL_RADIUS;
        handlePaddleBounce(ball, playerY, PADDLE_HEIGHT_current, true);
    }
    if (collidesWithPaddle(ball, BALL_RADIUS, AI_X, aiY, PADDLE_WIDTH, PADDLE_HEIGHT) && ball.vx > 0) {
        ball.x = AI_X - BALL_RADIUS;
        handlePaddleBounce(ball, aiY, PADDLE_HEIGHT, false);
    }

    // Score
    if (ball.x - BALL_RADIUS < 0)       { onPointScored('ai');     return; }
    if (ball.x + BALL_RADIUS > displayW) { onPointScored('player'); return; }

    aiY = moveAI({
        aiY, ball, ballRadius: BALL_RADIUS, paddleH: PADDLE_HEIGHT, paddleW: PADDLE_WIDTH,
        aiX: AI_X, displayH, displayW,
        aiDifficulty: settings.aiDifficulty,
        aiSpeedMultiplier: aiSpeedMult,
        extremeMode, playerY, playerPaddleH: PADDLE_HEIGHT_current,
        gameplayScale, dt
    });
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(timestamp - lastTime, 50);
    lastTime = timestamp;

    update(dt, timestamp);
    draw(ctx, canvas, {
        ball, playerY, aiY,
        PLAYER_X, AI_X: getAI_X(),
        PADDLE_WIDTH, PADDLE_HEIGHT, PADDLE_HEIGHT_current, BALL_RADIUS,
        showTrajectory
    });

    requestAnimationFrame(gameLoop);
}

// ─── Input handlers ────────────────────────────────────────────────────────────
canvas.addEventListener('mousemove', (e) => {
    // FIX #7: allow paddle to move always (feels natural pre-serve) but guard powerup keys below
    const rect   = canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const target = mouseY - PADDLE_HEIGHT_current / 2;
    playerY += (target - playerY) * (0.35 * playerSpeedMult);
    playerY  = clamp(playerY, 0, getDisplaySize().displayH - PADDLE_HEIGHT_current);
});

canvas.addEventListener('click', () => {
    if (!running && !score.matchEnded) startGame();
});

document.getElementById('overlay')?.addEventListener('click', (e) => {
    if (e.target?.id === 'restartBtn') return;
    if (!running && !score.matchEnded) startGame();
});

window.addEventListener('keydown', (e) => {
    // FIX #12: ignore keypresses when focus is inside an input
    if (e.target?.tagName === 'INPUT') return;

    if (e.code === 'Space') {
        e.preventDefault();
        if (running && !isPaused)               { doPause();   }
        else if (isPaused)                       { doResume();  }
        else if (!running && !score.matchEnded) { startGame(); }
    }
    if (e.key.toLowerCase() === 'w') activatePowerup('speed');
    if (e.key.toLowerCase() === 'd') activatePowerup('size');
});

pauseBtn?.addEventListener('click',   () => { if (isPaused) doResume(); else doPause(); });
restartBtn?.addEventListener('click', () => doRestart());

aiDiffInput?.addEventListener('input', () => {
    settings.aiDifficulty = parseInt(aiDiffInput.value, 10);
    if (aiDiffLabel) aiDiffLabel.textContent = aiDiffInput.value;
});

rampInput?.addEventListener('input', () => {
    settings.rampSeconds = parseFloat(rampInput.value);
    if (rampLabel) rampLabel.textContent = rampInput.value + 's';
});

extremeToggle?.addEventListener('change', () => {
    extremeMode = !!extremeToggle.checked;
    if (extremeMode) powerup = resetPowerupForGame(true);
    else if (!running && powerup.left === 0) powerup = resetPowerupForGame(false);
    refreshUI();
});

trajToggle?.addEventListener('change', () => { showTrajectory = !!trajToggle.checked; });

matchFormatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.disabled) return;
        score.matchFormat = btn.dataset.format;
        refreshUI();
    });
});

themeBtns.forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

// ─── Powerup activation ────────────────────────────────────────────────────────
function activatePowerup(type) {
    const newState = tryActivatePowerup(type, powerup, { running });
    if (!newState) return;
    powerup = newState;
    const effects = getPowerupEffects(type);
    playerSpeedMult = effects.playerSpeedMult;
    aiSpeedMult     = effects.aiSpeedMult;
    PADDLE_HEIGHT_current = Math.min(PADDLE_HEIGHT * effects.paddleHeightScale, getDisplaySize().displayH - 10);
    refreshUI();
}

// ─── Init ──────────────────────────────────────────────────────────────────────
(function init() {
    // Restore saved theme (fallback to 'neon')
    let savedTheme = 'neon';
    try { savedTheme = localStorage.getItem('pongai-theme') || 'neon'; } catch {}
    applyTheme(savedTheme);

    doResizeCanvas();
    ball = newBall();
    resetPositions();
    unlockInputs();
    refreshUI();
    showOverlay('Click or press Space to start');

    // FIX #14: ResizeObserver inside init so DOM is guaranteed ready.
    new ResizeObserver(() => {
        doResizeCanvas();
        refreshUI();
    }).observe(canvas.parentElement);

    requestAnimationFrame(gameLoop);
})();