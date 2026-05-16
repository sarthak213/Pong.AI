// renderer.js — theme-aware canvas drawing

import { buildTrajectorySegments } from './ai.js';
import { THEMES } from './themes.js';

// Current theme canvas config — set by main.js via setTheme()
let TC = THEMES.neon.canvas;

export function setRendererTheme(themeId) {
    TC = THEMES[themeId]?.canvas ?? THEMES.neon.canvas;
}

export function draw(ctx, canvas, {
    ball, playerY, aiY, PLAYER_X, AI_X, PADDLE_WIDTH, PADDLE_HEIGHT,
    PADDLE_HEIGHT_current, BALL_RADIUS, showTrajectory
}) {
    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.width  / dpr;
    const H   = canvas.height / dpr;

    drawBackground(ctx, W, H);
    drawNet(ctx, W, H);
    if (TC.grid) drawGrid(ctx, W, H);
    if (showTrajectory && ball.vx > 0) drawTrajectory(ctx, ball, BALL_RADIUS, AI_X, H);
    drawPaddle(ctx, PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT_current, TC.playerColor);
    drawPaddle(ctx, AI_X,     aiY,     PADDLE_WIDTH, PADDLE_HEIGHT,         TC.aiColor);
    drawBall(ctx, ball, BALL_RADIUS);
}

// ── Background ────────────────────────────────────────────────
function drawBackground(ctx, W, H) {
    if (TC.bgGrad) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, TC.bgGradTop);
        g.addColorStop(1, TC.bgGradBot);
        ctx.fillStyle = g;
    } else {
        ctx.fillStyle = TC.bg;
    }
    ctx.fillRect(0, 0, W, H);

    if (TC.vignette) {
        const vig = ctx.createRadialGradient(W/2, H/2, H*0.15, W/2, H/2, H*0.9);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, TC.vignetteColor ?? 'rgba(0,0,0,0.4)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
    }
}

// ── Synthwave grid floor ───────────────────────────────────────
function drawGrid(ctx, W, H) {
    ctx.save();
    ctx.strokeStyle = TC.gridColor;
    ctx.lineWidth   = 0.5;

    // Horizontal lines — denser toward bottom (perspective)
    const lines = 10;
    for (let i = 1; i <= lines; i++) {
        const t = i / lines;
        const y = H * 0.5 + H * 0.5 * t;
        ctx.globalAlpha = t * 0.8;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Vertical lines converging to horizon
    const vLines = 12;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i <= vLines; i++) {
        const x = (i / vLines) * W;
        ctx.beginPath();
        ctx.moveTo(W / 2, H * 0.5);
        ctx.lineTo(x, H);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

// ── Net ───────────────────────────────────────────────────────
function drawNet(ctx, W, H) {
    ctx.save();
    ctx.strokeStyle = TC.netColor;
    ctx.lineWidth   = 1;
    ctx.setLineDash(TC.netDash);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// ── Paddles ───────────────────────────────────────────────────
function drawPaddle(ctx, x, y, w, h, color) {
    ctx.save();
    const r = Math.min(w / 2, 4);

    if (TC.paddleStyle === 'retro') {
        // Classic pong: crisp white rectangle, no glow
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);

    } else if (TC.paddleStyle === 'minimal') {
        // Clean solid fill + subtle shadow (arctic)
        ctx.shadowColor   = color + '55';
        ctx.shadowBlur    = 6;
        ctx.fillStyle     = color;
        ctx.beginPath(); roundRect(ctx, x, y, w, h, r); ctx.fill();
        ctx.shadowBlur = 0;

    } else {
        // Neon / synthwave: gradient body + subtle edge highlight, no bloom
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, lighten(color, 0.18));
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.beginPath(); roundRect(ctx, x, y, w, h, r); ctx.fill();

        // Thin bright edge highlight
        ctx.strokeStyle = lighten(color, 0.4) + '99';
        ctx.lineWidth   = 0.75;
        ctx.beginPath(); roundRect(ctx, x, y, w, h, r); ctx.stroke();
    }
    ctx.restore();
}

// ── Ball ──────────────────────────────────────────────────────
function drawBall(ctx, ball, r) {
    ctx.save();

    if (TC.ballGlow) {
        const glowCol = TC.ballGlowColor ?? 'rgba(230,240,255,0.15)';
        const halo = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, r * 4);
        halo.addColorStop(0, glowCol);
        halo.addColorStop(1, 'transparent');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(ball.x, ball.y, r * 4, 0, Math.PI * 2); ctx.fill();
    }

    if (TC.paddleStyle === 'retro') {
        // Classic: flat white circle
        ctx.fillStyle = TC.ballColor;
        ctx.beginPath(); ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2); ctx.fill();
    } else if (TC.paddleStyle === 'minimal') {
        // Arctic: solid dark circle, clean
        ctx.fillStyle = TC.ballColor;
        ctx.beginPath(); ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2); ctx.fill();
    } else {
        // Neon / synthwave: sphere shading
        const sg = ctx.createRadialGradient(
            ball.x - r*0.3, ball.y - r*0.3, r*0.05,
            ball.x, ball.y, r
        );
        sg.addColorStop(0, '#ffffff');
        sg.addColorStop(0.55, '#ddeeff');
        sg.addColorStop(1,   '#88aacc');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

// ── Trajectory ────────────────────────────────────────────────
function drawTrajectory(ctx, ball, ballRadius, aiX, H) {
    const segs = buildTrajectorySegments(ball, ballRadius, aiX, H);
    if (!segs.length) return;
    ctx.save();

    const first = segs[0], last = segs[segs.length - 1];
    const lg = ctx.createLinearGradient(first.x1, first.y1, last.x2, last.y2);
    lg.addColorStop(0, TC.trajColor0);
    lg.addColorStop(1, TC.trajColor1);

    ctx.strokeStyle = lg;
    ctx.lineWidth   = TC.paddleStyle === 'retro' ? 0.75 : 1;
    ctx.setLineDash([4, 7]);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    segs.forEach((s, i) => { if (i === 0) ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); });
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = TC.trajColor0;
    ctx.beginPath(); ctx.arc(last.x2, last.y2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// ── Helpers ───────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x+w, y,   x+w, y+r,   r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y+h, x, y+h-r,     r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y,   x+r, y,        r);
        ctx.closePath();
    }
}

function lighten(hex, amt) {
    const n = parseInt(hex.replace('#',''), 16);
    const clamp = v => Math.min(255, v + Math.round(255 * amt));
    const r = clamp((n >> 16) & 0xff);
    const g = clamp((n >> 8)  & 0xff);
    const b = clamp( n        & 0xff);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}