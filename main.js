// main.js — game orchestrator: loop, input, resize, state

import { createBall, clamp, collidesWithPaddle, handlePaddleBounce, moveBall, bounceWalls } from './physics.js';
import { moveAI } from './ai.js';
import { createPowerupState, tryActivatePowerup, getPowerupEffects, resetPowerupAfterPoint, resetPowerupForGame } from './powerups.js';
import { createScoreState, resetScoreForNewGame, resetScoreForNewMatch, handlePointScored, getPointStatus, getAdvantage, isDeuce, WIN_SCORE, MATCH_FORMATS } from './scoring.js';
import { draw } from './renderer.js';

// ─── Overlay helpers ──────────────────────────────────────────────────────────
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

// ─── Canvas & context ───────────────────────────────────────────────────────
const canvas = document.getElementById('pong');
const ctx = canvas.getContext('2d');

// ─── Base constants ─────────────────────────────────────────────────────────
const BASE_W = 900, BASE_H = 600;
const BASE_PADDLE_W = 16, BASE_PADDLE_H = 100, BASE_BALL_R = 10;
const BASE_PLAYER_X = 20, BASE_AI_MARGIN = 20;

// ─── Scaled constants (updated in resize) ───────────────────────────────────
let PADDLE_WIDTH = BASE_PADDLE_W;
let PADDLE_HEIGHT = BASE_PADDLE_H;
let BALL_RADIUS = BASE_BALL_R;
let PLAYER_X = BASE_PLAYER_X;
let AI_MARGIN = BASE_AI_MARGIN;
let gameplayScale = 1;
let currentUIScale = 1;

const getAI_X = () => (canvas.width / (window.devicePixelRatio || 1)) - PADDLE_WIDTH - AI_MARGIN;
const getDisplaySize = () => {
    const dpr = window.devicePixelRatio || 1;
    return { displayW: canvas.width / dpr, displayH: canvas.height / dpr };
};

// ─── Game state ──────────────────────────────────────────────────────────────
let score = createScoreState();
let powerup = createPowerupState();

let ball;
let playerY = 0, aiY = 0;
let PADDLE_HEIGHT_current = PADDLE_HEIGHT;
let playerSpeedMult = 1, aiSpeedMult = 1;

let running = false;
let isPaused = false;
let extremeMode = false;
let showTrajectory = true;

let speedMultiplier = 1;
let effectiveRampSeconds = 10;
let startTimestamp = null;
let accumulatedPlayTime = 0;
let lastTime = null;

// ─── Settings ────────────────────────────────────────────────────────────────
let settings = {
    aiDifficulty: 3,
    rampSeconds: 10,
};

// ─── DOM refs ────────────────────────────────────────────────────────────────
const playerNameInput  = document.getElementById('playerName');
const pauseBtn         = document.getElementById('pauseBtn');
const restartBtn       = document.getElementById('restartBtn');
const rampInput        = document.getElementById('rampTime');
const aiDiffInput      = document.getElementById('aiDifficulty');
const aiDiffLabel      = document.getElementById('aiDiffLabel');
const rampLabel        = document.getElementById('rampLabel');
const extremeToggle    = document.getElementById('extremeMode');
const trajToggle       = document.getElementById('trajToggle');
const matchFormatBtns  = document.querySelectorAll('.match-format-btn');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getPlayerName() { return playerNameInput?.value?.trim() || 'Player'; }

function doResizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const displayWidth  = Math.max(100, Math.floor(BASE_W * currentUIScale));
    const displayHeight = Math.max(100, Math.floor(BASE_H * currentUIScale));

    if (canvas.width !== Math.floor(displayWidth * dpr) || canvas.height !== Math.floor(displayHeight * dpr)) {
        const prevW = canvas.width || displayWidth * dpr;
        const prevH = canvas.height || displayHeight * dpr;

        canvas.width  = Math.floor(displayWidth * dpr);
        canvas.height = Math.floor(displayHeight * dpr);
        canvas.style.width  = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const scaleX = canvas.width / prevW;
        const scaleY = canvas.height / prevH;
        if (ball) { ball.x *= scaleX; ball.y *= scaleY; }
        playerY *= scaleY;
        aiY     *= scaleY;

        const { displayW: dW, displayH: dH } = getDisplaySize();
        const sf = dW / BASE_W;
        gameplayScale = sf;
        PADDLE_WIDTH  = Math.max(8,  Math.round(BASE_PADDLE_W * sf));
        PADDLE_HEIGHT = Math.max(40, Math.round(BASE_PADDLE_H * sf));
        BALL_RADIUS   = Math.max(4,  Math.round(BASE_BALL_R   * sf));
        PLAYER_X      = Math.max(8,  Math.round(BASE_PLAYER_X  * sf));
        AI_MARGIN     = Math.max(8,  Math.round(BASE_AI_MARGIN * sf));
        PADDLE_HEIGHT_current = PADDLE_HEIGHT;

        playerY = clamp(playerY, 0, dH - PADDLE_HEIGHT_current);
        aiY     = clamp(aiY,     0, dH - PADDLE_HEIGHT);
    }
}

function doApplyUIScale() {
    document.documentElement.style.setProperty('--ui-scale', '1');
    const headerEl = document.querySelector('header');
    const footerEl = document.querySelector('footer');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
    const footerH = footerEl ? footerEl.getBoundingClientRect().height : 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const totalNeeded = headerH + BASE_H + footerH + 32;
    const scale = Math.min(1, Math.min(vw / BASE_W, vh / totalNeeded));
    document.documentElement.style.setProperty('--ui-scale', String(scale));
    currentUIScale = scale;
}

function resetPositions() {
    const { displayH } = getDisplaySize();
    playerY = (displayH - PADDLE_HEIGHT_current) / 2;
    aiY     = (displayH - PADDLE_HEIGHT) / 2;
}

function newBall(servingTo) {
    const { displayW, displayH } = getDisplaySize();
    return createBall(displayW, displayH, gameplayScale, servingTo);
}

// ─── Scoring / game flow ──────────────────────────────────────────────────────
function onPointScored(side) {
    const { state: newScore, result } = handlePointScored(side, score);
    score = newScore;
    powerup = resetPowerupAfterPoint(powerup, extremeMode);
    playerSpeedMult = 1; aiSpeedMult = 1;
    PADDLE_HEIGHT_current = PADDLE_HEIGHT;
    running = false;

    refreshUI();

    if (result === 'deuce') {
        ball = newBall(side === 'player' ? 'ai' : 'player');
        showOverlay(`Deuce! — click or Space to serve`);
        return;
    }

    if (result && result.startsWith('matchWon:')) {
        const winner = result.split(':')[1];
        const name = winner === 'player' ? getPlayerName() : 'AI';
        const other = winner === 'player' ? 'ai' : 'player';
        ball = newBall(side === 'player' ? 'ai' : 'player');
        resetPositions();
        score.matchEnded = true;
        unlockInputs();
        showOverlay(`${name} wins the match ${score.gamesWon[winner]}–${score.gamesWon[other]}! Click Restart to play again.`);
        return;
    }

    if (result && result.startsWith('gameWon:')) {
        const winner = result.split(':')[1];
        const name = winner === 'player' ? getPlayerName() : 'AI';
        const gamesTotal = score.gamesWon.player + score.gamesWon.ai;
        // Reset per-game state
        score = resetScoreForNewGame(score);
        powerup = resetPowerupForGame(extremeMode);
        ball = newBall(winner === 'player' ? 'ai' : 'player');
        resetPositions();
        refreshUI();
        showOverlay(`${name} wins game ${gamesTotal}! Click or Space to start next game.`);
        return;
    }

    // Normal point
    ball = newBall(side === 'player' ? 'ai' : 'player');
    const pointName = side === 'player' ? getPlayerName() : 'AI';
    showOverlay(`Point for ${pointName} — click or Space to serve`);
}

