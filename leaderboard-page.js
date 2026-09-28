// leaderboard-page.js — renders leaderboard.html

import { fetchPlayers, isLeaderboardConfigured, SCORE_FORMULA_TEXT } from './leaderboard.js';
import { initPage, mountResults, playerRowsHtml, stateHtml, OFFLINE_HTML, refreshIcons, icon } from './ui.js';

const content  = document.getElementById('lbContent');
const viewBtns = document.querySelectorAll('[data-view]');
const diffBtns = document.querySelectorAll('[data-diff]');
document.getElementById('formulaNote').textContent = SCORE_FORMULA_TEXT;

let view = 'top';
let diff = 'all';
let playersReq = 0;

const loadResults = mountResults(content, () => ({ view, difficulty: diff, limit: 50 }), { immediate: false });

async function loadPlayers() {
    if (!isLeaderboardConfigured()) { content.innerHTML = OFFLINE_HTML(); return refreshIcons(); }
    const id = ++playersReq;
    content.innerHTML = stateHtml('loader-circle', 'Loading players…');
    content.querySelector('i')?.classList.add('spin');
    refreshIcons();
    try {
        const rows = await fetchPlayers({ difficulty: diff });
        if (id !== playersReq) return;
        content.innerHTML = playerRowsHtml(Array.isArray(rows) ? rows : []);
    } catch (err) {
        if (id !== playersReq) return;
        console.error('Players load failed', err);
        content.innerHTML = stateHtml('triangle-alert', 'Sorry, player stats could not be loaded.',
            `<button class="btn btn-secondary btn-sm" data-retry>${icon('refresh-cw')} Retry</button>`);
        content.querySelector('[data-retry]')?.addEventListener('click', loadPlayers);
    }
    refreshIcons();
}

function load() {
    viewBtns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
    diffBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.diff === diff)));
    playersReq++;   // drop any in-flight players request
    if (view === 'players') loadPlayers();
    else loadResults();
}

viewBtns.forEach(b => b.addEventListener('click', () => { view = b.dataset.view; load(); }));
diffBtns.forEach(b => b.addEventListener('click', () => { diff = b.dataset.diff; load(); }));

initPage();
load();
