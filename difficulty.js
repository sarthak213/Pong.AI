// difficulty.js — all per-level parameters for ball speed, AI behaviour, and fatigue.
//
// Speed model: asymptotic ramp
//   speed(t) = maxSpeed - (maxSpeed - startSpeed) * e^(-t / rampTau)
//   rampTau: time constant in seconds. At 1×tau ball is ~63% to max, at 3×tau ~95%.
//
// AI model:
//   blendFactor  — 0=tracks live ball Y only, 1=tracks fully predicted contact Y
//   aggression   — how aggressively the paddle snaps toward its target per frame
//   aiMaxSpeed   — paddle speed cap px/frame at 60fps (scaled by gameplayScale)
//   deadzone     — pixels of delta ignored to prevent jitter
//   extremeAim   — if true, AI targets steep outgoing angles rather than just contact
//
// Fatigue model (Medium and above only):
//   fatigue(n) = 1 - e^(-n / fatigueOnset)   where n = rally hit count
//   Effective parameter = base * (1 - fatigue(n) * fatigueDepth)
//   fatigueOnset — hit count at which fatigue reaches ~63% of its maximum effect.
//                  Higher = later onset, AI stays sharp longer into the rally.
//   fatigueDepth — maximum fractional degradation at full fatigue (0..1).
//                  0.55 = AI loses up to 55% of its speed/predictability.
//   Levels 1 and 2 have no fatigue (fatigueOnset: null).

export const DIFFICULTY = {
    1: {
        label:      'Beginner',
        startSpeed: 5,
        maxSpeed:   9,
        rampTau:    20,
        blendFactor:  0.0,   // tracks live ball only — zero prediction
        aggression:   0.06,
        aiMaxSpeed:   2.5,
        deadzone:     10,
        extremeAim:   false,
        fatigueOnset: null,  // no fatigue
        fatigueDepth: 0,
    },
    2: {
        label:      'Easy',
        startSpeed: 6,
        maxSpeed:   11,
        rampTau:    15,
        blendFactor:  0.1,   // 10% prediction — mostly reactive
        aggression:   0.08,
        aiMaxSpeed:   3.89,
        deadzone:     9,
        extremeAim:   false,
        fatigueOnset: null,  // no fatigue
        fatigueDepth: 0,
    },
    3: {
        label:      'Medium',
        startSpeed: 7,
        maxSpeed:   14,
        rampTau:    12,
        blendFactor:  0.28,  // ~30% prediction — noticeable but beatable
        aggression:   0.13,
        aiMaxSpeed:   5.5,
        deadzone:     7,
        extremeAim:   false,
        fatigueOnset: 6,
        fatigueDepth: 0.55,
    },
    4: {
        label:      'Hard',
        startSpeed: 8,
        maxSpeed:   17,
        rampTau:    10,
        blendFactor:  0.42,  // ~40% prediction — strong but still exploitable
        aggression:   0.22,
        aiMaxSpeed:   7.5,
        deadzone:     5,
        extremeAim:   true,
        // Hard: looks for angles but not extreme ones — occasional setup shots
        aimAggression: 0.55,  // 0=centre return, 1=maximum angle, extremeAim uses full trig
        trapSetup:     false, // no multi-shot patterns
        fatigueOnset: 10,
        fatigueDepth: 0.45,
    },
    5: {
        label:      'Expert',
        startSpeed: 9,
        maxSpeed:   21,
        rampTau:    7,
        blendFactor:  0.57,
        aggression:   0.26,
        aiMaxSpeed:   8.5,
        deadzone:     4,
        extremeAim:   true,
        // Expert: actively hunts angles and sets up consecutive winning shots
        aimAggression: 0.80,
        trapSetup:     true,  // will aim at player paddle edge to create awkward returns
        fatigueOnset: 14,
        fatigueDepth: 0.35,
    },

    // Extreme: not on the slider, activated by the toggle
    extreme: {
        label:      'Extreme',
        startSpeed: 10,
        maxSpeed:   26,
        rampTau:    5,
        blendFactor:  0.72,
        aggression:   0.50,
        aiMaxSpeed:   10.5,
        deadzone:     1,
        extremeAim:   true,
        // Extreme: maximum angle hunting, no mercy
        aimAggression: 0.97,
        trapSetup:     true,
        fatigueOnset: 20,
        fatigueDepth: 0.35,
    },
};

// Returns the fatigue multiplier (0..1) for a given rally hit count.
// 0 = no fatigue yet, 1 = fully fatigued.
export function getFatigue(cfg, rallyHits) {
    if (!cfg.fatigueOnset || rallyHits === 0) return 0;
    return 1 - Math.exp(-rallyHits / cfg.fatigueOnset);
}

// Apply fatigue to a base parameter value.
// Returns base * (1 - fatigue * depth), clamped to never go below 0.
export function applyFatigue(base, fatigue, depth) {
    return Math.max(0, base * (1 - fatigue * depth));
}

export function getDifficultyLabel(level, isExtreme) {
    if (isExtreme) return 'Extreme';
    return DIFFICULTY[level]?.label ?? 'Medium';
}