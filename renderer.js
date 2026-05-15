// renderer.js — canvas drawing with deep-space aesthetic

import { buildTrajectorySegments } from './ai.js';

export function draw(ctx, canvas, {
    ball, playerY, aiY, PLAYER_X, AI_X, PADDLE_WIDTH, PADDLE_HEIGHT,
    PADDLE_HEIGHT_current, BALL_RADIUS, showTrajectory
}) {
    const dpr      = window.devicePixelRatio || 1;
    const W        = canvas.width  / dpr;
    const H        = canvas.height / dpr;

    // ── Background ──────────────────────────────────────────
    ctx.fillStyle = '#090c10';
    ctx.fillRect(0, 0, W, H);

    // Subtle inner vignette
    const vignette = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    // ── Centre line ─────────────────────────────────────────
    drawCentreLine(ctx, W, H);

    // ── Trajectory ──────────────────────────────────────────
    if (showTrajectory && ball.vx > 0) {
        drawTrajectory(ctx, ball, BALL_RADIUS, AI_X, H);
    }

    // ── Paddles ──────────────────────────────────────────────
    drawPaddle(ctx, PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT_current, '#00d4e0', H);
    drawPaddle(ctx, AI_X,     aiY,     PADDLE_WIDTH, PADDLE_HEIGHT,         '#ff7c2a', H);

    // ── Ball ─────────────────────────────────────────────────
    drawBall(ctx, ball, BALL_RADIUS);
}

function drawCentreLine(ctx, W, H) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = 0;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function drawPaddle(ctx, x, y, w, h, color, displayH) {
    ctx.save();

    // Glow beneath
    const glow = ctx.createRadialGradient(x + w/2, y + h/2, 0, x + w/2, y + h/2, h * 0.9);
    glow.addColorStop(0, color + '33');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(x - h*0.4, y - h*0.2, w + h*0.8, h*1.4);

    // Paddle body with rounded rect
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, Math.min(w/2, 4));
    // Gradient fill: slightly lighter at top
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, lighten(color, 0.15));
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fill();

    // Bright edge highlight
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, Math.min(w/2, 4));
    ctx.strokeStyle = lighten(color, 0.3) + 'cc';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.restore();
}

function drawBall(ctx, ball, r) {
    ctx.save();

    // Motion trail glow
    const trailGrad = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, r * 3.5);
    trailGrad.addColorStop(0, 'rgba(230,240,255,0.12)');
    trailGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = trailGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Ball body
    const ballGrad = ctx.createRadialGradient(
        ball.x - r * 0.3, ball.y - r * 0.3, r * 0.05,
        ball.x, ball.y, r
    );
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(0.6, '#d8e8f8');
    ballGrad.addColorStop(1, '#9ab8d8');
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawTrajectory(ctx, ball, ballRadius, aiX, displayH) {
    const segments = buildTrajectorySegments(ball, ballRadius, aiX, displayH);
    if (!segments.length) return;

    ctx.save();

    // Gradient along the trajectory: fades out toward the AI
    const first = segments[0];
    const last  = segments[segments.length - 1];
    const lineGrad = ctx.createLinearGradient(first.x1, first.y1, last.x2, last.y2);
    lineGrad.addColorStop(0, 'rgba(255,124,42,0.5)');
    lineGrad.addColorStop(1, 'rgba(255,124,42,0.08)');

    ctx.strokeStyle = lineGrad;
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 7]);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    segments.forEach((s, i) => {
        if (i === 0) ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
    });
    ctx.stroke();

    // Contact point dot
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,124,42,0.6)';
    ctx.beginPath();
    ctx.arc(last.x2, last.y2, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ── Helpers ───────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
    } else {
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
}

function lighten(hex, amt) {
    // Simple hex lighten — amt 0..1
    const n = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * amt));
    const g = Math.min(255, ((n >> 8)  & 0xff) + Math.round(255 * amt));
    const b = Math.min(255, ( n        & 0xff) + Math.round(255 * amt));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2,'0')).join('');
}