// renderer.js — all canvas drawing

import { buildTrajectorySegments } from './ai.js';

export function draw(ctx, canvas, {
    ball, playerY, aiY, PLAYER_X, AI_X, PADDLE_WIDTH, PADDLE_HEIGHT,
    PADDLE_HEIGHT_current, BALL_RADIUS, showTrajectory
}) {
    const dpr      = window.devicePixelRatio || 1;
    const displayW = canvas.width  / dpr;
    const displayH = canvas.height / dpr;

    ctx.fillStyle = '#181d23';
    ctx.fillRect(0, 0, displayW, displayH);

    drawNet(ctx, displayW, displayH);

    if (showTrajectory && ball.vx > 0) {
        drawTrajectory(ctx, ball, BALL_RADIUS, AI_X, displayH);
    }

    drawRoundedRect(ctx, PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT_current, 3, '#00adb5');
    drawRoundedRect(ctx, AI_X,     aiY,     PADDLE_WIDTH, PADDLE_HEIGHT,         3, '#f96d00');

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
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 6]);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if (i === 0) ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();

    const last = segments[segments.length - 1];
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(249,109,0,0.5)';
    ctx.beginPath();
    ctx.arc(last.x2, last.y2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// FIX #10: fallback for browsers without ctx.roundRect (Safari < 15.4).
function drawRoundedRect(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
    } else {
        // Manual arcTo fallback
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y,     x + w, y + r,     r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x,     y + h, x,     y + h - r, r);
        ctx.lineTo(x,     y + r);
        ctx.arcTo(x,     y,     x + r, y,         r);
        ctx.closePath();
    }
    ctx.fill();
}