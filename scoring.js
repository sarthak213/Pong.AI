// scoring.js — point scoring, deuce rules, game/match win detection

export const MATCH_FORMATS = {
    'one':   { label: 'One-shot',  gamesNeeded: 1 },
    'best3': { label: 'Best of 3', gamesNeeded: 2 },
    'best5': { label: 'Best of 5', gamesNeeded: 3 },
    'best7': { label: 'Best of 7', gamesNeeded: 4 },
};

export const WIN_SCORE = 7;

export function createScoreState() {
    return {
        points: { player: 0, ai: 0 },
        gamesWon: { player: 0, ai: 0 },
        deuceCount: 0,
        deuceStarted: false,   // FIX #6: track whether first deuce has been counted
        gamePointCount: { player: 0, ai: 0 },
        matchPointCount: { player: 0, ai: 0 },
        lastPointState: null,
        matchFormat: 'best3',
        matchEnded: false,
    };
}

export function resetScoreForNewGame(state) {
    return {
        ...state,
        points: { player: 0, ai: 0 },
        deuceCount: 0,
        deuceStarted: false,
        gamePointCount: { player: 0, ai: 0 },
        matchPointCount: { player: 0, ai: 0 },
        lastPointState: null,
    };
}

export function resetScoreForNewMatch(matchFormat) {
    return {
        ...createScoreState(),
        matchFormat: matchFormat ?? 'best3',
    };
}

// Returns: { state, result }
// result: 'point' | 'deuce' | 'gameWon:player' | 'gameWon:ai' | 'matchWon:player' | 'matchWon:ai'
export function handlePointScored(side, state) {
    const target = WIN_SCORE;
    let s = {
        ...state,
        points:    { ...state.points },
        gamesWon:  { ...state.gamesWon },
        gamePointCount:  { ...state.gamePointCount },
        matchPointCount: { ...state.matchPointCount },
    };

    const inDeuceZone = s.points.player >= target - 1 && s.points.ai >= target - 1;

    // FIX #6: count the very first time both reach target-1 (the initial deuce).
    if (inDeuceZone && !s.deuceStarted) {
        s.deuceStarted = true;
        s.deuceCount   = 1;
    }

    if (inDeuceZone) {
        const diff = s.points.player - s.points.ai;
        // Someone had advantage — trailing player scored → revert to deuce
        if (Math.abs(diff) === 1) {
            const hasAdv = diff > 0 ? 'player' : 'ai';
            if (side !== hasAdv) {
                s.points.player = target - 1;
                s.points.ai     = target - 1;
                s.deuceCount   += 1;
                s.lastPointState = null;
                return { state: s, result: 'deuce' };
            }
        }
    }

    // Normal point
    s.points[side] += 1;

    // Check for game win
    const won = checkGameWin(s.points, target);
    if (won) {
        s.gamesWon[won] += 1;
        const gamesNeeded = MATCH_FORMATS[s.matchFormat]?.gamesNeeded ?? 2;
        if (s.gamesWon[won] >= gamesNeeded) {
            s.matchEnded = true;
            return { state: s, result: `matchWon:${won}` };
        }
        return { state: s, result: `gameWon:${won}` };
    }

    // Update game-point / match-point counters
    s = updatePointStateCounters(s, target);

    return { state: s, result: 'point' };
}

function checkGameWin(points, target) {
    const bothInDeuce = points.player >= target - 1 && points.ai >= target - 1;
    if (bothInDeuce) {
        if (points.player - points.ai >= 2) return 'player';
        if (points.ai - points.player >= 2) return 'ai';
        return null;
    }
    if (points.player >= target) return 'player';
    if (points.ai     >= target) return 'ai';
    return null;
}

// FIX #5: evaluate both sides before returning so both counters can update.
function updatePointStateCounters(state, target) {
    const s = {
        ...state,
        gamePointCount:  { ...state.gamePointCount },
        matchPointCount: { ...state.matchPointCount },
    };
    const gamesNeeded = MATCH_FORMATS[s.matchFormat]?.gamesNeeded ?? 2;

    // Suppress counters entirely during deuce zone (both at/above target-1).
    // Pills are suppressed in getPointStatus for the same reason.
    const bothInDeuceZone = s.points.player >= target - 1 && s.points.ai >= target - 1;
    if (bothInDeuceZone) return s;

    let newLastState = s.lastPointState;

    for (const who of ['player', 'ai']) {
        // Simulate scoring the next point and check if it wins the game.
        const nextPoints = { ...s.points, [who]: s.points[who] + 1 };
        const wouldWinGame  = checkGameWin(nextPoints, target) === who;
        const wouldWinMatch = wouldWinGame && (s.gamesWon[who] + 1) >= gamesNeeded;

        if (wouldWinMatch) {
            const key = `${who}Match`;
            if (newLastState !== key) {
                s.matchPointCount[who] += 1;
                newLastState = key;
            }
        } else if (wouldWinGame) {
            const key = `${who}Game`;
            if (newLastState !== key) {
                s.gamePointCount[who] += 1;
                if (!newLastState?.endsWith('Match')) newLastState = key;
            }
        }
    }

    s.lastPointState = newLastState ?? null;
    return s;
}

// Returns display info for each side: null | { type: 'gamePoint'|'matchPoint', count: n }
export function getPointStatus(state) {
    const target = WIN_SCORE;
    const gamesNeeded = MATCH_FORMATS[state.matchFormat]?.gamesNeeded ?? 2;
    const result = { player: null, ai: null };

    const p = state.points.player;
    const a = state.points.ai;
    const bothInDeuceZone = p >= target - 1 && a >= target - 1;

    // Suppress ALL pills during deuce AND during advantage.
    // Equal scores = deuce, unequal in deuce zone = advantage.
    // In both cases the score display (ADV / numeric) is sufficient.
    if (bothInDeuceZone) return result;

    for (const who of ['player', 'ai']) {
        // Simulate scoring the next point and check if it wins the game.
        const nextPoints = { ...state.points, [who]: state.points[who] + 1 };
        const wouldWinGame = checkGameWin(nextPoints, target) === who;
        if (!wouldWinGame) continue;

        const wouldWinMatch = (state.gamesWon[who] + 1) >= gamesNeeded;
        if (wouldWinMatch) {
            result[who] = { type: 'matchPoint', count: state.matchPointCount[who] };
        } else {
            result[who] = { type: 'gamePoint',  count: state.gamePointCount[who] };
        }
    }
    return result;
}

export function getAdvantage(state) {
    const target = WIN_SCORE;
    const p = state.points.player, a = state.points.ai;
    if (p >= target - 1 && a >= target - 1 && p !== a) {
        return p > a ? 'player' : 'ai';
    }
    return null;
}

export function isDeuce(state) {
    const target = WIN_SCORE;
    return (
        state.points.player >= target - 1 &&
        state.points.ai     >= target - 1 &&
        state.points.player === state.points.ai
    );
}