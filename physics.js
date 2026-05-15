// physics.js — ball state, movement, collision, wall bounce, trajectory prediction

export function createBall(displayW, displayH, gameplayScale, servingTo = (Math.random() > 0.5 ? 'player' : 'ai')) {
    const angle = (Math.random() * Math.PI / 4) - (Math.PI / 8);
    const dir = servingTo === 'player' ? -1 : 1;
    // vx/vy ARE the true velocity — magnitude is speed, direction is angle.
    // moveBall() uses them directly without re-normalising (bug #2 fix).
    const speed = 8 * gameplayScale;
    return {
        x: displayW / 2,
        y: displayH / 2,
        speed,   // kept as the base reference for bounce speed-ups
        vx: speed * Math.cos(angle) * dir,
        vy: speed * Math.sin(angle) * (Math.random() > 0.5 ? 1 : -1)
    };
}

export function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

// FIX #2: moveBall no longer re-normalises vx/vy.
// vx/vy are the true velocity; just scale by dt and apply.
export function moveBall(ball, dt) {
    const moveFactor = dt / (1000 / 60);
    ball.x += ball.vx * moveFactor;
    ball.y += ball.vy * moveFactor;
}

// FIX #1: swept paddle collision.
// Returns the fraction t ∈ [0,1] of the move at which the ball edge first
// touches the paddle rectangle, or null if no collision this frame.
export function sweptPaddleCollision(ball, dx, dy, paddleX, paddleY, paddleW, paddleH) {
    // Expand paddle by ball radius (Minkowski sum) so we can treat ball as a point.
    const left   = paddleX - ball.r;
    const right  = paddleX + paddleW + ball.r;
    const top    = paddleY - ball.r;
    const bottom = paddleY + paddleH + ball.r;

    // Slab intersection — find t range where point is inside expanded rect.
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

// Simple AABB overlap — used as a secondary guard after sweep.
export function collidesWithPaddle(ball, ballRadius, paddleX, paddleY, paddleW, paddleH) {
    return (
        ball.x - ballRadius < paddleX + paddleW &&
        ball.x + ballRadius > paddleX &&
        ball.y - ballRadius < paddleY + paddleH &&
        ball.y + ballRadius > paddleY
    );
}

// FIX #2: bounce writes a new vx/vy that IS the velocity going forward.
// The 1.05x speed-up now persists because moveBall uses vx/vy directly.
export function handlePaddleBounce(ball, paddleY, paddleH, isPlayer) {
    const relativeIntersectY = (paddleY + paddleH / 2) - ball.y;
    const normalizedIntersectY = clamp(relativeIntersectY / (paddleH / 2), -1, 1);
    const bounceAngle = normalizedIntersectY * (Math.PI / 4);
    const dir = isPlayer ? 1 : -1;
    // Increase live speed by 5% on each hit, capped to prevent runaway.
    const currentSpeed = Math.hypot(ball.vx, ball.vy);
    const newSpeed = Math.min(currentSpeed * 1.05, ball.speed * 8);
    ball.speed = newSpeed; // update reference so future ramp stays sane
    ball.vx = newSpeed * Math.cos(bounceAngle) * dir;
    ball.vy = newSpeed * -Math.sin(bounceAngle);
}

export function bounceWalls(ball, ballRadius, displayH) {
    if (ball.y - ballRadius < 0) {
        ball.y = ballRadius;
        ball.vy = Math.abs(ball.vy);
    } else if (ball.y + ballRadius > displayH) {
        ball.y = displayH - ballRadius;
        ball.vy = -Math.abs(ball.vy);
    }
}

// FIX #11: on maxBounce exceeded, return last simulated y not ball.y.
// Predict Y of ball when it reaches targetX, accounting for wall bounces.
export function predictBallAtX(ball, ballRadius, targetX, displayH) {
    if (ball.vx === 0) return { y: ball.y, bounces: 0 };
    const headingRight = ball.vx > 0;
    if (headingRight && targetX < ball.x) return { y: ball.y, bounces: 0 };
    if (!headingRight && targetX > ball.x) return { y: ball.y, bounces: 0 };

    let x = ball.x, y = ball.y, vy = ball.vy;
    const vx = ball.vx;
    let bounces = 0;
    const maxBounces = 12;

    while (bounces <= maxBounces) {
        const distX = targetX - x;
        const t = distX / vx;
        const newY = y + vy * t;
        if (newY < ballRadius) {
            const tTop = (ballRadius - y) / vy;
            x = x + vx * tTop;
            y = ballRadius;
            vy = Math.abs(vy);
            bounces++;
        } else if (newY > displayH - ballRadius) {
            const tBot = (displayH - ballRadius - y) / vy;
            x = x + vx * tBot;
            y = displayH - ballRadius;
            vy = -Math.abs(vy);
            bounces++;
        } else {
            return { y: newY, bounces };
        }
    }
    // FIX: return last known y, not the original ball.y
    return { y: clamp(y, ballRadius, displayH - ballRadius), bounces };
}