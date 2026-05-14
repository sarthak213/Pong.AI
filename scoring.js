// scoring.js — point scoring, deuce rules, game/match win detection

// Match format: maps selector value -> games needed to win match
export const MATCH_FORMATS = {
    'one':   { label: 'One-shot',   gamesNeeded: 1 },
    'best3': { label: 'Best of 3',  gamesNeeded: 2 },
    'best5': { label: 'Best of 5',  gamesNeeded: 3 },
    'best7': { label: 'Best of 7',  gamesNeeded: 4 },
};

export const WIN_SCORE = 7; // points per game, fixed

export function createScoreState() {
    return {
        points: { player: 0, ai: 0 },
        gamesWon: { player: 0, ai: 0 },
        deuceCount: 0,
        // Cumulative counts per game (tennis-style)
        gamePointCount: { player: 0, ai: 0 },
        matchPointCount: { player: 0, ai: 0 },
        // Tracks last point state to avoid double-counting
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
// result: null | 'point' | 'gameWon:player' | 'gameWon:ai' | 'matchWon:player' | 'matchWon:ai'
export function handlePointScored(side, state) {
    const target = WIN_SCORE;
    const other = side === 'player' ? 'ai' : 'player';
    let s = { ...state, points: { ...state.points }, gamesWon: { ...state.gamesWon } };

    // Deuce zone: both >= target-1
    if (s.points.player >= target - 1 && s.points.ai >= target - 1) {
        const diff = s.points.player - s.points.ai;
        // Someone had advantage — check if trailing player scored (reverts to deuce)
        if (Math.abs(diff) === 1) {
            const hasAdv = diff > 0 ? 'player' : 'ai';
            if (side !== hasAdv) {
                // Advantage lost — back to deuce
                s.points.player = target - 1;
                s.points.ai = target - 1;
                s.deuceCount += 1;
                s.lastPointState = null;
                return { state: s, result: 'deuce' };
            }
        }
    }

    // Normal point
    s.points[side] += 1;

    // Check for game win
    const { won, byDeuce } = checkGameWin(s.points, target);
    if (won) {
        s.gamesWon[side] += 1;
        const gamesNeeded = MATCH_FORMATS[s.matchFormat]?.gamesNeeded ?? 2;
        if (s.gamesWon[side] >= gamesNeeded) {
            s.matchEnded = true;
            return { state: s, result: `matchWon:${side}` };
        }
        return { state: s, result: `gameWon:${side}` };
    }

    // Update point-state counters (game point / match point)
    s = updatePointStateCounters(s, target);

    return { state: s, result: 'point' };
}

function checkGameWin(points, target) {
    const bothInDeuce = points.player >= target - 1 && points.ai >= target - 1;
    if (bothInDeuce) {
        if (points.player - points.ai >= 2) return { won: 'player', byDeuce: true };
        if (points.ai - points.player >= 2) return { won: 'ai', byDeuce: true };
        return { won: null };
    }
    if (points.player >= target) return { won: 'player', byDeuce: false };
    if (points.ai >= target) return { won: 'ai', byDeuce: false };
    return { won: null };
}

function updatePointStateCounters(state, target) {
    const s = { ...state, gamePointCount: { ...state.gamePointCount }, matchPointCount: { ...state.matchPointCount } };
    const gamesNeeded = MATCH_FORMATS[s.matchFormat]?.gamesNeeded ?? 2;

    for (const who of ['player', 'ai']) {
        const other = who === 'player' ? 'ai' : 'player';
        const isMatchPoint = (s.gamesWon[who] + 1) >= gamesNeeded;
        const isGamePoint = (s.points[who] + 1) >= target;

        if (isMatchPoint && isGamePoint) {
            const key = `${who}Match`;
            if (s.lastPointState !== key) { s.matchPointCount[who] += 1; s.lastPointState = key; }
            return s;
        }
        if (isGamePoint) {
            const key = `${who}Game`;
            if (s.lastPointState !== key) { s.gamePointCount[who] += 1; s.lastPointState = key; }
            return s;
        }
    }

    // Neither in point state — clear if previously set
    if (s.lastPointState) s.lastPointState = null;
    return s;
}

// Returns display info for each side: null | { type: 'gamePoint'|'matchPoint', count: n }
export function getPointStatus(state) {
    const target = WIN_SCORE;
    const gamesNeeded = MATCH_FORMATS[state.matchFormat]?.gamesNeeded ?? 2;
    const result = { player: null, ai: null };

    // Don't show during deuce (equal scores in deuce zone)
    const bothInDeuceZone = state.points.player >= target - 1 && state.points.ai >= target - 1;
    if (bothInDeuceZone && state.points.player === state.points.ai) return result;

    for (const who of ['player', 'ai']) {
        const isMatchPoint = (state.gamesWon[who] + 1) >= gamesNeeded && (state.points[who] + 1) >= target;
        const isGamePoint = (state.points[who] + 1) >= target;
        if (isMatchPoint) {
            result[who] = { type: 'matchPoint', count: state.matchPointCount[who] };
        } else if (isGamePoint) {
            result[who] = { type: 'gamePoint', count: state.gamePointCount[who] };
        }
    }
    return result;
}

// Returns null or 'player' | 'ai' indicating who has ADV (and deuce is active)
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
    return state.points.player >= target - 1 && state.points.ai >= target - 1 && state.points.player === state.points.ai;
}