// physics.js — ball state, movement, collision, wall bounce, trajectory prediction

export function createBall(displayW, displayH, gameplayScale, servingTo = (Math.random() > 0.5 ? 'player' : 'ai')) {
    const angle = (Math.random() * Math.PI / 4) - (Math.PI / 8);
    const dir = servingTo === 'player' ? -1 : 1;
    const speed = 8 * gameplayScale;
    return {
        x: displayW / 2,
        y: displayH / 2,
        speed,
        vx: speed * Math.cos(angle) * dir,
        vy: speed * Math.sin(angle) * (Math.random() > 0.5 ? 1 : -1)
    };
}

export function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

export function collidesWithPaddle(ball, ballRadius, paddleX, paddleY, paddleW, paddleH) {
    return (
        ball.x - ballRadius < paddleX + paddleW &&
        ball.x + ballRadius > paddleX &&
        ball.y - ballRadius < paddleY + paddleH &&
        ball.y + ballRadius > paddleY
    );
}

export function handlePaddleBounce(ball, paddleY, paddleH, isPlayer, speedMultiplier) {
    const relativeIntersectY = (paddleY + paddleH / 2) - ball.y;
    const normalizedIntersectY = relativeIntersectY / (paddleH / 2);
    const bounceAngle = normalizedIntersectY * (Math.PI / 4);
    const dir = isPlayer ? 1 : -1;
    const speed = (ball.speed * speedMultiplier) * 1.05;
    ball.vx = speed * Math.cos(bounceAngle) * dir;
    ball.vy = speed * -Math.sin(bounceAngle);
}

export function moveBall(ball, dt, speedMultiplier) {
    const velMag = Math.hypot(ball.vx, ball.vy) || ball.speed;
    const dirX = ball.vx / velMag;
    const dirY = ball.vy / velMag;
    const currentSpeed = ball.speed * speedMultiplier;
    const moveFactor = dt / (1000 / 60);
    ball.x += dirX * currentSpeed * moveFactor;
    ball.y += dirY * currentSpeed * moveFactor;
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
    return { y: clamp(ball.y, ballRadius, displayH - ballRadius), bounces: 0 };
}