// ─── Game start / pause / restart ─────────────────────────────────────────────
function startGame() {
    if (score.matchEnded) return;
    settings.aiDifficulty = parseInt(aiDiffInput?.value ?? '3', 10);
    settings.rampSeconds  = parseFloat(rampInput?.value ?? '10');
    extremeMode = !!(extremeToggle?.checked);

    if (extremeMode) {
        powerup = resetPowerupForGame(true);
    }

    const maxAi = 5;
    const aiNorm = (settings.aiDifficulty - 1) / (maxAi - 1);
    effectiveRampSeconds = 20 - aiNorm * 14; // 20s (easy) → 6s (hard)

    speedMultiplier = 1;
    accumulatedPlayTime = 0;
    startTimestamp = null;

    if (!ball) ball = newBall();
    running = true;
    isPaused = false;

    lockInputs();
    hideOverlay();
    refreshUI();
}

function lockInputs() {
    if (playerNameInput) playerNameInput.disabled = true;
    if (aiDiffInput)     aiDiffInput.disabled = true;
    if (extremeToggle)   extremeToggle.disabled = true;
    if (rampInput)       rampInput.disabled = true;
    matchFormatBtns.forEach(b => b.disabled = true);
}

function unlockInputs() {
    if (playerNameInput) playerNameInput.disabled = false;
    if (aiDiffInput)     aiDiffInput.disabled = false;
    if (extremeToggle)   extremeToggle.disabled = false;
    if (rampInput)       rampInput.disabled = false;
    matchFormatBtns.forEach(b => b.disabled = false);
}

function doPause() {
    if (!running) return;
    isPaused = true;
    running  = false;
    if (pauseBtn) pauseBtn.classList.add('paused');
    if (startTimestamp) {
        accumulatedPlayTime += (performance.now() - startTimestamp) / 1000;
        startTimestamp = null;
    }
    showOverlay('Paused — press Space or click Resume to continue');
}

function doResume() {
    if (!isPaused) return;
    isPaused   = false;
    running    = true;
    startTimestamp = performance.now();
    if (pauseBtn) pauseBtn.classList.remove('paused');
    hideOverlay();
}

function doRestart() {
    score   = resetScoreForNewMatch(score.matchFormat);
    powerup = resetPowerupForGame(extremeMode);
    speedMultiplier = 1;
    accumulatedPlayTime = 0;
    startTimestamp = null;
    running  = false;
    isPaused = false;
    PADDLE_HEIGHT_current = PADDLE_HEIGHT;
    playerSpeedMult = 1; aiSpeedMult = 1;

    ball = newBall();
    resetPositions();
    unlockInputs();
    refreshUI();
    showOverlay('Click or press Space to start');
}

