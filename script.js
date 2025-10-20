const canvas = document.getElementById('pong');
const ctx = canvas.getContext('2d');

// Constants
const PADDLE_WIDTH = 16;
const PADDLE_HEIGHT = 100;
const BALL_RADIUS = 10;
const PLAYER_X = 20;
const AI_X = () => canvas.width - PADDLE_WIDTH - 20;

// State
let playerY = (canvas.height - PADDLE_HEIGHT) / 2;
let aiY = (canvas.height - PADDLE_HEIGHT) / 2;

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
        // Update visibility of match-specific UI
        updateMatchUI();
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
        }
    });
}
if (aiNameInput) {
    aiNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            updateScores();
            updateMatchUI();
        }
    });
}

function resetBallState(servingTo = (Math.random() > 0.5 ? 'player' : 'ai')) {
    const angle = (Math.random() * Math.PI / 4) - (Math.PI / 8); // small angle
    const dir = servingTo === 'player' ? -1 : 1;
    // Start each serve at the base speed (speedMultiplier ramps during play)
    const speed = settings.baseSpeed;
    return {
        x: canvas.width / 2,
        y: canvas.height / 2,
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
    ctx.strokeStyle = '#393e46';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 10; i < canvas.height; i += 30) {
        ctx.moveTo(canvas.width / 2, i);
        ctx.lineTo(canvas.width / 2, i + 20);
    }
    ctx.stroke();
}

function draw() {
    // Background
    drawRect(0, 0, canvas.width, canvas.height, '#222831');
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

    // Top/bottom bounce
    if (ball.y - BALL_RADIUS < 0) {
        ball.y = BALL_RADIUS;
        ball.vy = -ball.vy;
    } else if (ball.y + BALL_RADIUS > canvas.height) {
        ball.y = canvas.height - BALL_RADIUS;
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
    } else if (ball.x + BALL_RADIUS > canvas.width) {
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
        desiredPaddleCenter = clamp(desiredPaddleCenter, PADDLE_HEIGHT / 2, canvas.height - PADDLE_HEIGHT / 2);
        target = desiredPaddleCenter;
    }
    // AI speed scales with difficulty: 1..5 => slow..fast
    let aiBase = 2 + settings.aiDifficulty * 1.5;
    // If extreme mode is active, boost AI base significantly above slider max
    if (extremeMode) aiBase *= 5.0;
    // Apply aiSpeedMultiplier which can be reduced by player speed powerup
    const aiSpeedMax = extremeMode ? 140 : 18;
    const aiSpeed = clamp((aiBase + settings.speedMultiplier * 0.6) * aiSpeedMultiplier, 3, aiSpeedMax);
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
    aiY = clamp(aiY, 0, canvas.height - PADDLE_HEIGHT);
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
            updateMatchUI();
            showOverlay(`${winnerName} wins the match! Click Restart to play again.`);
            // reset points for display consistency after match/game end
            scores.player = 0;
            scores.ai = 0;
            updateScores();
            // center ball/paddles for potential restart
            ball = resetBallState();
            playerY = (canvas.height - PADDLE_HEIGHT_current) / 2;
            aiY = (canvas.height - PADDLE_HEIGHT) / 2;
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
            playerY = (canvas.height - PADDLE_HEIGHT_current) / 2;
            aiY = (canvas.height - PADDLE_HEIGHT) / 2;
            // After a single game win in a match where match continues, keep inputs disabled until match concludes or restart
            return;
        }
    }
    // One-shot mode
    showOverlay(`${winnerName} wins! Click Restart to play again.`);
    // reset points after the game ends so board shows fresh values
    scores.player = 0;
    scores.ai = 0;
    updateScores();
    ball = resetBallState();
    playerY = (canvas.height - PADDLE_HEIGHT_current) / 2;
    aiY = (canvas.height - PADDLE_HEIGHT) / 2;
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
        dot.classList.toggle('filled', i < gamesWon.player);
    });
    aiDots.forEach((dot, i) => {
        dot.classList.toggle('filled', i < gamesWon.ai);
    });
    const gameNumberEl = document.getElementById('gameNumber');
    const playerGamesContainer = document.getElementById('playerGames');
    const aiGamesContainer = document.getElementById('aiGames');
    if (gameModeSelect?.value === 'match') {
        const currentGame = gamesWon.player + gamesWon.ai + 1;
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
    playerY = clamp(playerY, 0, canvas.height - PADDLE_HEIGHT_current);
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
    if (!running) startGame();
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        // If currently running, pause. If paused or not running, resume/start.
        if (running && !isPaused) {
            isPaused = true;
            running = false;
            pauseBtn.classList.add('paused');
            if (startTimestamp) {
                accumulatedPlayTime += (performance.now() - startTimestamp) / 1000;
                startTimestamp = null;
            }
            showOverlay('Paused — press Space to resume');
        } else if (isPaused) {
            isPaused = false;
            pauseBtn.classList.remove('paused');
            running = true;
            startTimestamp = performance.now();
            hideOverlay();
        } else if (!running) {
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

restartBtn.addEventListener('click', () => {
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
    updatePowerupUI();
    updateMatchUI();
    showOverlay('Click or press Space to start');
    // Re-enable mode and name inputs on restart
    if (gameModeSelect) gameModeSelect.disabled = false;
    if (playerNameInput) playerNameInput.disabled = false;
    if (aiNameInput) aiNameInput.disabled = false;
    // Re-enable AI difficulty on restart (always)
    if (aiDifficultyInput) aiDifficultyInput.disabled = false;
    // Re-enable extreme toggle on restart (always)
    if (extremeModeInput) extremeModeInput.disabled = false;
    // Re-enable ramp and win inputs as this is a fresh start
    if (rampInput) rampInput.disabled = false;
    if (winInput) winInput.disabled = false;
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
    // Keep internal resolution consistent with displayed size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
            const aiSpeedMax = extremeMode ? 40 : 18;
            const aiSpeed = clamp((aiBase + settings.speedMultiplier * 0.6) * aiSpeedMultiplier, 3, aiSpeedMax);
    playerY = clamp(playerY, 0, canvas.height - PADDLE_HEIGHT_current);
    aiY = clamp(aiY, 0, canvas.height - PADDLE_HEIGHT);
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
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
    // Make canvas visually larger while keeping resolution
    canvas.style.width = '900px';
    canvas.style.height = '600px';
    canvas.width = 900;
    canvas.height = 600;
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
        PADDLE_HEIGHT_current = Math.min(PADDLE_HEIGHT * 1.6, canvas.height - 10);
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
        if (!running) startGame();
    });
}