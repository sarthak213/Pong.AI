// difficulty.js — three difficulty levels + Extreme mode.
//
// Speed model: asymptotic ramp
//   speed(t) = maxSpeed - (maxSpeed - startSpeed) * e^(-t / rampTau)
//
// AI model:
//   blendFactor    — 0=tracks live ball Y, 1=fully predicted contact Y
//   aggression     — paddle snap speed toward target per frame
//   aiMaxSpeed     — paddle speed cap px/frame at 60fps (scaled by gameplayScale)
//   deadzone       — pixels of delta ignored to prevent jitter
//   extremeAim     — all levels use angle-hunting; scaled by aimAggression
//   aimAggression  — 0=safe centre return, 1=maximum corner hunting
//   trapSetup      — if true, AI targets player paddle edge to force awkward returns
//
// Fatigue model:
//   fatigue(n) = 1 - e^(-n / fatigueOnset)   n = rally hit count
//   Effective param = base * (1 - fatigue * fatigueDepth)
//   All three levels have fatigue — Easy fatigues fastest and deepest.

export const DIFFICULTY = {
    1: {
        label:        'Easy',
        startSpeed:   5,
        maxSpeed:     10,
        rampTau:      14,

        blendFactor:  0.09,   // mostly tracks live ball — low prediction
        aggression:   0.07,
        aiMaxSpeed:   3.5,
        deadzone:     10,
        extremeAim:   true,
        aimAggression: 0.25,  // gentle angles — mostly safe returns
        trapSetup:    false,

        fatigueOnset: 8,      // tires quickly — long rallies heavily punish Easy AI
        fatigueDepth: 0.55,
    },
    2: {
        label:        'Medium',
        startSpeed:   7,
        maxSpeed:     15,
        rampTau:      11,

        blendFactor:  0.37,   // ~40% prediction — reads the ball but not perfectly
        aggression:   0.15,
        aiMaxSpeed:   6.5,
        deadzone:     7,
        extremeAim:   true,
        aimAggression: 0.55,  // hunts moderate angles, not extreme corners
        trapSetup:    false,

        fatigueOnset: 12,
        fatigueDepth: 0.45,
    },
    3: {
        label:        'Hard',
        startSpeed:   9,
        maxSpeed:     20,
        rampTau:      7,

        blendFactor:  0.50,   // highly predictive
        aggression:   0.28,
        aiMaxSpeed:   9.5,
        deadzone:     4,
        extremeAim:   true,
        aimAggression: 0.72,  // actively hunts corners and sets up patterns
        trapSetup:    true,

        fatigueOnset: 15,     // stays sharp deep into a rally
        fatigueDepth: 0.40,
    },

    // Extreme: not on the slider, activated by the toggle
    extreme: {
        label:        'Extreme',
        startSpeed:   10,
        maxSpeed:     26,
        rampTau:      5,

        blendFactor:  0.75,
        aggression:   0.55,
        aiMaxSpeed:   12,
        deadzone:     1,
        extremeAim:   true,
        aimAggression: 0.97,
        trapSetup:    true,

        fatigueOnset: 20,
        fatigueDepth: 0.35,
    },
};

export function getFatigue(cfg, rallyHits) {
    if (!cfg.fatigueOnset || rallyHits === 0) return 0;
    return 1 - Math.exp(-rallyHits / cfg.fatigueOnset);
}

export function applyFatigue(base, fatigue, depth) {
    return Math.max(0, base * (1 - fatigue * depth));
}

export function getDifficultyLabel(level, isExtreme) {
    if (isExtreme) return 'Extreme';
    return DIFFICULTY[level]?.label ?? DIFFICULTY[2].label;
}