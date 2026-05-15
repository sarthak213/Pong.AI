// ai.js — AI paddle movement and targeting logic

import { clamp, predictBallAtX } from './physics.js';

// FIX #8: target expressed as top-edge coordinate (same system as aiY),
// clamped to [0, displayH - paddleH] to match the final aiY clamp.
export function moveAI({ aiY, ball, ballRadius, paddleH, paddleW, aiX, displayH, displayW,
    aiDifficulty, aiSpeedMultiplier, extremeMode, playerY, playerPaddleH,
    gameplayScale, dt }) {

    let targetTopEdge; // top-edge Y that AI wants its paddle at

    if (extremeMode && ball.vx > 0) {
        const { y: predictedY } = predictBallAtX(ball, ballRadius, aiX, displayH);
        const playerCenter = playerY + playerPaddleH / 2;
        const aimUp = playerCenter > predictedY ? 1 : -1;
        const desiredNorm = 0.95 * aimUp;
        // Desired paddle centre → convert to top edge
        const desiredCentre = clamp(
            predictedY + desiredNorm * (paddleH / 2),
            paddleH / 2,
            displayH - paddleH / 2
        );
        targetTopEdge = desiredCentre - paddleH / 2;
    } else {
        const { y: predictedY } = predictBallAtX(ball, ballRadius, aiX, displayH);
        const blendFactor = (aiDifficulty - 1) / 4; // 0=easy, 1=hard
        // Blend between tracking live ball Y and predicted contact Y
        const targetCentre = ball.y + (predictedY - ball.y) * blendFactor + ball.vy * (4 + aiDifficulty * 2);
        // Convert centre target to top-edge, clamped correctly
        targetTopEdge = clamp(targetCentre - paddleH / 2, 0, displayH - paddleH);
    }

    // Speed: scales with difficulty and game speed
    const deadzone = extremeMode ? 2 : 4;
    const aiBase     = (2 + aiDifficulty * 1.5) * gameplayScale * (extremeMode ? 5.0 : 1.0);
    const aiSpeedMax = (extremeMode ? 140 : 18) * gameplayScale;
    const frameScale = extremeMode ? 2.5 : 1.0;
    // Note: speedMultiplier removed from AI — the ball's actual vx/vy already
    // encode speed so the prediction naturally accounts for fast balls.
    const rawSpeed  = clamp(aiBase * aiSpeedMultiplier, 3 * gameplayScale, aiSpeedMax);
    const maxMove   = rawSpeed * (dt / (1000 / 60)) * frameScale;

    const delta = targetTopEdge - aiY;
    if (Math.abs(delta) > deadzone) {
        const aggression = extremeMode ? 1.2 : 0.14;
        const scale      = extremeMode ? 3.0 : 1.0;
        const move = clamp(delta * aggression, -maxMove * scale, maxMove * scale);
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
        const distX = aiX - x;
        const t     = distX / vx;
        const newY  = y + vy * t;

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