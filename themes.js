// themes.js — all theme definitions
// Each theme controls: picker swatches, canvas bg, paddle style, ball style, net style, trajectory colour

export const THEMES = {
    neon: {
        id: 'neon',
        swatch: ['#00d4e0', '#ff7c2a'],   // [player, AI] colours for theme pickers
        preview: '#090c10',
        name: 'Neon',
        canvas: {
            bg:           '#090c10',
            vignette:     true,
            netColor:     'rgba(255,255,255,0.04)',
            netDash:      [6, 10],
            playerColor:  '#00d4e0',
            aiColor:      '#ff7c2a',
            ballColor:    '#ffffff',
            ballGlow:     true,
            paddleGlow:   true,
            paddleStyle:  'neon',   // neon | solid | retro | minimal
            trajColor0:   'rgba(255,124,42,0.55)',
            trajColor1:   'rgba(255,124,42,0.06)',
        }
    },

    retro: {
        id: 'retro',
        swatch: ['#ffffff', '#aaaaaa'],   // [player, AI] colours for theme pickers
        preview: '#000000',
        name: 'Retro',
        canvas: {
            bg:          '#000000',
            vignette:    false,
            netColor:    'rgba(255,255,255,0.15)',
            netDash:     [8, 6],
            playerColor: '#ffffff',
            aiColor:     '#ffffff',
            ballColor:   '#ffffff',
            ballGlow:    false,
            paddleGlow:  false,
            paddleStyle: 'retro',
            trajColor0:  'rgba(255,255,255,0.4)',
            trajColor1:  'rgba(255,255,255,0.04)',
        }
    },

    synthwave: {
        id: 'synthwave',
        swatch: ['#e040fb', '#00e5ff'],   // [player, AI] colours for theme pickers
        preview: '#0e0718',
        name: 'Synthwave',
        canvas: {
            bg:          '#0e0718',
            vignette:    true,
            vignetteColor: 'rgba(80,0,120,0.4)',
            netColor:    'rgba(224,64,251,0.12)',
            netDash:     [4, 8],
            playerColor: '#e040fb',
            aiColor:     '#00e5ff',
            ballColor:   '#ffffff',
            ballGlow:    true,
            ballGlowColor: 'rgba(255,200,255,0.2)',
            paddleGlow:  true,
            paddleStyle: 'neon',
            // Grid floor effect
            grid:        true,
            gridColor:   'rgba(224,64,251,0.06)',
            trajColor0:  'rgba(0,229,255,0.6)',
            trajColor1:  'rgba(0,229,255,0.04)',
        }
    },

    arctic: {
        id: 'arctic',
        swatch: ['#0088cc', '#e05500'],   // [player, AI] colours for theme pickers
        preview: '#f0f4f8',
        name: 'Arctic',
        canvas: {
            bg:          '#f8fbff',
            bgGrad:      true,
            bgGradTop:   '#e8f4ff',
            bgGradBot:   '#f8fbff',
            vignette:    false,
            netColor:    'rgba(0,100,200,0.1)',
            netDash:     [6, 8],
            playerColor: '#0088cc',
            aiColor:     '#e05500',
            ballColor:   '#1a2535',
            ballGlow:    false,
            paddleGlow:  false,
            paddleStyle: 'minimal',
            trajColor0:  'rgba(224,85,0,0.45)',
            trajColor1:  'rgba(224,85,0,0.04)',
        }
    },
};

export const THEME_ORDER = ['neon', 'retro', 'synthwave', 'arctic'];

// Switch the UI palette (styles.css keys every colour off [data-game-theme])
export function applyThemeCSS(themeId) {
    if (!THEMES[themeId]) return;
    document.documentElement.dataset.gameTheme = themeId;
}

// Theme saved in localStorage, or Neon.
export function getSavedTheme() {
    try {
        const t = localStorage.getItem('pongai-theme');
        if (THEMES[t]) return t;
    } catch {}
    return 'neon';
}

export function saveTheme(themeId) {
    try { localStorage.setItem('pongai-theme', themeId); } catch {}
}
