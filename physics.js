// physics.js — ball state, movement, collision, wall bounce, trajectory prediction

import { DIFFICULTY } from './difficulty.js';

// Create ball at serve speed for the given difficulty level.
// No per-hit compounding — speed is driven by the ramp in update().
export function createBall(displayW, displayH, gameplayScale, difficulty, servingTo = (Math.random() > 0.5 ? 'player' : 'ai')) {
    const angle = (Math.random() * Math.PI / 4) - (Math.PI / 8);
    const dir   = servingTo === 'player' ? -1 : 1;
    const cfg   = DIFFICULTY[difficulty] ?? DIFFICULTY[3];
    const speed = cfg.startSpeed * gameplayScale;
    return {
        x: displayW / 2,
        y: displayH / 2,
        vx: speed * Math.cos(angle) * dir,
        vy: speed * Math.sin(angle) * (Math.random() > 0.5 ? 1 : -1),
        // Metadata used by the ramp system — not mutated by bounces.
        baseSpeed: speed,
        maxSpeed:  cfg.maxSpeed * gameplayScale,
        rampTau:   cfg.rampTau,
    };
}

export function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

// Move ball — vx/vy are true velocity px/frame at 60fps.
export function moveBall(ball, dt) {
    const f = dt / (1000 / 60);
    ball.x += ball.vx * f;
    ball.y += ball.vy * f;
}

// Apply the asymptotic speed ramp each frame.
// speed(t) = maxSpeed - (maxSpeed - baseSpeed) * e^(-t / tau)
// This smoothly approaches maxSpeed without ever exceeding it.
export function applySpeedRamp(ball, elapsed) {
    const { baseSpeed, maxSpeed, rampTau } = ball;
    const targetSpeed = maxSpeed - (maxSpeed - baseSpeed) * Math.exp(-elapsed / rampTau);
    const currentSpeed = Math.hypot(ball.vx, ball.vy);
    if (currentSpeed > 0 && Math.abs(targetSpeed - currentSpeed) > 0.01) {
        const scale = targetSpeed / currentSpeed;
        ball.vx *= scale;
        ball.vy *= scale;
    }
}

// Swept paddle collision — prevents tunnelling at high speed.
// Returns fraction t ∈ [0,1] of move at contact, or null if no hit.
export function sweptPaddleCollision(ball, dx, dy, paddleX, paddleY, paddleW, paddleH) {
    const left   = paddleX - ball.r;
    const right  = paddleX + paddleW + ball.r;
    const top    = paddleY - ball.r;
    const bottom = paddleY + paddleH + ball.r;

    let tMin = 0, tMax = 1;

    if (dx !== 0) {
        const t1 = (left  - ball.x) / dx;
        const t2 = (right - ball.x) / dx;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
    } else if (ball.x < left || ball.x > right) {
        return null;
    }

    if (dy !== 0) {
        const t1 = (top    - ball.y) / dy;
        const t2 = (bottom - ball.y) / dy;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
    } else if (ball.y < top || ball.y > bottom) {
        return null;
    }

    if (tMin > tMax || tMax < 0) return null;
    return Math.max(0, tMin);
}

// AABB overlap — secondary guard after sweep.
export function collidesWithPaddle(ball, ballRadius, paddleX, paddleY, paddleW, paddleH) {
    return (
        ball.x - ballRadius < paddleX + paddleW &&
        ball.x + ballRadius > paddleX &&
        ball.y - ballRadius < paddleY + paddleH &&
        ball.y + ballRadius > paddleY
    );
}

// Bounce off paddle — preserves current speed exactly (no compounding).
// Angle is determined by where on the paddle the ball hits.
export function handlePaddleBounce(ball, paddleY, paddleH, isPlayer) {
    const relativeIntersectY   = (paddleY + paddleH / 2) - ball.y;
    const normalizedIntersectY = clamp(relativeIntersectY / (paddleH / 2), -1, 1);
    const bounceAngle = normalizedIntersectY * (Math.PI / 4);
    const dir         = isPlayer ? 1 : -1;
    // Keep current speed — the ramp drives speed, not bounces.
    const speed = Math.hypot(ball.vx, ball.vy);
    ball.vx = speed * Math.cos(bounceAngle) * dir;
    ball.vy = speed * -Math.sin(bounceAngle);
}

export function bounceWalls(ball, ballRadius, displayH) {
    if (ball.y - ballRadius < 0) {
        ball.y  = ballRadius;
        ball.vy = Math.abs(ball.vy);
    } else if (ball.y + ballRadius > displayH) {
        ball.y  = displayH - ballRadius;
        ball.vy = -Math.abs(ball.vy);
    }
}

// Predict Y of ball at targetX, accounting for wall bounces.
export function predictBallAtX(ball, ballRadius, targetX, displayH) {
    if (ball.vx === 0) return { y: ball.y, bounces: 0 };
    const headingRight = ball.vx > 0;
    if (headingRight && targetX < ball.x) return { y: ball.y, bounces: 0 };
    if (!headingRight && targetX > ball.x) return { y: ball.y, bounces: 0 };

    let x = ball.x, y = ball.y, vy = ball.vy;
    const vx = ball.vx;
    let bounces = 0;

    while (bounces <= 12) {
        const t    = (targetX - x) / vx;
        const newY = y + vy * t;
        if (newY < ballRadius) {
            const tTop = (ballRadius - y) / vy;
            x = x + vx * tTop; y = ballRadius; vy = Math.abs(vy); bounces++;
        } else if (newY > displayH - ballRadius) {
            const tBot = (displayH - ballRadius - y) / vy;
            x = x + vx * tBot; y = displayH - ballRadius; vy = -Math.abs(vy); bounces++;
        } else {
            return { y: newY, bounces };
        }
    }
    return { y: clamp(y, ballRadius, displayH - ballRadius), bounces };
}