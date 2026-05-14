// renderer.js — all canvas drawing

import { buildTrajectorySegments } from './ai.js';

export function draw(ctx, canvas, {
    ball, playerY, aiY, PLAYER_X, AI_X, PADDLE_WIDTH, PADDLE_HEIGHT,
    PADDLE_HEIGHT_current, BALL_RADIUS, showTrajectory, extremeMode,
    aiSpeedMultiplier, gameplayScale
}) {
    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.width / dpr;
    const displayH = canvas.height / dpr;

    // Background
    ctx.fillStyle = '#181d23';
    ctx.fillRect(0, 0, displayW, displayH);

    // Net
    drawNet(ctx, displayW, displayH);

    // Trajectory visualizer
    if (showTrajectory && ball.vx > 0) {
        drawTrajectory(ctx, ball, BALL_RADIUS, AI_X, displayH);
    }

    // Player paddle
    drawRoundedRect(ctx, PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT_current, 3, '#00adb5');

    // AI paddle
    drawRoundedRect(ctx, AI_X, aiY, PADDLE_WIDTH, PADDLE_HEIGHT, 3, '#f96d00');

    // Ball
    ctx.fillStyle = '#fafafa';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
}

function drawNet(ctx, displayW, displayH) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(displayW / 2, 0);
    ctx.lineTo(displayW / 2, displayH);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawTrajectory(ctx, ball, ballRadius, aiX, displayH) {
    const segments = buildTrajectorySegments(ball, ballRadius, aiX, displayH);
    if (!segments.length) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(249,109,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 6]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if (i === 0) ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();

    // Endpoint marker on AI paddle
    const last = segments[segments.length - 1];
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(249,109,0,0.5)';
    ctx.beginPath();
    ctx.arc(last.x2, last.y2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawRoundedRect(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
}