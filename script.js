// Resets all game and match state and UI
function resetGameAndMatch() {
    scores.player = 0;
    scores.ai = 0;
    gamesWon = { player: 0, ai: 0 };
    updateScores();
    ball = resetBallState();
    running = false;
    powerupsLeft = 2;
    activePowerup = null;
    aiSpeedMultiplier = 1;
    powerupUsedThisPoint = false;
    PADDLE_HEIGHT_current = PADDLE_HEIGHT;
    playerSpeedMultiplier = 1;
    matchEnded = false;
    updatePowerupUI();
    // Clear all per-game UI markers (win/loss/filled)
    const playerDots = document.querySelectorAll('#playerGames .game-dot');
    const aiDots = document.querySelectorAll('#aiGames .game-dot');
    playerDots.forEach(d => d.classList.remove('win', 'loss', 'filled'));
    aiDots.forEach(d => d.classList.remove('win', 'loss', 'filled'));
    // Reset the visible game counter for match mode
    const gameNumberEl = document.getElementById('gameNumber');
    if (gameModeSelect?.value === 'match' && gameNumberEl) {
        gameNumberEl.textContent = 'Game 1';
    } else if (gameNumberEl) {
        gameNumberEl.textContent = '';
    }
    updateMatchUI();
    applyUIScale();
    // Clear deuce/system indicators
    if (deuceIndicator) deuceIndicator.textContent = '';
    if (systemMessage) systemMessage.textContent = '';
    showOverlay('Click or press Space to start');
}
const canvas = document.getElementById('pong'); 
const ctx = canvas.getContext('2d');

// Helper to get display width/height and devicePixelRatio for current canvas
function getDisplaySize() {
    const dpr = window.devicePixelRatio || 1;
    return {
        dpr,
        displayW: canvas.width / dpr,
        displayH: canvas.height / dpr
    };
}

// Compute and apply a global UI scale so scoreboard, controls and canvas scale together.
function applyUIScale() {
    const baseW = BASE_CANVAS_W; // 900
    const baseH = BASE_CANVAS_H; // 600
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    // Compute scale by comparing available width and height to base (use smaller to ensure fit)
    // Temporarily set scale to 1 to measure natural header/footer heights
    document.documentElement.style.setProperty('--ui-scale', '1');
    const headerEl = document.querySelector('header');
    const footerEl = document.querySelector('footer');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
    const footerH = footerEl ? footerEl.getBoundingClientRect().height : 0;
    const totalNeeded = headerH + baseH + footerH + 24; // small padding
    const scaleW = vw / baseW;
    const scaleH = vh / totalNeeded;
    const scale = Math.min(1, Math.min(scaleW, scaleH));
    // Apply to root container so all UI elements scale visually
    document.documentElement.style.setProperty('--ui-scale', String(scale));
    // store current value for canvas sizing
    currentUIScale = scale;
}

// Current computed UI scale applied to container (1.0 means no scaling)
let currentUIScale = 1;
// Gameplay scale derived from displayed canvas size relative to base
let gameplayScale = 1;

// Base constants (logical sizes at 900x600 base resolution)
const BASE_CANVAS_W = 900;
const BASE_CANVAS_H = 600;
const BASE_PADDLE_WIDTH = 16;
const BASE_PADDLE_HEIGHT = 100;
const BASE_BALL_RADIUS = 10;
const BASE_PLAYER_X = 20; // distance from left edge
const BASE_AI_MARGIN = 20;  // margin from right edge

// Scaled constants (computed in resizeCanvas)
let PADDLE_WIDTH = BASE_PADDLE_WIDTH;
let PADDLE_HEIGHT = BASE_PADDLE_HEIGHT;
let BALL_RADIUS = BASE_BALL_RADIUS;
let PLAYER_X = BASE_PLAYER_X;
let AI_MARGIN = BASE_AI_MARGIN;
const AI_X = () => (canvas.width / (window.devicePixelRatio || 1)) - PADDLE_WIDTH - AI_MARGIN;

// State
const dpr_initial = window.devicePixelRatio || 1;
let playerY = ((canvas.height / dpr_initial) - PADDLE_HEIGHT) / 2;
let aiY = ((canvas.height / dpr_initial) - PADDLE_HEIGHT) / 2;

let settings = {
    baseSpeed: 5,
    speedMultiplier: 1,
    rampSeconds: parseFloat(document.getElementById('rampTime')?.value || 10),
    winScore: parseInt(document.getElementById('winScore')?.value || 10, 10),
    aiDifficulty: parseInt(document.getElementById('aiDifficulty')?.value || 3, 10)
};

let scores = { player: 0, ai: 0 };
// Match state
let gamesWon = { player: 0, ai: 0 };
let gameModeSelect = document.getElementById('gameMode');
let gameMode = gameModeSelect?.value || 'one';
let playerNameInput = document.getElementById('playerName');
let aiNameInput = document.getElementById('aiName');
let pauseBtn = document.getElementById('pauseBtn');
let deuceIndicator = document.getElementById('deuceIndicator');
let isPaused = false;

