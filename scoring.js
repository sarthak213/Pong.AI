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
        gameWinOrder: [],  // chronological list of 'player'|'ai' per game won
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
        // Keep gameWinOrder and gamesWon intact — they span the whole match
    };
}

export function resetScoreForNewMatch(matchFormat) {
    return {
        ...createScoreState(),
        matchFormat: matchFormat ?? 'best3',
        gameWinOrder: [],
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
        s.gameWinOrder = [...(s.gameWinOrder ?? []), won]; // record in order
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
// count semantics (v4.0):
//   gamePoint  — number of consecutive points needed to win game at current score gap
//                e.g. 6-2 → player has 4 game points (needs 1 win but is 4 ahead, so show 4? No —
//                actually: count = target - opponent score when leader is at target-1)
//                Simpler: count = how many game points the leader holds = their score - (target-2)
//                when score >= target-1. If exactly one, just show "Game Point".
//   matchPoint — gamesNeeded - gamesWon[who] = games still needed to win.
//                If exactly one, just show "Match Point".
export function getPointStatus(state) {
    const target = WIN_SCORE;
    const gamesNeeded = MATCH_FORMATS[state.matchFormat]?.gamesNeeded ?? 2;
    const result = { player: null, ai: null };

    const p = state.points.player;
    const a = state.points.ai;
    const bothInDeuceZone = p >= target - 1 && a >= target - 1;

    // Only suppress during exact deuce (equal scores).
    // During advantage (unequal scores in deuce zone) the banner should still show
    // so the player knows who is on match/game point.
    if (bothInDeuceZone && p === a) return result;

    for (const who of ['player', 'ai']) {
        const other = who === 'player' ? 'ai' : 'player';

        // Simulate next point
        const nextPoints = { ...state.points, [who]: state.points[who] + 1 };
        const wouldWinGame = checkGameWin(nextPoints, target) === who;
        if (!wouldWinGame) continue;

        const wouldWinMatch = (state.gamesWon[who] + 1) >= gamesNeeded;

        if (wouldWinMatch) {
            // Match point count = score difference (how dominant the lead is)
            const pointDiff = Math.max(1, state.points[who] - state.points[other]);
            result[who] = { type: 'matchPoint', count: pointDiff };
        } else {
            // Game point count = score difference
            const pointDiff = Math.max(1, state.points[who] - state.points[other]);
            result[who] = { type: 'gamePoint', count: pointDiff };
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