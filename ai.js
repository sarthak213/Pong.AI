// ai.js — AI paddle movement with difficulty-driven parameters, fatigue, and scaled aiming

import { clamp, predictBallAtX } from './physics.js';
import { DIFFICULTY, getFatigue, applyFatigue } from './difficulty.js';

// rallyHits is passed in from main.js (incremented on each paddle hit, reset on point).
export function moveAI({ aiY, ball, ballRadius, paddleH, aiX, displayH,
    difficulty, extremeMode, playerY, playerPaddleH, aiSpeedMultiplier,
    gameplayScale, dt, rallyHits }) {

    const cfg = extremeMode
        ? DIFFICULTY.extreme
        : (DIFFICULTY[difficulty] ?? DIFFICULTY[3]);

    // ── Fatigue ────────────────────────────────────────────────
    const fatigue       = getFatigue(cfg, rallyHits);
    const effBlend      = applyFatigue(cfg.blendFactor, fatigue, cfg.fatigueDepth);
    const effAggression = applyFatigue(cfg.aggression,  fatigue, cfg.fatigueDepth);
    const effMaxSpeed   = applyFatigue(cfg.aiMaxSpeed,  fatigue, cfg.fatigueDepth);
    // Aim aggression also degrades with fatigue — tired AI goes for safer returns
    const effAimAgg     = cfg.extremeAim
        ? applyFatigue(cfg.aimAggression ?? 0.92, fatigue, cfg.fatigueDepth)
        : 0;

    // ── Target calculation ─────────────────────────────────────
    let targetTopEdge;

    if (cfg.extremeAim && ball.vx > 0) {
        const { y: predictedY } = predictBallAtX(ball, ballRadius, aiX, displayH);
        const playerCenter = playerY + playerPaddleH / 2;

        let aimDir;
        let aimNorm;

        if (cfg.trapSetup) {
            // Expert / Extreme: aim at the edge of the player's paddle to force an
            // awkward return angle. Target the paddle edge furthest from the ball's
            // predicted Y — this creates the most difficult return position.
            const playerTop    = playerY;
            const playerBottom = playerY + playerPaddleH;
            const distToTop    = Math.abs(predictedY - playerTop);
            const distToBottom = Math.abs(predictedY - playerBottom);
            // Aim toward whichever edge is harder to reach
            aimDir  = distToTop > distToBottom ? -1 : 1;
            // Occasionally (every ~4 rallies) aim at the opposite corner for variation
            if (rallyHits > 0 && rallyHits % 4 === 0) aimDir = -aimDir;
            aimNorm = effAimAgg;
        } else {
            // Hard: aim away from player centre — scaled angle, not always extreme
            aimDir  = playerCenter > predictedY ? 1 : -1;
            aimNorm = effAimAgg;
        }

        const desiredCentre = clamp(
            predictedY + aimDir * aimNorm * (paddleH / 2),
            paddleH / 2,
            displayH - paddleH / 2
        );
        targetTopEdge = desiredCentre - paddleH / 2;

    } else {
        // Beginner / Easy / Medium: blend between live ball tracking and prediction
        const { y: predictedY } = predictBallAtX(ball, ballRadius, aiX, displayH);
        const targetCentre = ball.y * (1 - effBlend) + predictedY * effBlend;
        targetTopEdge = clamp(targetCentre - paddleH / 2, 0, displayH - paddleH);
    }

    // ── Movement ───────────────────────────────────────────────
    const delta = targetTopEdge - aiY;
    if (Math.abs(delta) > cfg.deadzone) {
        const maxMove = effMaxSpeed * gameplayScale * aiSpeedMultiplier * (dt / (1000 / 60));
        const move    = clamp(delta * effAggression, -maxMove, maxMove);
        aiY += move;
    }

    return clamp(aiY, 0, displayH - paddleH);
}

// Build trajectory path segments for the visualizer.
export function buildTrajectorySegments(ball, ballRadius, aiX, displayH, maxSegments = 6) {
    if (ball.vx <= 0) return [];

    const segments = [];
    let x = ball.x, y = ball.y, vy = ball.vy;
    const vx = ball.vx;
    let count = 0;

    while (x < aiX && count < maxSegments) {
        const t    = (aiX - x) / vx;
        const newY = y + vy * t;

        if (newY < ballRadius) {
            const tTop = (ballRadius - y) / vy;
            const midX = x + vx * tTop;
            segments.push({ x1: x, y1: y, x2: midX, y2: ballRadius });
            x = midX; y = ballRadius; vy = Math.abs(vy);
        } else if (newY > displayH - ballRadius) {
            const tBot = (displayH - ballRadius - y) / vy;
            const midX = x + vx * tBot;
            segments.push({ x1: x, y1: y, x2: midX, y2: displayH - ballRadius });
            x = midX; y = displayH - ballRadius; vy = -Math.abs(vy);
        } else {
            segments.push({ x1: x, y1: y, x2: aiX, y2: newY });
            break;
        }
        count++;
    }
    return segments;
}