// Listen for game mode changes
if (gameModeSelect) {
    gameModeSelect.addEventListener('change', () => {
        gameMode = gameModeSelect.value;
        // reset match state when switching
        gamesWon = { player: 0, ai: 0 };
        scores = { player: 0, ai: 0 };
        updateScores();
        // Clear any per-game win/loss markers when switching modes
        const playerDots = document.querySelectorAll('#playerGames .game-dot');
        const aiDots = document.querySelectorAll('#aiGames .game-dot');
        playerDots.forEach(d => d.classList.remove('win', 'loss'));
        aiDots.forEach(d => d.classList.remove('win', 'loss'));
        // Update visibility of match-specific UI
        updateMatchUI();
        // Recalculate UI scale since header/footer height may have changed (match dots)
        applyUIScale();
    });
}

// Pause button handling
if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
            // pause: stop running and accumulate play time so ramp doesn't jump
            running = false;
            pauseBtn.classList.add('paused');
            if (startTimestamp) {
                accumulatedPlayTime += (performance.now() - startTimestamp) / 1000;
                startTimestamp = null;
            }
            showOverlay('Paused — click Resume (Space) to continue');
        } else {
            // resume: mark new start timestamp
            pauseBtn.classList.remove('paused');
            running = true;
            startTimestamp = performance.now();
            hideOverlay();
        }
    });
}

let ball = resetBallState();
let lastTime = null;
let running = false;
let startTimestamp = null; // for speed ramp
let accumulatedPlayTime = 0; // seconds of active play (excludes paused time)
let effectiveRampSeconds = 10; // frozen per-game ramp seconds (set at startGame)
let matchEnded = false; // true when a match (or one-shot end) has finished
// Powerup state
let powerupsLeft = 2; // total uses per game
let activePowerup = null; // 'speed' or 'size' or null
let powerupUsedThisPoint = false; // ensure only one per point

// Variables used for powerup effects (declare early so functions can use them)
let playerSpeedMultiplier = 1; // affects how quickly player paddle snaps to cursor when speed powerup active
let PADDLE_HEIGHT_current = PADDLE_HEIGHT;
let aiSpeedMultiplier = 1; // multiplier applied to AI movement speed (reduced when player uses speed powerup)

// Elements
const overlay = document.getElementById('overlay');
const messageEl = document.getElementById('message');
const restartBtn = document.getElementById('restartBtn');
const playerScoreEl = document.getElementById('playerScore');
const aiScoreEl = document.getElementById('aiScore');
const rampInput = document.getElementById('rampTime');
const winInput = document.getElementById('winScore');
const aiDifficultyInput = document.getElementById('aiDifficulty');
const extremeModeInput = document.getElementById('extremeMode');
const powerupLeftEl = document.getElementById('powerupLeft');
const powerupActiveEl = document.getElementById('powerupActive');
const systemMessage = document.getElementById('systemMessage');

// When true, powerups are disabled because AI difficulty is at maximum
let powerupsDisabledByDifficulty = false;
let extremeMode = false; // when true, AI is boosted and powerups disabled

// Update name inputs immediately when user presses Enter
if (playerNameInput) {
    playerNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            updateScores();
            updateMatchUI();
            applyUIScale();
        }
    });
}
if (aiNameInput) {
    aiNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            updateScores();
            updateMatchUI();
                applyUIScale();
        }
    });
}

function resetBallState(servingTo = (Math.random() > 0.5 ? 'player' : 'ai')) {
    const angle = (Math.random() * Math.PI / 4) - (Math.PI / 8); // small angle
    const dir = servingTo === 'player' ? -1 : 1;
    // Start each serve at the base speed (speedMultiplier ramps during play)
    // base speed scaled by gameplayScale so larger/smaller UI keeps feel consistent
    const speed = settings.baseSpeed * gameplayScale;
    const dpr = window.devicePixelRatio || 1;
    return {
        x: (canvas.width / dpr) / 2,
        y: (canvas.height / dpr) / 2,
        speed: speed,
        vx: speed * Math.cos(angle) * dir,
        vy: speed * Math.sin(angle) * (Math.random() > 0.5 ? 1 : -1)
    };
}

function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

function drawCircle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();
}

function drawNet() {
    const {dpr, displayW, displayH} = getDisplaySize();
    ctx.strokeStyle = '#393e46';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 10; i < displayH; i += 30) {
        ctx.moveTo(displayW / 2, i);
        ctx.lineTo(displayW / 2, i + 20);
    }
    ctx.stroke();
}

