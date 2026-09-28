// leaderboard.js — Supabase REST client for the online leaderboard.
// No SDK: talks to PostgREST directly with fetch. All functions throw on failure.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const DIFFICULTY_INFO = {
    easy:    { label: 'Easy',    multiplier: 1 },
    medium:  { label: 'Medium',  multiplier: 1.5 },
    hard:    { label: 'Hard',    multiplier: 2 },
    extreme: { label: 'Extreme', multiplier: 3 },
};

// Keep in sync with compute_score() in supabase/schema.sql
export const SCORE_FORMULA_TEXT =
    'Score = (points won × 10 + 100 per game won + 50 for winning the match) × difficulty multiplier ' +
    '(Easy ×1, Medium ×1.5, Hard ×2, Extreme ×3).';

// Mirrors compute_score() in supabase/schema.sql — used to show the score before (or without) saving.
export function computeScore({ difficulty, totalPointsPlayer, gamesWonPlayer, won }) {
    const mult = DIFFICULTY_INFO[difficulty]?.multiplier ?? 1;
    return Math.round((totalPointsPlayer * 10 + gamesWonPlayer * 100 + (won ? 50 : 0)) * mult);
}

export function isLeaderboardConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function headers() {
    const h = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    // Legacy anon keys are JWTs and also go in Authorization; new publishable keys must not.
    if (SUPABASE_ANON_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    return h;
}

async function request(path, options = {}) {
    if (!isLeaderboardConfigured()) throw new Error('Leaderboard is not configured');
    const res  = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, { ...options, headers: headers() });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message ?? `Request failed (${res.status})`);
    return data;
}

// result: { playerName, difficulty, theme, matchFormat, won, gamesWonPlayer, gamesWonAi,
//           finalPointsPlayer, finalPointsAi, totalPointsPlayer, totalPointsAi,
//           deuceCount, longestRally, durationSec }
// Returns { id, score, rank_difficulty, rank_overall }
export function submitResult(result) {
    return request('rpc/submit_game_result', {
        method: 'POST',
        body: JSON.stringify({
            p: {
                player_name:         result.playerName,
                difficulty:          result.difficulty,
                theme:               result.theme,
                match_format:        result.matchFormat,
                won:                 result.won,
                games_won_player:    result.gamesWonPlayer,
                games_won_ai:        result.gamesWonAi,
                final_points_player: result.finalPointsPlayer,
                final_points_ai:     result.finalPointsAi,
                total_points_player: result.totalPointsPlayer,
                total_points_ai:     result.totalPointsAi,
                deuce_count:         result.deuceCount,
                longest_rally:       result.longestRally,
                duration_sec:        result.durationSec,
            },
        }),
    });
}

// view: 'top' | 'recent'; difficulty: 'all' | 'easy' | 'medium' | 'hard' | 'extreme'
export function fetchResults({ view = 'top', difficulty = 'all', limit = 50 } = {}) {
    const params = new URLSearchParams({ select: '*', limit: String(limit) });
    params.set('order', view === 'recent'
        ? 'created_at.desc'
        : 'score.desc,duration_sec.asc,created_at.asc');
    if (DIFFICULTY_INFO[difficulty]) params.set('difficulty', `eq.${difficulty}`);
    return request(`game_results?${params}`);
}

export function fetchPlayers({ difficulty = 'all', limit = 50 } = {}) {
    return request('rpc/leaderboard_players', {
        method: 'POST',
        body: JSON.stringify({
            p_difficulty: DIFFICULTY_INFO[difficulty] ? difficulty : null,
            p_limit: limit,
        }),
    });
}

export function formatDuration(sec) {
    const s = Math.max(0, Math.round(sec ?? 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
