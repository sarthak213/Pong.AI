// powerups.js — powerup state and activation logic

export function createPowerupState() {
    return {
        left: 2,
        active: null,          // 'speed' | 'size' | null
        usedThisPoint: false,
        disabled: false,       // true when extreme mode active
    };
}

// Returns updated powerup state + side-effect values, or null if can't activate.
export function tryActivatePowerup(type, state, { running }) {
    if (!running) return null;
    if (state.disabled) return null;
    if (state.left <= 0) return null;
    if (state.usedThisPoint) return null;

    return {
        ...state,
        active: type,
        left: state.left - 1,
        usedThisPoint: true,
    };
}

// Effects returned as separate multipliers so callers apply them
export function getPowerupEffects(active) {
    if (active === 'speed') {
        return { playerSpeedMult: 4.0, aiSpeedMult: 0.6, paddleHeightScale: 1.0 };
    }
    if (active === 'size') {
        return { playerSpeedMult: 1.0, aiSpeedMult: 1.0, paddleHeightScale: 1.6 };
    }
    return { playerSpeedMult: 1.0, aiSpeedMult: 1.0, paddleHeightScale: 1.0 };
}

export function resetPowerupAfterPoint(state, extremeMode) {
    return {
        ...state,
        active: null,
        usedThisPoint: false,
        disabled: extremeMode,
    };
}

export function resetPowerupForGame(extremeMode) {
    return {
        left: extremeMode ? 0 : 2,
        active: null,
        usedThisPoint: false,
        disabled: extremeMode,
    };
}