// ─── UI refresh ───────────────────────────────────────────────────────────────
function refreshUI() {
    // Scores
    const adv       = getAdvantage(score);
    const deuce     = isDeuce(score);
    const ptStatus  = getPointStatus(score);

    // Player score display
    const playerScoreEl = document.getElementById('playerScore');
    const aiScoreEl     = document.getElementById('aiScore');
    if (playerScoreEl) {
        playerScoreEl.textContent = (adv === 'player') ? 'ADV' : score.points.player;
    }
    if (aiScoreEl) {
        aiScoreEl.textContent = (adv === 'ai') ? 'ADV' : score.points.ai;
    }

    // Player name label
    const playerLabelEl = document.getElementById('playerLabel');
    if (playerLabelEl) playerLabelEl.textContent = getPlayerName();

    // Per-player status pills
    for (const who of ['player', 'ai']) {
        const st = ptStatus[who];
        const el = document.getElementById(`${who}Status`);
        if (!el) continue;
        if (!st) { el.textContent = ''; el.className = 'player-status'; continue; }
        if (st.type === 'matchPoint') {
            el.textContent = `Match point (${st.count})`;
            el.className = 'player-status status-mp';
        } else if (st.type === 'gamePoint') {
            el.textContent = `Game point (${st.count})`;
            el.className = 'player-status status-gp';
        }
    }

    // Deuce pill (centered, below entire scoreboard)
    const deuceEl = document.getElementById('deuceStatus');
    if (deuceEl) {
        if (deuce && score.deuceCount > 0) {
            deuceEl.textContent = `Deuce (#${score.deuceCount})`;
            deuceEl.style.display = 'inline-flex';
        } else if (deuce && score.deuceCount === 0) {
            deuceEl.textContent = 'Deuce';
            deuceEl.style.display = 'inline-flex';
        } else {
            deuceEl.style.display = 'none';
        }
    }

    // Game dots
    for (const who of ['player', 'ai']) {
        const dots = document.querySelectorAll(`#${who}Games .game-dot`);
        dots.forEach((dot, i) => {
            dot.classList.remove('filled');
            if (i < score.gamesWon[who]) dot.classList.add('filled');
        });
    }

    // Game number label
    const gameNumEl = document.getElementById('gameNumber');
    if (gameNumEl) {
        const fmt = MATCH_FORMATS[score.matchFormat];
        if (fmt && fmt.gamesNeeded > 1) {
            const current = score.gamesWon.player + score.gamesWon.ai + 1;
            gameNumEl.textContent = `Game ${current}`;
        } else {
            gameNumEl.textContent = '';
        }
    }

    // Powerup panel
    const puLeftEl  = document.getElementById('powerupLeft');
    const puActiveEl = document.getElementById('powerupActive');
    if (puLeftEl) {
        // Render pip dots
        const total = extremeMode ? 0 : 2;
        let html = '';
        for (let i = 0; i < 2; i++) {
            const filled = !extremeMode && i < powerup.left;
            html += `<span class="pip${filled ? ' pip-filled' : ''}"></span>`;
        }
        puLeftEl.innerHTML = html;
    }
    if (puActiveEl) {
        puActiveEl.textContent = powerup.disabled ? 'Disabled' : (powerup.active ? powerup.active : '—');
        puActiveEl.className = 'powerup-active' + (powerup.disabled ? ' disabled' : '') + (powerup.active ? ' active' : '');
    }

    // Extreme mode panel status
    const extremePanelEl = document.getElementById('extremePanel');
    if (extremePanelEl) extremePanelEl.classList.toggle('is-extreme', extremeMode);
    const extremeStatusText = document.getElementById('extremeStatusText');
    if (extremeStatusText) extremeStatusText.textContent = extremeMode ? 'EXTREME' : 'Normal';

    // Toggle labels
    const trajLabelEl = document.getElementById('trajLabel');
    if (trajLabelEl) trajLabelEl.textContent = showTrajectory ? 'On' : 'Off';
    const extremeLabelEl = document.getElementById('extremeLabel');
    if (extremeLabelEl) extremeLabelEl.textContent = extremeMode ? 'On' : 'Off';

    // Pause button text
    if (pauseBtn) pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';

    // AI diff + ramp labels
    if (aiDiffLabel && aiDiffInput) aiDiffLabel.textContent = aiDiffInput.value;
    if (rampLabel && rampInput)     rampLabel.textContent   = rampInput.value + 's';

    // Dots for match format
    matchFormatBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === score.matchFormat);
    });

    // Match dots visibility + count
    const playerGamesEl = document.getElementById('playerGames');
    const aiGamesEl     = document.getElementById('aiGames');
    const fmt = MATCH_FORMATS[score.matchFormat];
    const showDots = fmt && fmt.gamesNeeded > 1;
    const dotsNeeded = fmt ? fmt.gamesNeeded : 2;
    for (const container of [playerGamesEl, aiGamesEl]) {
        if (!container) continue;
        container.style.display = showDots ? 'flex' : 'none';
        const dots = container.querySelectorAll('.game-dot');
        dots.forEach((d, i) => { d.style.display = i < dotsNeeded ? '' : 'none'; });
    }
}

