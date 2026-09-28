// ui.js — shared UI helpers: icons, site header theme picker, leaderboard rows.
// Icons come from Lucide (loaded as a UMD script in each page's <head>).

import { THEMES, THEME_ORDER, applyThemeCSS, getSavedTheme, saveTheme } from './themes.js';
import { fetchResults, isLeaderboardConfigured, formatDuration, DIFFICULTY_INFO } from './leaderboard.js';
import { MATCH_FORMATS } from './scoring.js';

export const icon = (name, cls = '') => `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ''}></i>`;

export function refreshIcons() {
    try { window.lucide?.createIcons(); } catch (err) { console.error('Icon render failed', err); }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ─── Theme pickers ─────────────────────────────────────────────────────────────
// Every element with [data-theme-picker="swatch"|"tile"] is rendered and kept in sync.
const themeListeners = [];
let currentTheme = getSavedTheme();

export function getTheme() { return currentTheme; }

export function setTheme(themeId) {
    if (!THEMES[themeId]) return;
    currentTheme = themeId;
    applyThemeCSS(themeId);
    saveTheme(themeId);
    document.querySelectorAll('[data-theme-id]').forEach(b =>
        b.setAttribute('aria-checked', String(b.dataset.themeId === themeId)));
    themeListeners.forEach(fn => fn(themeId));
}

export function onThemeChange(fn) { themeListeners.push(fn); }

function renderThemePicker(el) {
    const kind = el.dataset.themePicker;
    el.innerHTML = THEME_ORDER.map(id => {
        const t = THEMES[id];
        const [a, b] = t.swatch;
        if (kind === 'tile') {
            return `<button class="theme-tile" role="radio" data-theme-id="${id}" aria-checked="false">
                <span class="theme-tile-art" style="background:${t.preview}">
                    <i style="background:${a}"></i><i style="background:${b}"></i><b style="background:${t.canvas.ballColor}"></b>
                </span>
                <span class="theme-tile-name">${t.name}</span>
            </button>`;
        }
        return `<button class="swatch-btn" role="radio" data-theme-id="${id}" aria-checked="false"
                    title="${t.name}" aria-label="${t.name} theme" style="--a:${a};--b:${b}"></button>`;
    }).join('');
    if (kind === 'swatch') el.insertAdjacentHTML('afterbegin', icon('palette'));
    el.querySelectorAll('[data-theme-id]').forEach(b =>
        b.addEventListener('click', () => setTheme(b.dataset.themeId)));
}

// Call once per page after the DOM is ready.
export function initPage() {
    applyThemeCSS(currentTheme);
    document.querySelectorAll('[data-theme-picker]').forEach(renderThemePicker);
    setTheme(currentTheme);
    refreshIcons();
}

// ─── Leaderboard rows ──────────────────────────────────────────────────────────
export function stateHtml(iconName, text, extra = '') {
    return `<div class="lb-state">${icon(iconName)}<p>${text}</p>${extra}</div>`;
}

// view: 'top' | 'recent'. highlightId marks the player's just-saved row.
export function resultRowsHtml(rows, { view = 'top', highlightId = null, compact = false } = {}) {
    if (!rows.length) return stateHtml('trophy', 'No matches recorded yet. Be the first on the board!');
    return `<ol class="lb-list">${rows.map((r, i) => {
        const rank = i + 1;
        const cls  = r.id === highlightId ? ' highlight' : (view === 'top' && rank <= 3 ? ' podium' : '');
        const rankHtml = view === 'top' && rank === 1 ? icon('crown')
                       : view === 'top' && rank <= 3  ? icon('medal')
                       : `#${rank}`;
        const fmt = MATCH_FORMATS[r.match_format]?.label ?? r.match_format;
        const meta = compact ? '' : `
            <div class="lb-meta">
                <span class="tag tag-diff d-${esc(r.difficulty)}">${esc(DIFFICULTY_INFO[r.difficulty]?.label ?? r.difficulty)}</span>
                <span>${esc(fmt)}</span>
                <span>Games ${r.games_won_player}–${r.games_won_ai}</span>
                <span class="hide-sm">Rally ${r.longest_rally}</span>
                <span class="hide-sm">${formatDuration(r.duration_sec)}</span>
                ${view === 'recent' ? `<span class="hide-sm">${new Date(r.created_at).toLocaleDateString()}</span>` : ''}
            </div>`;
        return `
        <li class="lb-row${cls}" style="--i:${Math.min(i, 14)}">
            <span class="lb-rank">${rankHtml}</span>
            <div class="lb-main">
                <div class="lb-name-line">
                    <span class="lb-name">${esc(r.player_name)}</span>
                    <span class="tag ${r.won ? 'tag-won' : 'tag-lost'}">${r.won ? 'Won' : 'Lost'}</span>
                </div>${meta}
            </div>
            <div class="lb-score">
                <div class="lb-score-val">${r.score}</div>
                <div class="lb-score-sub">${r.final_points_player}–${r.final_points_ai}</div>
            </div>
        </li>`;
    }).join('')}</ol>`;
}

export function playerRowsHtml(rows) {
    if (!rows.length) return stateHtml('users', 'No players yet.');
    return `<ol class="lb-list">${rows.map((p, i) => {
        const rate = p.matches ? Math.round((p.wins / p.matches) * 100) : 0;
        return `
        <li class="lb-row" style="--i:${Math.min(i, 14)}">
            <span class="lb-rank">#${i + 1}</span>
            <div class="lb-main">
                <div class="lb-name">${esc(p.player_name)}</div>
                <div class="lb-meta">
                    <span>${p.wins}W / ${p.matches - p.wins}L</span>
                    <span class="winbar"><span style="width:${rate}%"></span></span>
                    <span>${rate}%</span>
                </div>
            </div>
            <div class="lb-score">
                <div class="lb-score-val">${p.best_score}</div>
                <div class="lb-score-sub">best</div>
            </div>
        </li>`;
    }).join('')}</ol>`;
}

export const OFFLINE_HTML = () => stateHtml('cloud-off', 'The online leaderboard isn’t connected yet.');

// Loads a results list into el. Returns a function that reloads it.
export function mountResults(el, opts, { immediate = true } = {}) {
    let reqId = 0;
    const load = async () => {
        if (!isLeaderboardConfigured()) { el.innerHTML = OFFLINE_HTML(); refreshIcons(); return; }
        const id = ++reqId;
        el.innerHTML = stateHtml('loader-circle', 'Loading scores…');
        el.querySelector('i')?.classList.add('spin');
        refreshIcons();
        try {
            const rows = await fetchResults(opts());
            if (id !== reqId) return;
            el.innerHTML = resultRowsHtml(Array.isArray(rows) ? rows : [], opts());
        } catch (err) {
            if (id !== reqId) return;
            console.error('Leaderboard load failed', err);
            el.innerHTML = stateHtml('triangle-alert', 'Sorry, the leaderboard could not be loaded.',
                `<button class="btn btn-secondary btn-sm" data-retry>${icon('refresh-cw')} Retry</button>`);
            el.querySelector('[data-retry]')?.addEventListener('click', load);
        }
        refreshIcons();
    };
    if (immediate) load();
    return load;
}
