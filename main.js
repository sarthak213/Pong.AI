// main.js — orchestrator: screens (menu → game → game over), game loop, input, UI state

import { createBall, clamp, sweptPaddleCollision, collidesWithPaddle, handlePaddleBounce, moveBall, bounceWalls, applySpeedRamp } from './physics.js';
import { moveAI } from './ai.js';
import { DIFFICULTY } from './difficulty.js';
import { createPowerupState, tryActivatePowerup, getPowerupEffects, resetPowerupAfterPoint, resetPowerupForGame } from './powerups.js';
import { createScoreState, resetScoreForNewGame, resetScoreForNewMatch, handlePointScored, getPointStatus, getAdvantage, isDeuce, WIN_SCORE, MATCH_FORMATS } from './scoring.js';
import { draw, setRendererTheme } from './renderer.js';
import { submitResult, isLeaderboardConfigured, computeScore, formatDuration, DIFFICULTY_INFO } from './leaderboard.js';
import { initPage, getTheme, onThemeChange, refreshIcons, mountResults, icon, esc } from './ui.js';

// ─── Settings (persisted) ──────────────────────────────────────────────────────
const SETTINGS_KEY = 'pongai-settings';
const DIFF_OPTIONS = [
    { id: 'easy',    cfg: 1,         level: 1, bars: 1, blurb: 'Mostly chases the ball and plays gentle angles. Tires quickly in long rallies.' },
    { id: 'medium',  cfg: 2,         level: 2, bars: 2, blurb: 'Reads part of the ball’s path and goes for moderate angles.' },
    { id: 'hard',    cfg: 3,         level: 3, bars: 3, blurb: 'Highly predictive: hunts corners and sets up awkward returns.' },
    { id: 'extreme', cfg: 'extreme', level: 3, bars: 4, blurb: 'Fastest ball and a relentless AI that aims for steep angles. Powerups are disabled.' },
];