// ─── Game loop ────────────────────────────────────────────────────────────────
function update(dt, timestamp) {
    if (!running) return;
    if (!startTimestamp) startTimestamp = timestamp;

    // Speed ramp
    const elapsed = accumulatedPlayTime + (timestamp - startTimestamp) / 1000;
    if (extremeMode) {
        speedMultiplier = Math.min(40, 1 + (Math.exp(elapsed / Math.max(1, effectiveRampSeconds)) - 1));
    } else {
        speedMultiplier = Math.max(1, 1 + elapsed / effectiveRampSeconds);
    }

    moveBall(ball, dt, speedMultiplier);
    const { displayW, displayH } = getDisplaySize();
    bounceWalls(ball, BALL_RADIUS, displayH);

    // Player paddle collision
    if (collidesWithPaddle(ball, BALL_RADIUS, PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT_current) && ball.vx < 0) {
        ball.x = PLAYER_X + PADDLE_WIDTH + BALL_RADIUS;
        handlePaddleBounce(ball, playerY, PADDLE_HEIGHT_current, true, speedMultiplier);
    }
    // AI paddle collision
    const AI_X = getAI_X();
    if (collidesWithPaddle(ball, BALL_RADIUS, AI_X, aiY, PADDLE_WIDTH, PADDLE_HEIGHT) && ball.vx > 0) {
        ball.x = AI_X - BALL_RADIUS;
        handlePaddleBounce(ball, aiY, PADDLE_HEIGHT, false, speedMultiplier);
    }

    // Score check
    if (ball.x - BALL_RADIUS < 0) { onPointScored('ai'); return; }
    if (ball.x + BALL_RADIUS > displayW) { onPointScored('player'); return; }

    // Move AI
    aiY = moveAI({
        aiY, ball, ballRadius: BALL_RADIUS, paddleH: PADDLE_HEIGHT, paddleW: PADDLE_WIDTH,
        aiX: AI_X, displayH, displayW,
        aiDifficulty: settings.aiDifficulty, speedMultiplier, aiSpeedMultiplier: aiSpeedMult,
        extremeMode, playerY, playerPaddleH: PADDLE_HEIGHT_current,
        gameplayScale, dt
    });
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(timestamp - lastTime, 50); // cap dt to avoid spiral
    lastTime = timestamp;

    update(dt, timestamp);
    draw(ctx, canvas, {
        ball, playerY, aiY,
        PLAYER_X, AI_X: getAI_X(),
        PADDLE_WIDTH, PADDLE_HEIGHT, PADDLE_HEIGHT_current, BALL_RADIUS,
        showTrajectory, extremeMode,
        aiSpeedMultiplier: aiSpeedMult, gameplayScale
    });

    requestAnimationFrame(gameLoop);
}

// ─── Input handlers ───────────────────────────────────────────────────────────
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const target = mouseY - PADDLE_HEIGHT_current / 2;
    playerY += (target - playerY) * (0.35 * playerSpeedMult);
    const { displayH } = getDisplaySize();
    playerY = clamp(playerY, 0, displayH - PADDLE_HEIGHT_current);
});

canvas.addEventListener('click', () => {
    if (!running && !score.matchEnded) startGame();
});

document.getElementById('overlay')?.addEventListener('click', (e) => {
    if (e.target?.id === 'restartBtn') return;
    if (!running && !score.matchEnded) startGame();
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (running && !isPaused) { doPause(); }
        else if (isPaused) { doResume(); }
        else if (!running && !score.matchEnded) { startGame(); }
    }
    if (e.key.toLowerCase() === 'w') activatePowerup('speed');
    if (e.key.toLowerCase() === 'd') activatePowerup('size');
});

pauseBtn?.addEventListener('click', () => {
    if (isPaused) doResume(); else doPause();
});

restartBtn?.addEventListener('click', () => { doRestart(); });

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
    if (extremeMode) { powerup = resetPowerupForGame(true); }
    else { if (!running && powerup.left === 0) powerup = resetPowerupForGame(false); }
    refreshUI();
});

trajToggle?.addEventListener('change', () => {
    showTrajectory = !!trajToggle.checked;
});

matchFormatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.disabled) return;
        score.matchFormat = btn.dataset.format;
        refreshUI();
    });
});

// ─── Powerup activation ───────────────────────────────────────────────────────
function activatePowerup(type) {
    const newState = tryActivatePowerup(type, powerup, { running });
    if (!newState) return;
    powerup = newState;
    const effects = getPowerupEffects(type);
    playerSpeedMult = effects.playerSpeedMult;
    aiSpeedMult     = effects.aiSpeedMult;
    const { displayH } = getDisplaySize();
    PADDLE_HEIGHT_current = Math.min(PADDLE_HEIGHT * effects.paddleHeightScale, displayH - 10);
    refreshUI();
}

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    doApplyUIScale();
    doResizeCanvas();
    refreshUI();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
(function init() {
    doApplyUIScale();
    doResizeCanvas();
    ball = newBall();
    resetPositions();
    unlockInputs();
    refreshUI();
    showOverlay('Click or press Space to start');
    requestAnimationFrame(gameLoop);
})();