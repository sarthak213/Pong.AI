// ai.js — AI paddle movement and targeting logic

import { clamp, predictBallAtX } from './physics.js';

// Move AI paddle toward a target Y each frame.
// Returns updated aiY.
export function moveAI({ aiY, ball, ballRadius, paddleH, paddleW, aiX, displayH, displayW,
    aiDifficulty, speedMultiplier, aiSpeedMultiplier, extremeMode, playerY, playerPaddleH,
    gameplayScale, dt }) {

    const aiCenter = aiY + paddleH / 2;
    let target;

    if (extremeMode && ball.vx > 0) {
        // Predict exact contact point then aim for a steep outgoing angle
        const { y: predictedY } = predictBallAtX(ball, ballRadius, aiX, displayH);
        const playerCenter = playerY + playerPaddleH / 2;
        const aimUp = playerCenter > predictedY ? 1 : -1;
        const desiredNorm = 0.95 * aimUp;
        let desiredCenter = predictedY + desiredNorm * (paddleH / 2);
        desiredCenter = clamp(desiredCenter, paddleH / 2, displayH - paddleH / 2);
        target = desiredCenter;
    } else {
        // Standard predictive target with difficulty-scaled lookahead
        const { y: predictedY } = predictBallAtX(ball, ballRadius, aiX, displayH);
        const blendFactor = (aiDifficulty - 1) / 4; // 0 (easy) to 1 (hard)
        // Easy AI tracks current ball Y; hard AI tracks predicted Y
        target = ball.y + (predictedY - ball.y) * blendFactor + (ball.vy * (4 + aiDifficulty * 2));
        target = clamp(target, paddleH / 2, displayH - paddleH / 2);
    }

    const deadzone = extremeMode ? 2 : 6;
    const aiBase = extremeMode
        ? (2 + aiDifficulty * 1.5) * gameplayScale * 5.0
        : (2 + aiDifficulty * 1.5) * gameplayScale;
    const aiSpeedMax = (extremeMode ? 140 : 18) * gameplayScale;
    const frameScale = extremeMode ? 2.5 : 1.0;
    const rawSpeed = clamp((aiBase + speedMultiplier * 0.6) * aiSpeedMultiplier, 3 * gameplayScale, aiSpeedMax);
    const maxMove = rawSpeed * (dt / (1000 / 60)) * frameScale;

    const delta = target - aiCenter;
    if (Math.abs(delta) > deadzone) {
        const aggression = extremeMode ? 1.2 : 0.14;
        const scale = extremeMode ? 3.0 : 1.0;
        const move = clamp(delta * aggression, -maxMove * scale, maxMove * scale);
        aiY += move;
    }

    return clamp(aiY, 0, displayH - paddleH);
}

// Build trajectory path segments for the visualizer.
// Returns array of {x1,y1,x2,y2} segments from ball current pos to AI paddle X.
export function buildTrajectorySegments(ball, ballRadius, aiX, displayH, maxSegments = 6) {
    if (ball.vx <= 0) return []; // only show when ball moves toward AI

    const segments = [];
    let x = ball.x, y = ball.y, vy = ball.vy;
    const vx = ball.vx;
    let count = 0;

    while (x < aiX && count < maxSegments) {
        const distX = aiX - x;
        const t = distX / vx;
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