function loadSettings() {
    const s = { playerName: 'Player', difficulty: 'medium', matchFormat: 'best3', showTrajectory: true };
    try {
        const p = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        if (typeof p.playerName === 'string' && p.playerName.trim()) s.playerName = p.playerName.slice(0, 14);
        if (DIFFICULTY_INFO[p.difficulty]) s.difficulty = p.difficulty;
        if (MATCH_FORMATS[p.matchFormat])  s.matchFormat = p.matchFormat;
        if (typeof p.showTrajectory === 'boolean') s.showTrajectory = p.showTrajectory;
    } catch {}
    return s;
}
let settings = loadSettings();
function updateSettings(patch) {
    settings = { ...settings, ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
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
let screen  = 'menu';   // 'menu' | 'game' | 'over'
let score   = createScoreState();
let powerup = createPowerupState();

let ball;
let playerY = 0, aiY = 0;
let PADDLE_HEIGHT_current = PADDLE_HEIGHT;
let playerSpeedMult = 1, aiSpeedMult = 1;

let running     = false;
let isPaused    = false;
let extremeMode = false;
let aiLevel     = 2;     // 1..3 — ignored by the AI when extremeMode is on

// Rally hit counter — increments each paddle hit, resets each point.
// Used by the AI fatigue system.
let rallyHits = 0;

// Whole-match stats for the game-over screen and leaderboard.
let matchStats = createMatchStats();
function createMatchStats() {
    return { points: { player: 0, ai: 0 }, longestRally: 0, deuces: 0, playMs: 0 };
}

// Bumped on every new match so late async work (save, game-over delay) from an old match is ignored.
let matchToken = 0;

// Elapsed active play time for speed ramp — reset each game.
let startTimestamp      = null;
let accumulatedPlayTime = 0;
let lastTime            = null;

// ─── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const screens = { menu: $('screenMenu'), game: $('screenGame'), over: $('screenOver') };
const overlayEl = $('overlay');
const pauseBtn  = $('pauseBtn');
const powerupBtns = document.querySelectorAll('[data-powerup]');

// ─── Screens ───────────────────────────────────────────────────────────────────
function showScreen(name) {
    screen = name;
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
    // Theme pickers are hidden (and so unusable) for the whole match.
    document.body.classList.toggle('in-match', name === 'game');
    window.scrollTo({ top: 0 });
}

// ─── Canvas sizing ─────────────────────────────────────────────────────────────
function doResizeCanvas() {
    const dpr   = window.devicePixelRatio || 1;
    const panel = canvas.parentElement;
    if (!panel) return;

    const availW = panel.clientWidth;
    const availH = panel.clientHeight;
    if (!availW || !availH) return;   // court hidden (menu / game-over screen)
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

        // Reapply active powerup scale after resize instead of blindly resetting.
        PADDLE_HEIGHT_current = powerup.active === 'size'
            ? Math.min(PADDLE_HEIGHT * 1.6, getDisplaySize().displayH - 10)
            : PADDLE_HEIGHT;

        const { displayH: dH } = getDisplaySize();
        playerY = clamp(playerY, 0, dH - PADDLE_HEIGHT_current);
        aiY     = clamp(aiY,     0, dH - PADDLE_HEIGHT);
    }
}

function getPlayerName() { return settings.playerName.trim() || 'Player'; }

function resetPositions() {
    const { displayH } = getDisplaySize();
    playerY = (displayH - PADDLE_HEIGHT_current) / 2;
    aiY     = (displayH - PADDLE_HEIGHT) / 2;
}

function newBall(servingTo) {
    const { displayW, displayH } = getDisplaySize();
    const diff = extremeMode ? 'extreme' : aiLevel;
    return createBall(displayW, displayH, gameplayScale, diff, servingTo);
}

// ─── Court overlay + flash ─────────────────────────────────────────────────────
function showOverlay(text, { crown = false } = {}) {
    $('message').textContent = text;
    $('ovPlay').hidden  = crown;
    $('ovCrown').hidden = !crown;
    overlayEl.hidden = false;
}
function hideOverlay() { overlayEl.hidden = true; }

// Big animated text over the court. tone: 'player' | 'ai' | 'gold'
function showFlash(text, tone) {
    const el   = $('flash');
    const span = el.firstElementChild;
    span.textContent = text;
    span.className = tone === 'player' ? 'glow-text-primary' : tone === 'ai' ? 'glow-text-ai' : 'text-gold';
    el.classList.remove('show');
    void el.offsetWidth;   // restart the CSS animation
    el.classList.add('show');
}

// ─── Scoring / game flow ───────────────────────────────────────────────────────
function onPointScored(side) {
    const { state: newScore, result } = handlePointScored(side, score);
    score = newScore;

    matchStats.points[side] += 1;
    matchStats.longestRally = Math.max(matchStats.longestRally, rallyHits);
    if (result?.startsWith('gameWon:') || result?.startsWith('matchWon:')) {
        matchStats.deuces += newScore.deuceCount;
    }

    powerup = resetPowerupAfterPoint(powerup, extremeMode);
    playerSpeedMult = 1;
    aiSpeedMult     = 1;
    PADDLE_HEIGHT_current = PADDLE_HEIGHT;
    rallyHits = 0; // reset fatigue counter each point
    running = false;

    if (result === 'deuce') {
        showFlash('DEUCE', 'gold');
        refreshUI();
        // Serve toward the scorer (who just evened it up), not away.
        ball = newBall(side);
        showOverlay('Deuce! Click or press Space to serve');
        return;
    }

    if (result?.startsWith('matchWon:')) {
        const winner = result.split(':')[1];
        const name   = winner === 'player' ? getPlayerName() : 'AI';
        const other  = winner === 'player' ? 'ai' : 'player';
        showFlash(winner === 'player' ? 'VICTORY' : 'DEFEAT', winner);
        ball = newBall(side === 'player' ? 'ai' : 'player');
        resetPositions();
        score.matchEnded = true;
        refreshUI();
        showOverlay(`${name} wins the match ${score.gamesWon[winner]}–${score.gamesWon[other]}!`, { crown: true });
        finishMatch(winner);
        return;
    }

    if (result?.startsWith('gameWon:')) {
        const winner = result.split(':')[1];
        const name   = winner === 'player' ? getPlayerName() : 'AI';
        showFlash(`GAME · ${name.toUpperCase()}`, winner);
        // Read gamesTotal from the returned state BEFORE resetting.
        const gamesTotal = newScore.gamesWon.player + newScore.gamesWon.ai;

        // Reset ramp state between games in a match.
        accumulatedPlayTime = 0;
        startTimestamp      = null;

        score   = resetScoreForNewGame(score);
        powerup = resetPowerupForGame(extremeMode);
        ball    = newBall(winner === 'player' ? 'ai' : 'player');
        resetPositions();
        refreshUI();
        showOverlay(`${name} wins game ${gamesTotal}! Click or press Space for the next game`);
        return;
    }

    // Normal point (the one that makes it 6–6 is announced as deuce)
    if (isDeuce(score)) showFlash('DEUCE', 'gold');
    else showFlash(side === 'player' ? '+1' : 'AI +1', side);
    refreshUI();
    ball = newBall(side === 'player' ? 'ai' : 'player');
    showOverlay(`Point for ${side === 'player' ? getPlayerName() : 'AI'}. Click or press Space to serve`);
}

// ─── Match start / serve / pause ───────────────────────────────────────────────
function startMatch() {
    matchToken++;
    const opt   = DIFF_OPTIONS.find(d => d.id === settings.difficulty) ?? DIFF_OPTIONS[1];
    extremeMode = opt.id === 'extreme';
    aiLevel     = opt.level;

    score   = resetScoreForNewMatch(settings.matchFormat);
    powerup = resetPowerupForGame(extremeMode);
    matchStats          = createMatchStats();
    accumulatedPlayTime = 0;
    startTimestamp      = null;
    rallyHits           = 0;
    running  = false;
    isPaused = false;
    playerSpeedMult = 1;
    aiSpeedMult     = 1;

    $('hudPlayerName').textContent = getPlayerName();
    $('trajToggle').checked = settings.showTrajectory;
    showScreen('game');
    doResizeCanvas();
    PADDLE_HEIGHT_current = PADDLE_HEIGHT;
    ball = newBall();
    resetPositions();
    refreshUI();
    showOverlay('Click or press Space to serve');
}

// Serve the next point.
function serve() {
    if (score.matchEnded || running || isPaused) return;
    running = true;
    hideOverlay();
    refreshUI();
}

function doPause() {
    if (!running) return;
    isPaused = true; running = false;
    if (startTimestamp) {
        accumulatedPlayTime += (performance.now() - startTimestamp) / 1000;
        startTimestamp = null;
    }
    showOverlay('Paused. Press Space or Resume to continue');
    refreshUI();
}

function doResume() {
    if (!isPaused) return;
    isPaused       = false;
    running        = true;
    startTimestamp = performance.now();
    lastTime       = null;   // prevents a large dt spike on the first resumed frame
    hideOverlay();
    refreshUI();
}

// Space / click on the court
function primaryAction() {
    if (screen !== 'game' || score.matchEnded) return;
    if (isPaused) doResume();
    else if (!running) serve();
}

function quitToMenu() {
    matchToken++;
    running = false;
    isPaused = false;
    showScreen('menu');
    reloadMenuTop?.();
}

// ─── HUD refresh ───────────────────────────────────────────────────────────────
const shownPoints = { player: null, ai: null };

function refreshUI() {
    const fmt   = MATCH_FORMATS[score.matchFormat];
    const deuce = isDeuce(score) && !score.matchEnded;
    const adv   = score.matchEnded ? null : getAdvantage(score);
    const ptStatus = getPointStatus(score);

    for (const who of ['player', 'ai']) {
        // Points — capped at WIN_SCORE so deuce wins never show 8. Pops when it changes.
        const pts = Math.min(score.points[who], WIN_SCORE);
        const ptsEl = $(`${who}Score`);
        if (shownPoints[who] !== pts) {
            ptsEl.textContent = pts;
            ptsEl.classList.remove('pop');
            void ptsEl.offsetWidth;
            if (shownPoints[who] !== null) ptsEl.classList.add('pop');
            shownPoints[who] = pts;
        }

        // Games won pips
        const pips = $(`${who}Pips`);
        pips.innerHTML = Array.from({ length: fmt.gamesNeeded }, (_, i) =>
            `<span class="${i < score.gamesWon[who] ? 'on' : ''}"></span>`).join('');

        // Advantage / game point / match point tag
        let status = null;
        if (adv === who) status = 'Advantage';
        else if (!deuce && !score.matchEnded && ptStatus[who]) {
            const { type, count } = ptStatus[who];
            status = type === 'matchPoint'
                ? (count === 1 ? 'Match point' : `${count} match points`)
                : (count === 1 ? 'Game point'  : `${count} game points`);
        }
        const statusEl = $(`${who}Status`);
        if ((statusEl.textContent || null) !== status) {
            statusEl.innerHTML = status ? `<span>${status}</span>` : '';
        }
    }

    // Centre: "first to 7", format · difficulty · game n, and the deuce pill on the status row
    $('hudDeuce').hidden = !deuce;
    $('hudDeuceText').textContent = score.deuceCount > 1 ? `Deuce #${score.deuceCount}` : 'Deuce';
    const gameNo = score.gamesWon.player + score.gamesWon.ai + 1;
    $('hudMeta').textContent = [
        fmt.label,
        DIFFICULTY_INFO[settings.difficulty].label,
        fmt.gamesNeeded > 1 && !score.matchEnded ? `Game ${gameNo}` : null,
    ].filter(Boolean).join(' · ');

    // Powerups
    $('powerupPips').innerHTML = [0, 1].map(i =>
        `<span class="${i < powerup.left ? 'on' : ''}"></span>`).join('');
    const canUse = running && !powerup.usedThisPoint && powerup.left > 0 && !powerup.disabled;
    powerupBtns.forEach(b => {
        const active = powerup.active === b.dataset.powerup;
        b.classList.toggle('active', active);
        b.disabled = !canUse && !active;
    });
    $('powerupNote').textContent = powerup.disabled
        ? 'Powerups are disabled in Extreme mode.'
        : powerup.active
            ? `${powerup.active === 'speed' ? 'Speed' : 'Size'} active this point!`
            : 'One per point, two per game, during a rally.';

    // Buttons
    pauseBtn.classList.toggle('is-paused', isPaused);
    pauseBtn.disabled = score.matchEnded || (!running && !isPaused);
    $('restartBtn').disabled = score.matchEnded;
}

// ─── Game over ─────────────────────────────────────────────────────────────────
let reloadOverTop = null;
let savedResultId = null;

// Called once when the match is won: saves the result and shows the game-over screen.
function finishMatch(winner) {
    const token = matchToken;
    const summary = {
        winner,
        playerName:  getPlayerName(),
        difficulty:  settings.difficulty,
        matchFormat: score.matchFormat,
        gamesWon:    { ...score.gamesWon },
        finalPoints: { ...score.points },
        totalPoints: { ...matchStats.points },
        longestRally: matchStats.longestRally,
        deuces:      matchStats.deuces,
        durationSec: Math.round(matchStats.playMs / 1000),
    };
    renderGameOver(summary);
    saveMatchResult(summary, token);
    setTimeout(() => {
        if (token !== matchToken) return;
        showScreen('over');
        animateNumber($('resultScore'), Number($('resultScore').dataset.value));
    }, 1800);
}

function renderGameOver(m) {
    const won  = m.winner === 'player';
    const diff = DIFFICULTY_INFO[m.difficulty];
    $('resultCard').className = `card pad-lg result-card shadow-lift fade-up ${won ? 'won' : 'lost'}`;
    $('resultIcon').innerHTML = icon(won ? 'trophy' : 'skull');
    $('resultTitle').textContent = won ? 'Victory!' : 'Defeated';
    $('resultTitle').className = `result-title ${won ? 'glow-text-primary' : 'glow-text-ai'}`;
    $('resultSub').innerHTML = `${esc(won ? `${m.playerName} beat the AI` : `The AI beat ${m.playerName}`)} · <strong>${diff.label}</strong> · ${MATCH_FORMATS[m.matchFormat].label}`;
    $('resultPlayerName').textContent = m.playerName;
    $('resultGamesPlayer').textContent = m.gamesWon.player;
    $('resultGamesAi').textContent     = m.gamesWon.ai;
    $('resultFinal').textContent = `games · final game ${m.finalPoints.player}–${m.finalPoints.ai}`;

    const stats = [
        { icon: 'target',   label: 'Points won',    value: `${m.totalPoints.player}–${m.totalPoints.ai}`, tone: 'tone-primary' },
        { icon: 'activity', label: 'Longest rally', value: `${m.longestRally} hits`,                     tone: 'tone-ai' },
        { icon: 'flame',    label: 'Deuces',        value: `${m.deuces}`,                                tone: 'tone-gold' },
        { icon: 'timer',    label: 'Duration',      value: formatDuration(m.durationSec),                tone: 'tone-neutral' },
    ];
    $('statGrid').innerHTML = stats.map((s, i) => `
        <div class="stat fade-up" style="--i:${i + 3}">
            <span class="chip ${s.tone}">${icon(s.icon)}</span>
            <div class="stat-val">${s.value}</div>
            <div class="stat-label">${s.label}</div>
        </div>`).join('');

    const localScore = computeScore({
        difficulty: m.difficulty, totalPointsPlayer: m.totalPoints.player,
        gamesWonPlayer: m.gamesWon.player, won,
    });
    $('resultScore').dataset.value = localScore;
    $('resultScore').textContent = '0';
    $('overTopDiff').textContent = diff.label;

    savedResultId = null;
    setSaveStatus(isLeaderboardConfigured() ? 'saving' : 'offline');
    reloadOverTop();
    refreshIcons();
}

function setSaveStatus(state, rank) {
    const el = $('saveStatus');
    el.className = `save-status ${state}`;
    const diffLabel = DIFFICULTY_INFO[settings.difficulty].label;
    el.innerHTML = {
        saving:  `${icon('loader-circle', 'spin')} Saving result…`,
        saved:   `${icon('circle-check')} Saved: rank #${rank?.difficulty ?? '?'} on ${diffLabel}, #${rank?.overall ?? '?'} overall`,
        error:   `${icon('triangle-alert')} Sorry, your result could not be saved to the leaderboard.`,
        offline: `${icon('cloud-off')} Online leaderboard not connected. Score not saved.`,
    }[state];
    refreshIcons();
}

async function saveMatchResult(m, token) {
    if (!isLeaderboardConfigured()) return;
    try {
        const saved = await submitResult({
            playerName:        m.playerName,
            difficulty:        m.difficulty,
            theme:             getTheme(),
            matchFormat:       m.matchFormat,
            won:               m.winner === 'player',
            gamesWonPlayer:    m.gamesWon.player,
            gamesWonAi:        m.gamesWon.ai,
            finalPointsPlayer: m.finalPoints.player,
            finalPointsAi:     m.finalPoints.ai,
            totalPointsPlayer: m.totalPoints.player,
            totalPointsAi:     m.totalPoints.ai,
            deuceCount:        m.deuces,
            longestRally:      m.longestRally,
            durationSec:       m.durationSec,
        });
        if (token !== matchToken) return;
        savedResultId = saved.id;
        $('resultScore').dataset.value = saved.score;
        if (screen === 'over') animateNumber($('resultScore'), saved.score);
        setSaveStatus('saved', { difficulty: saved.rank_difficulty, overall: saved.rank_overall });
        reloadOverTop();
    } catch (err) {
        console.error('Saving match result failed', err);
        if (token === matchToken) setSaveStatus('error');
    }
}

// Counts an element's number up to value with an ease-out curve.
function animateNumber(el, value, duration = 1200) {
    const from  = Number(el.textContent) || 0;
    const start = performance.now();
    const step  = (now) => {
        const t = Math.min(1, (now - start) / duration);
        el.textContent = Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// ─── Game loop ─────────────────────────────────────────────────────────────────
function update(dt, timestamp) {
    if (!running) return;
    if (!startTimestamp) startTimestamp = timestamp;
    matchStats.playMs += dt;

    const elapsed = accumulatedPlayTime + (timestamp - startTimestamp) / 1000;

    // Asymptotic speed ramp — approaches maxSpeed smoothly, never exceeds it.
    applySpeedRamp(ball, elapsed);

    // Swept collision — compute full move delta first.
    const moveFactor = dt / (1000 / 60);
    const dx = ball.vx * moveFactor;
    const dy = ball.vy * moveFactor;

    const AI_X = getAI_X();
    const { displayW, displayH } = getDisplaySize();

    ball.r = BALL_RADIUS; // needed by sweptPaddleCollision

    if (ball.vx < 0) {
        const t = sweptPaddleCollision(ball, dx, dy, PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT_current);
        if (t !== null) {
            ball.x += dx * t;
            ball.y += dy * t;
            ball.x  = PLAYER_X + PADDLE_WIDTH + BALL_RADIUS;
            handlePaddleBounce(ball, playerY, PADDLE_HEIGHT_current, true);
            rallyHits++;
            const rem = 1 - t, spd = Math.hypot(dx, dy), len = Math.hypot(ball.vx, ball.vy);
            ball.x += (ball.vx / len) * spd * rem;
            ball.y += (ball.vy / len) * spd * rem;
        } else {
            moveBall(ball, dt);
        }
    } else if (ball.vx > 0) {
        const t = sweptPaddleCollision(ball, dx, dy, AI_X, aiY, PADDLE_WIDTH, PADDLE_HEIGHT);
        if (t !== null) {
            ball.x += dx * t;
            ball.y += dy * t;
            ball.x  = AI_X - BALL_RADIUS;
            handlePaddleBounce(ball, aiY, PADDLE_HEIGHT, false);
            rallyHits++;
            const rem = 1 - t, spd = Math.hypot(dx, dy), len = Math.hypot(ball.vx, ball.vy);
            ball.x += (ball.vx / len) * spd * rem;
            ball.y += (ball.vy / len) * spd * rem;
        } else {
            moveBall(ball, dt);
        }
    } else {
        moveBall(ball, dt);
    }

    bounceWalls(ball, BALL_RADIUS, displayH);

    // AABB guard for edge cases
    if (collidesWithPaddle(ball, BALL_RADIUS, PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT_current) && ball.vx < 0) {
        ball.x = PLAYER_X + PADDLE_WIDTH + BALL_RADIUS;
        handlePaddleBounce(ball, playerY, PADDLE_HEIGHT_current, true);
        rallyHits++;
    }
    if (collidesWithPaddle(ball, BALL_RADIUS, AI_X, aiY, PADDLE_WIDTH, PADDLE_HEIGHT) && ball.vx > 0) {
        ball.x = AI_X - BALL_RADIUS;
        handlePaddleBounce(ball, aiY, PADDLE_HEIGHT, false);
        rallyHits++;
    }

    if (ball.x - BALL_RADIUS < 0)       { onPointScored('ai');     return; }
    if (ball.x + BALL_RADIUS > displayW) { onPointScored('player'); return; }

    aiY = moveAI({
        aiY, ball, ballRadius: BALL_RADIUS, paddleH: PADDLE_HEIGHT,
        aiX: AI_X, displayH,
        difficulty: aiLevel,
        aiSpeedMultiplier: aiSpeedMult,
        extremeMode, playerY, playerPaddleH: PADDLE_HEIGHT_current,
        gameplayScale, dt,
        rallyHits,
    });
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(timestamp - lastTime, 50);
    lastTime = timestamp;

    if (screen === 'game' && ball) {
        update(dt, timestamp);
        draw(ctx, canvas, {
            ball, playerY, aiY,
            PLAYER_X, AI_X: getAI_X(),
            PADDLE_WIDTH, PADDLE_HEIGHT, PADDLE_HEIGHT_current, BALL_RADIUS,
            showTrajectory: settings.showTrajectory,
        });
    }
    requestAnimationFrame(gameLoop);
}

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

// ─── Game input ────────────────────────────────────────────────────────────────
// Pointer events cover mouse and touch-drag (the court has touch-action: none).
canvas.addEventListener('pointermove', (e) => {
    const rect   = canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const target = mouseY - PADDLE_HEIGHT_current / 2;
    playerY += (target - playerY) * (0.35 * playerSpeedMult);
    playerY  = clamp(playerY, 0, getDisplaySize().displayH - PADDLE_HEIGHT_current);
});
canvas.addEventListener('click', primaryAction);
overlayEl.addEventListener('click', primaryAction);

window.addEventListener('keydown', (e) => {
    if (screen !== 'game') return;
    if (e.target?.tagName === 'INPUT' && e.target.type === 'text') return;

    if (e.code === 'Space') {
        e.preventDefault();
        if (running && !isPaused) doPause();
        else primaryAction();
    }
    if (e.key.toLowerCase() === 'w') activatePowerup('speed');
    if (e.key.toLowerCase() === 'd') activatePowerup('size');
});

powerupBtns.forEach(b => b.addEventListener('click', () => activatePowerup(b.dataset.powerup)));
pauseBtn.addEventListener('click', () => { if (isPaused) doResume(); else doPause(); });
$('restartBtn').addEventListener('click', startMatch);
$('quitBtn').addEventListener('click', quitToMenu);
$('rematchBtn').addEventListener('click', startMatch);
$('menuBtn').addEventListener('click', quitToMenu);

$('trajToggle').addEventListener('change', (e) => {
    updateSettings({ showTrajectory: e.target.checked });
    $('menuTrajToggle').checked = e.target.checked;
});

// ─── Menu ──────────────────────────────────────────────────────────────────────
let reloadMenuTop = null;

function renderMenu() {
    const nameInput = $('playerName');
    nameInput.value = settings.playerName;

    $('diffGrid').innerHTML = DIFF_OPTIONS.map(d => {
        const cfg = DIFFICULTY[d.cfg];
        return `<button class="diff-card${d.id === 'extreme' ? ' is-extreme' : ''}" role="radio" data-diff="${d.id}">
            <span class="diff-head">
                <span>${DIFFICULTY_INFO[d.id].label}</span>
                <span class="diff-bars">${[1, 2, 3, 4].map(i => `<span class="${i <= d.bars ? 'on' : ''}"></span>`).join('')}</span>
            </span>
            <span class="diff-sub">Ball ${cfg.startSpeed}→${cfg.maxSpeed} · ×${DIFFICULTY_INFO[d.id].multiplier}</span>
        </button>`;
    }).join('');

    const syncMenu = () => {
        document.querySelectorAll('[data-diff]').forEach(b =>
            b.setAttribute('aria-checked', String(b.dataset.diff === settings.difficulty)));
        document.querySelectorAll('[data-format]').forEach(b =>
            b.setAttribute('aria-checked', String(b.dataset.format === settings.matchFormat)));
        $('diffBlurb').textContent = DIFF_OPTIONS.find(d => d.id === settings.difficulty).blurb;
        $('menuTopDiff').textContent = DIFFICULTY_INFO[settings.difficulty].label;
        $('menuTrajToggle').checked = settings.showTrajectory;
        const valid = settings.playerName.trim().length > 0;
        $('startBtn').disabled = !valid;
        $('startError').hidden = valid;
    };

    nameInput.addEventListener('input', () => { updateSettings({ playerName: nameInput.value.slice(0, 14) }); syncMenu(); });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && settings.playerName.trim()) startMatch(); });
    document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => {
        updateSettings({ difficulty: b.dataset.diff });
        syncMenu();
        reloadMenuTop();
    }));
    document.querySelectorAll('[data-format]').forEach(b => b.addEventListener('click', () => {
        updateSettings({ matchFormat: b.dataset.format });
        syncMenu();
    }));
    $('menuTrajToggle').addEventListener('change', (e) => updateSettings({ showTrajectory: e.target.checked }));
    $('startBtn').addEventListener('click', () => { if (settings.playerName.trim()) startMatch(); });

    syncMenu();
}

// ─── Init ──────────────────────────────────────────────────────────────────────
(function init() {
    renderMenu();
    initPage();
    setRendererTheme(getTheme());
    onThemeChange(setRendererTheme);

    reloadMenuTop = mountResults($('menuTop'), () => ({ view: 'top', difficulty: settings.difficulty, limit: 5, compact: true }));
    reloadOverTop = mountResults($('overTop'), () => ({ view: 'top', difficulty: settings.difficulty, limit: 10, highlightId: savedResultId }), { immediate: false });

    new ResizeObserver(() => doResizeCanvas()).observe(canvas.parentElement);
    requestAnimationFrame(gameLoop);
})();