function draw() {
    // Background
    const {dpr, displayW, displayH} = getDisplaySize();
    drawRect(0, 0, displayW, displayH, '#222831');
    drawNet();

    // Paddles (use current paddle height for player which may be modified by powerup)
    drawRect(PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT_current, '#00adb5');
    drawRect(AI_X(), aiY, PADDLE_WIDTH, PADDLE_HEIGHT, '#f96d00');

    // Ball
    drawCircle(ball.x, ball.y, BALL_RADIUS, '#fafafa');
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function collisionDetect(paddleX, paddleY) {
    return (
        ball.x - BALL_RADIUS < paddleX + PADDLE_WIDTH &&
        ball.x + BALL_RADIUS > paddleX &&
        ball.y - BALL_RADIUS < paddleY + (paddleX === PLAYER_X ? PADDLE_HEIGHT_current : PADDLE_HEIGHT) &&
        ball.y + BALL_RADIUS > paddleY
    );
}

function handlePaddleBounce(paddleX, paddleY, isPlayer) {
    // Calculate collision point to give angle; respect current paddle height for player
    const paddleH = isPlayer ? PADDLE_HEIGHT_current : PADDLE_HEIGHT;
    const relativeIntersectY = (paddleY + paddleH / 2) - ball.y;
    const normalizedIntersectY = relativeIntersectY / (paddleH / 2);
    const bounceAngle = normalizedIntersectY * (Math.PI / 4); // max 45deg
    const dir = isPlayer ? 1 : -1;
    // Use base ball.speed scaled by current multiplier so bounce respects ramping
    const speed = (ball.speed * settings.speedMultiplier) * 1.05; // slight speed up on paddle hit
    ball.vx = speed * Math.cos(bounceAngle) * dir;
    ball.vy = speed * -Math.sin(bounceAngle);
}

function update(dt, timestamp) {
    if (!running) return;

    // Speed ramp: increase speedMultiplier linearly over effectiveRampSeconds
    // startTimestamp is set when play resumes; accumulatedPlayTime stores prior play time
    if (!startTimestamp) startTimestamp = timestamp;
    const elapsed = accumulatedPlayTime + (timestamp - startTimestamp) / 1000; // seconds
    let ramp;
    if (extremeMode) {
        // exponential ramp: starts slow then grows quickly
        // formula: 1 + (e^(elapsed / effectiveRampSeconds) - 1)
        ramp = 1 + (Math.exp(elapsed / Math.max(1, effectiveRampSeconds)) - 1);
        // clamp to reasonable upper bound to avoid runaway
        ramp = Math.min(ramp, 40);
    } else {
        ramp = Math.max(1, 1 + (elapsed / effectiveRampSeconds));
    }
    settings.speedMultiplier = ramp;

    // Move ball: compute direction from current vx/vy and apply scaled speed (so we don't compound velocity)
    const velMag = Math.hypot(ball.vx, ball.vy) || ball.speed;
    const dirX = ball.vx / velMag;
    const dirY = ball.vy / velMag;
    const currentSpeed = ball.speed * settings.speedMultiplier;
    const moveFactor = (dt / (1000 / 60));
    ball.x += dirX * currentSpeed * moveFactor;
    ball.y += dirY * currentSpeed * moveFactor;

    // Top/bottom bounce (use display coordinates)
    const {displayH} = getDisplaySize();
    if (ball.y - BALL_RADIUS < 0) {
        ball.y = BALL_RADIUS;
        ball.vy = -ball.vy;
    } else if (ball.y + BALL_RADIUS > displayH) {
        ball.y = displayH - BALL_RADIUS;
        ball.vy = -ball.vy;
    }

    // Player paddle collision
    if (collisionDetect(PLAYER_X, playerY) && ball.vx < 0) {
        ball.x = PLAYER_X + PADDLE_WIDTH + BALL_RADIUS;
        handlePaddleBounce(PLAYER_X, playerY, true);
    }

    // AI paddle collision
    if (collisionDetect(AI_X(), aiY) && ball.vx > 0) {
        ball.x = AI_X() - BALL_RADIUS;
        handlePaddleBounce(AI_X(), aiY, false);
    }

    // Score check
    const displayW = canvas.width / (window.devicePixelRatio || 1);
    if (ball.x - BALL_RADIUS < 0) {
        // AI scores
        scores.ai += 1;
        updateScores();
        const gameEnded = checkWin();
        ball = resetBallState('ai');
    // Reset powerup effects after the point
    activePowerup = null;
    playerSpeedMultiplier = 1;
    aiSpeedMultiplier = 1;
    PADDLE_HEIGHT_current = PADDLE_HEIGHT;
        powerupUsedThisPoint = false; // allow powerup on next point
        running = false;
        updatePowerupUI();
        if (!gameEnded) showOverlay('Point for AI — Click or Space to serve');
        return;
    } else if (ball.x + BALL_RADIUS > displayW) {
        // Player scores
        scores.player += 1;
        updateScores();
        const gameEnded = checkWin();
        ball = resetBallState('player');
    // Reset powerup effects after the point
    activePowerup = null;
    playerSpeedMultiplier = 1;
    aiSpeedMultiplier = 1;
    PADDLE_HEIGHT_current = PADDLE_HEIGHT;
        powerupUsedThisPoint = false;
        running = false;
        updatePowerupUI();
        if (!gameEnded) showOverlay('Point for Player — Click or Space to serve');
        return;
    }

    // AI movement: predictive simple AI with limited speed
    const aiCenter = aiY + PADDLE_HEIGHT / 2;
    // Default predictive target (existing lookahead)
    let target = ball.y + (ball.vy * (10 + settings.aiDifficulty * 3)); // difficulty increases lookahead
    // In extreme mode, predict contact point at AI X and position paddle to create a difficult outgoing angle
    if (extremeMode && ball.vx > 0) {
        // time until ball reaches AI paddle (clamp to reasonable range)
        let timeToAI = (AI_X() - ball.x) / (ball.vx || 0.0001);
        timeToAI = Math.max(0, Math.min(timeToAI, 2000)); // in ms-like units if vx small
    const predictedY = ball.y + ball.vy * timeToAI;
        // Player's paddle center to decide which corner to target (aim away from player)
        const playerCenter = playerY + PADDLE_HEIGHT_current / 2;
        const aimUp = playerCenter > predictedY ? 1 : -1;
        // desired normalized intersection on paddle (-1..1). 0.95 to create very steep angle
        const desiredNorm = 0.95 * aimUp;
        // Compute desired paddle center so collision yields desired normalized intersection
        let desiredPaddleCenter = predictedY + desiredNorm * (PADDLE_HEIGHT / 2);
    // clamp target inside playfield
    const {displayH: displayH_forAI} = getDisplaySize();
    desiredPaddleCenter = clamp(desiredPaddleCenter, PADDLE_HEIGHT / 2, displayH_forAI - PADDLE_HEIGHT / 2);
        target = desiredPaddleCenter;
    }
    // AI speed scales with difficulty: 1..5 => slow..fast
    let aiBase = (2 + settings.aiDifficulty * 1.5) * gameplayScale;
    // If extreme mode is active, boost AI base significantly above slider max
    if (extremeMode) aiBase *= 5.0;
    // Apply aiSpeedMultiplier which can be reduced by player speed powerup
    const aiSpeedMax = (extremeMode ? 140 : 18) * gameplayScale;
    const aiSpeed = clamp((aiBase + settings.speedMultiplier * 0.6) * aiSpeedMultiplier, 3 * gameplayScale, aiSpeedMax);
    // Smooth AI movement: move toward target by a clamped amount scaled by dt
    // Use a deadzone to avoid jitter from tiny corrections
    const deadzone = 6;
    const extremeFrameScale = extremeMode ? 2.5 : 1.0;
    const maxMovePerFrame = aiSpeed * (dt / (1000 / 60)) * extremeFrameScale; // scale aiSpeed to this frame's delta
    const delta = target - aiCenter;
    if (Math.abs(delta) > deadzone) {
        // aggression controls how strongly AI tries to close the gap
        const aiAggression = extremeMode ? 1.2 : 0.14;
        const maxMoveScale = extremeMode ? 3.0 : 1.0;
        // move proportionally but clamped to (possibly scaled) maxMovePerFrame
        const move = clamp(delta * aiAggression, -maxMovePerFrame * maxMoveScale, maxMovePerFrame * maxMoveScale);
        aiY += move;
    }
    const {displayH: displayH_forClamp} = getDisplaySize();
    aiY = clamp(aiY, 0, displayH_forClamp - PADDLE_HEIGHT);
}

function updateScores() {
    const target = settings.winScore;
    // Update labels
    document.getElementById('playerLabel').textContent = (playerNameInput?.value || 'Player');
    document.getElementById('aiLabel').textContent = (aiNameInput?.value || 'AI');

    // Deuce and Advantage display handling
    if (scores.player >= target - 1 && scores.ai >= target - 1) {
        if (scores.player === scores.ai) {
            // Deuce
            playerScoreEl.textContent = scores.player;
            aiScoreEl.textContent = scores.ai;
            deuceIndicator.textContent = 'DEUCE';
        } else if (scores.player === scores.ai + 1) {
            // Player advantage
            playerScoreEl.textContent = 'ADV';
            aiScoreEl.textContent = scores.ai;
            deuceIndicator.textContent = '';
        } else if (scores.ai === scores.player + 1) {
            // AI advantage
            aiScoreEl.textContent = 'ADV';
            playerScoreEl.textContent = scores.player;
            deuceIndicator.textContent = '';
        } else {
            // Should not happen, but fallback
            playerScoreEl.textContent = scores.player;
            aiScoreEl.textContent = scores.ai;
            deuceIndicator.textContent = '';
        }
    } else {
        // Normal display
        playerScoreEl.textContent = scores.player;
        aiScoreEl.textContent = scores.ai;
        deuceIndicator.textContent = '';
    }
}

function isDeuce() {
    const target = settings.winScore;
    return scores.player >= target - 1 && scores.ai >= target - 1 && scores.player === scores.ai;
}

function checkWin() {
    const target = settings.winScore;
    // If neither has reached target yet, no win
    if (scores.player < target && scores.ai < target) return false;

    const bothAtDeuceZone = scores.player >= target - 1 && scores.ai >= target - 1;

    if (bothAtDeuceZone) {
        // Deuce rules: need 2-point lead to win
        if (scores.player - scores.ai >= 2) {
            announceWinner('player');
            return true;
        }
        if (scores.ai - scores.player >= 2) {
            announceWinner('ai');
            return true;
        }
        return false;
    }

    // Not both in deuce zone: first to target wins immediately
    if (scores.player >= target) {
        announceWinner('player');
        return true;
    }
    if (scores.ai >= target) {
        announceWinner('ai');
        return true;
    }
    return false;
}

function announceWinner(winner) {
    // winner is 'player' or 'ai'
    const winnerName = (winner === 'player') ? (playerNameInput?.value || 'Player') : (aiNameInput?.value || 'AI');
    running = false;
    // Increase gamesWon in match mode
    if (gameModeSelect?.value === 'match') {
        gamesWon[winner] += 1;
        if (gamesWon[winner] >= 2) {
            // mark the final game's dot as win/loss
            const currentGame = gamesWon.player + gamesWon.ai;
            const idx = currentGame - 1;
            const playerDots = document.querySelectorAll('#playerGames .game-dot');
            const aiDots = document.querySelectorAll('#aiGames .game-dot');
            if (winner === 'player') { 
                if (playerDots[idx]) { playerDots[idx].classList.add('win'); playerDots[idx].classList.remove('loss'); }
                if (aiDots[idx]) { aiDots[idx].classList.add('loss'); aiDots[idx].classList.remove('win'); }
            } else {
                if (aiDots[idx]) { aiDots[idx].classList.add('win'); aiDots[idx].classList.remove('loss'); }
                if (playerDots[idx]) { playerDots[idx].classList.add('loss'); playerDots[idx].classList.remove('win'); }
            }
            updateMatchUI();
            // show final match score (e.g. "Player wins the match by 2-1")
            const other = (winner === 'player') ? 'ai' : 'player';
            showOverlay(`${winnerName} wins the match by ${gamesWon[winner]}-${gamesWon[other]}. Click Restart to play again.`);
            matchEnded = true;
            // reset points for display consistency after match/game end
            scores.player = 0;
            scores.ai = 0;
            updateScores();
            // center ball/paddles for potential restart
            ball = resetBallState();
            const displayH_final = canvas.height / (window.devicePixelRatio || 1);
            playerY = (displayH_final - PADDLE_HEIGHT_current) / 2;
            aiY = (displayH_final - PADDLE_HEIGHT) / 2;
            // Re-enable mode and name inputs when the match ends
            if (gameModeSelect) gameModeSelect.disabled = false;
            if (playerNameInput) playerNameInput.disabled = false;
            if (aiNameInput) aiNameInput.disabled = false;
            // Re-enable ramp and win inputs when the match ends
            if (rampInput) rampInput.disabled = false;
            if (winInput) winInput.disabled = false;
            // Re-enable AI difficulty when the overall match ends
            if (aiDifficultyInput) aiDifficultyInput.disabled = false;
            // Re-enable extreme toggle when the overall match ends
            if (extremeModeInput) extremeModeInput.disabled = false;
            return;
        } else {
            updateMatchUI();
            const currentGame = gamesWon.player + gamesWon.ai;
            // mark the per-game dot for this completed game
            const idx = currentGame - 1;
            const playerDots = document.querySelectorAll('#playerGames .game-dot');
            const aiDots = document.querySelectorAll('#aiGames .game-dot');
            if (winner === 'player') {
                if (playerDots[idx]) { playerDots[idx].classList.add('win'); playerDots[idx].classList.remove('loss'); }
                if (aiDots[idx]) { aiDots[idx].classList.add('loss'); aiDots[idx].classList.remove('win'); }
            } else {
                if (aiDots[idx]) { aiDots[idx].classList.add('win'); aiDots[idx].classList.remove('loss'); }
                if (playerDots[idx]) { playerDots[idx].classList.add('loss'); playerDots[idx].classList.remove('win'); }
            }
            showOverlay(`${winnerName} wins game ${currentGame}. Click or press Space to start next game.`);
            // reset per-game state for next game
            scores.player = 0;
            scores.ai = 0;
            // Reset per-game powerups: disabled only if extremeMode is active
            powerupsLeft = extremeMode ? 0 : 2;
            activePowerup = null;
            powerupUsedThisPoint = false;
            updatePowerupUI();
            updateScores();
            // Reset ball and paddles to center for next game
            ball = resetBallState();
            const displayH_next = canvas.height / (window.devicePixelRatio || 1);
            playerY = (displayH_next - PADDLE_HEIGHT_current) / 2;
            aiY = (displayH_next - PADDLE_HEIGHT) / 2;
            // After a single game win in a match where match continues, keep inputs disabled until match concludes or restart
            return;
        }
    }
    // One-shot mode
    showOverlay(`${winnerName} wins! Click Restart to play again.`);
    matchEnded = true;
    // reset points after the game ends so board shows fresh values
    scores.player = 0;
    scores.ai = 0;
    updateScores();
    ball = resetBallState();
    const displayH_one = canvas.height / (window.devicePixelRatio || 1);
    playerY = (displayH_one - PADDLE_HEIGHT_current) / 2;
    aiY = (displayH_one - PADDLE_HEIGHT) / 2;
    // Re-enable mode and name inputs when the one-shot game ends
    if (gameModeSelect) gameModeSelect.disabled = false;
    if (playerNameInput) playerNameInput.disabled = false;
    if (aiNameInput) aiNameInput.disabled = false;
    // Re-enable ramp and win inputs when the one-shot game ends
    if (rampInput) rampInput.disabled = false;
    if (winInput) winInput.disabled = false;
    // Re-enable AI difficulty when the game ends in one-shot mode
    if (aiDifficultyInput) aiDifficultyInput.disabled = false;
    // Re-enable extreme toggle when the one-shot game ends
    if (extremeModeInput) extremeModeInput.disabled = false;
}

function updateMatchUI() {
    // Fill game dots for each player according to gamesWon
    const playerDots = document.querySelectorAll('#playerGames .game-dot');
    const aiDots = document.querySelectorAll('#aiGames .game-dot');
    playerDots.forEach((dot, i) => {
        // Use 'filled' to indicate games won count, but preserve explicit win/loss classes
        // if present (win/loss take visual precedence). Only set filled when no
        // explicit win/loss class exists for that dot.
        if (i < gamesWon.player) {
            if (!dot.classList.contains('win') && !dot.classList.contains('loss')) dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    });
    aiDots.forEach((dot, i) => {
        if (i < gamesWon.ai) {
            if (!dot.classList.contains('win') && !dot.classList.contains('loss')) dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    });
    const gameNumberEl = document.getElementById('gameNumber');
    const playerGamesContainer = document.getElementById('playerGames');
    const aiGamesContainer = document.getElementById('aiGames');
    if (gameModeSelect?.value === 'match') {
        const gamesCompleted = gamesWon.player + gamesWon.ai;
        // Always show 'Game 1' at the start of a match
        const currentGame = gamesCompleted + 1;
        gameNumberEl.textContent = `Game ${currentGame}`;
        if (playerGamesContainer) playerGamesContainer.style.display = 'flex';
        if (aiGamesContainer) aiGamesContainer.style.display = 'flex';
    } else {
        gameNumberEl.textContent = '';
        if (playerGamesContainer) playerGamesContainer.style.display = 'none';
        if (aiGamesContainer) aiGamesContainer.style.display = 'none';
    }
}

function showOverlay(text) {
    messageEl.textContent = text;
    overlay.style.pointerEvents = 'auto';
    overlay.style.display = 'flex';
}

function hideOverlay() {
    overlay.style.pointerEvents = 'none';
    overlay.style.display = 'none';
}

// Player paddle follows mouse
canvas.addEventListener('mousemove', function (evt) {
    const rect = canvas.getBoundingClientRect();
    let mouseY = evt.clientY - rect.top;
    const targetY = mouseY - PADDLE_HEIGHT_current / 2;
    // Smooth toward cursor. speed influenced by powerup multiplier.
    playerY += (targetY - playerY) * (0.35 * playerSpeedMultiplier);
    const displayH = canvas.height / (window.devicePixelRatio || 1);
    playerY = clamp(playerY, 0, displayH - PADDLE_HEIGHT_current);
});

// Start on click or space
function startGame() {
    settings.rampSeconds = parseFloat(rampInput.value) || 10;
    settings.winScore = parseInt(winInput.value, 10) || 10;
    settings.aiDifficulty = parseInt(aiDifficultyInput.value, 10) || 3;
    // read extreme mode at game start
    extremeMode = !!(extremeModeInput && extremeModeInput.checked);
    if (extremeMode) {
        // immediate effects for extreme mode
        powerupsDisabledByDifficulty = true;
        powerupsLeft = 0;
        activePowerup = null;
        // message handled by updatePowerupUI
    }
        // Do not disable powerups based on AI slider maximum; extreme mode controls powerups
    // Freeze ramp for this game and map ramp speed to AI difficulty
    // Map aiDifficulty [1..5] to ramp seconds [20 (slow) .. 6 (fast)]
    const minRamp = 6;
    const maxRamp = 20;
    const maxAi = parseInt(aiDifficultyInput.max || '5', 10);
    const aiNorm = (settings.aiDifficulty - 1) / Math.max(1, (maxAi - 1));
    effectiveRampSeconds = maxRamp - aiNorm * (maxRamp - minRamp);
    // Start ramp from fresh for this game
    settings.speedMultiplier = 1;
    accumulatedPlayTime = 0;
    startTimestamp = null;
    // disable ramp and win inputs during active play
    if (rampInput) rampInput.disabled = true;
    if (winInput) winInput.disabled = true;
    // disable AI difficulty while a game is active
    if (aiDifficultyInput) aiDifficultyInput.disabled = true;
    // disable extreme mode while a game is active
    if (extremeModeInput) extremeModeInput.disabled = true;
    // Do NOT reset `powerupsLeft` here. powerupsLeft is per-game and is reset only
    // when a new game starts (announceWinner for match mode) or on Restart.
    // Reset per-serve transient state only:
    activePowerup = null;
    powerupUsedThisPoint = false;
    updatePowerupUI();
    running = true;
    // While a game/match is active, prevent changing mode or player names
    if (gameModeSelect) gameModeSelect.disabled = true;
    if (playerNameInput) playerNameInput.disabled = true;
    if (aiNameInput) aiNameInput.disabled = true;
    // also disable AI difficulty when active
    if (aiDifficultyInput) aiDifficultyInput.disabled = true;
    if (extremeModeInput) extremeModeInput.disabled = true;
    hideOverlay();
}

canvas.addEventListener('click', () => {
    // Only start when not running and match hasn't ended. Restart button must be used after match end.
    if (!running && !matchEnded) startGame();
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (running && !isPaused) {
            // Pause
            isPaused = true;
            running = false;
            pauseBtn.classList.add('paused');
            if (startTimestamp) {
                accumulatedPlayTime += (performance.now() - startTimestamp) / 1000;
                startTimestamp = null;
            }
            showOverlay('Paused — press Space to resume');
        } else if (isPaused) {
            // Resume
            isPaused = false;
            pauseBtn.classList.remove('paused');
            running = true;
            startTimestamp = performance.now();
            hideOverlay();
        } else if (!running && !matchEnded) {
            // Start a new game only if match hasn't ended
            startGame();
        }
    }
    // Cheat codes: W for speed boost, D for bigger paddle
    if (e.key.toLowerCase() === 'w') {
        tryActivatePowerup('speed');
    } else if (e.key.toLowerCase() === 'd') {
        tryActivatePowerup('size');
    }
});

// React to AI difficulty slider changes
aiDifficultyInput.addEventListener('input', () => {
    // Update setting for next game; do not change effectiveRampSeconds mid-game
    settings.aiDifficulty = parseInt(aiDifficultyInput.value, 10) || 3;
    // Do not disable powerups based on slider maximum anymore.
    // Slider only affects AI difficulty; powerups are now only disabled
    // by extreme mode.
    if (!running && powerupsLeft === 0 && !extremeMode) powerupsLeft = 2;
    updatePowerupUI();
});

// Extreme mode toggle handling
if (extremeModeInput) {
    extremeModeInput.addEventListener('input', () => {
        extremeMode = !!extremeModeInput.checked;
        if (extremeMode) {
            // disable powerups immediately when extreme is enabled
            powerupsDisabledByDifficulty = true;
            powerupsLeft = 0;
            activePowerup = null;
            playerSpeedMultiplier = 1;
            PADDLE_HEIGHT_current = PADDLE_HEIGHT;
        } else {
            // when extreme mode is turned off, restore powerups if appropriate
            powerupsDisabledByDifficulty = false;
            if (!running && powerupsLeft === 0) powerupsLeft = 2;
        }
        updatePowerupUI();
    });
}

// Resize canvas to CSS size if responsive
function resizeCanvas() {
    // Make the internal canvas resolution match the displayed CSS size while
    // accounting for devicePixelRatio for crisp rendering.
    // Compute display size from base size and applied UI scale so the entire UI fits
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.max(100, Math.floor(BASE_CANVAS_W * currentUIScale));
    const displayHeight = Math.max(100, Math.floor(BASE_CANVAS_H * currentUIScale));

    // Only resize if different to avoid clearing frequently
    if (canvas.width !== Math.floor(displayWidth * dpr) || canvas.height !== Math.floor(displayHeight * dpr)) {
        // Store ratios to rescale positions proportionally
        const prevWidth = canvas.width || displayWidth * dpr;
        const prevHeight = canvas.height || displayHeight * dpr;

        // New internal size
        canvas.width = Math.floor(displayWidth * dpr);
        canvas.height = Math.floor(displayHeight * dpr);
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';

        // Scale drawing operations
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Rescale game objects positions so visuals remain centered
        const scaleX = canvas.width / prevWidth;
        const scaleY = canvas.height / prevHeight;
        // Apply scaling to positions (ball and paddles)
        ball.x = (ball.x || prevWidth / 2) * scaleX;
        ball.y = (ball.y || prevHeight / 2) * scaleY;
        playerY = (playerY || 0) * scaleY;
        aiY = (aiY || 0) * scaleY;
        // Recompute scaled gameplay constants based on display size relative to base
        const displayW_new = canvas.width / dpr;
        const displayH_new = canvas.height / dpr;
    const scaleFactor = displayW_new / BASE_CANVAS_W;
    // gameplayScale follows visual scale so speed/AI scale appropriately
    gameplayScale = scaleFactor;
        PADDLE_WIDTH = Math.max(8, Math.round(BASE_PADDLE_WIDTH * scaleFactor));
        PADDLE_HEIGHT = Math.max(40, Math.round(BASE_PADDLE_HEIGHT * scaleFactor));
        BALL_RADIUS = Math.max(4, Math.round(BASE_BALL_RADIUS * scaleFactor));
        PLAYER_X = Math.max(8, Math.round(BASE_PLAYER_X * scaleFactor));
        AI_MARGIN = Math.max(8, Math.round(BASE_AI_MARGIN * scaleFactor));

        // Ensure paddles stay within bounds (use display coords)
        playerY = clamp(playerY, 0, displayH_new - PADDLE_HEIGHT_current);
        aiY = clamp(aiY, 0, displayH_new - PADDLE_HEIGHT);
    }
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    update(dt, timestamp);
    draw();
    requestAnimationFrame(gameLoop);
}

// Initial setup
function init() {
    // Make canvas responsive: let CSS drive displayed size and JS set internal resolution
    // Initial sizing
    resizeCanvas();
    // Recompute when the window changes size
    window.addEventListener('resize', () => {
        resizeCanvas();
        applyUIScale();
    });
    // Apply initial UI scale
    applyUIScale();
    updateScores();
    updatePowerupUI();
    updateMatchUI();
    showOverlay('Click or press Space to start');
    // Ensure inputs are editable at initial load
    if (gameModeSelect) gameModeSelect.disabled = false;
    if (playerNameInput) playerNameInput.disabled = false;
    if (aiNameInput) aiNameInput.disabled = false;
    if (aiDifficultyInput) aiDifficultyInput.disabled = false;
    if (extremeModeInput) extremeModeInput.disabled = false;
    if (rampInput) rampInput.disabled = false;
    if (winInput) winInput.disabled = false;
    requestAnimationFrame(gameLoop);
}

function updatePowerupUI() {
    powerupLeftEl.textContent = powerupsDisabledByDifficulty ? '0' : powerupsLeft;
    if (powerupsDisabledByDifficulty) {
        powerupActiveEl.textContent = 'DISABLED';
    } else {
        powerupActiveEl.textContent = `Active: ${activePowerup ? activePowerup : '-'} `;
    }
    if (systemMessage) {
        if (extremeMode) {
            systemMessage.classList.add('extreme');
            systemMessage.textContent = 'EXTREME MODE ACTIVATED. ALL POWERUPS ARE DISABLED';
        } else {
            systemMessage.classList.remove('extreme');
            systemMessage.textContent = powerupsDisabledByDifficulty ? 'Powerups disabled' : '';
        }
    }
}

function tryActivatePowerup(type) {
    // If not running, ignore
    if (!running) return;
    // Disabled at highest AI difficulty
    if (powerupsDisabledByDifficulty) return;
    // No uses left
    if (powerupsLeft <= 0) return;
    // Only one powerup per point
    if (powerupUsedThisPoint) return;
    // Apply powerup
    if (type === 'speed') {
        // speed powerup: temporarily increase player's tracking responsiveness (stronger)
        activePowerup = 'speed';
        playerSpeedMultiplier = 4.0; // stronger speed effect
        aiSpeedMultiplier = 0.6; // slow AI while powerup is active
    } else if (type === 'size') {
        activePowerup = 'size';
        const {displayH: dpH_forSize} = getDisplaySize();
        PADDLE_HEIGHT_current = Math.min(PADDLE_HEIGHT * 1.6, dpH_forSize - 10);
    }
    powerupsLeft -= 1;
    powerupUsedThisPoint = true;
    updatePowerupUI();
    console.debug(`Powerup used: ${activePowerup}. powerupsLeft now: ${powerupsLeft}`);
}

init();

// No initial automatic disabling of powerups based on AI slider — extreme mode controls that

// Allow clicking the overlay to start the game (but ignore clicks on the Restart button)
if (overlay) {
    overlay.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'restartBtn') return; // handled elsewhere
        if (!running && !matchEnded) startGame();
    });
}

// Restart button: fully reset match/game state and UI
if (restartBtn) {
    restartBtn.addEventListener('click', () => {
        // reset everything and immediately start a fresh game
        // Reset everything but do NOT auto-start — show overlay so user can tweak settings
        resetGameAndMatch();
        // ensure inputs are enabled for configuration after restart
        if (gameModeSelect) gameModeSelect.disabled = false;
        if (playerNameInput) playerNameInput.disabled = false;
        if (aiNameInput) aiNameInput.disabled = false;
        if (aiDifficultyInput) aiDifficultyInput.disabled = false;
        if (extremeModeInput) extremeModeInput.disabled = false;
        if (rampInput) rampInput.disabled = false;
        if (winInput) winInput.disabled = false;
        // Keep matchEnded false so user may start via click/Space when ready
        matchEnded = false;
        showOverlay('Click or press Space to start');
    });
}