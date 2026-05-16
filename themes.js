// themes.js — all theme definitions
// Each theme controls: UI CSS vars, canvas bg, paddle style, ball style, net style, trajectory colour

export const THEMES = {
    neon: {
        id: 'neon',
        name: 'Neon',
        // CSS custom props applied to :root
        css: {
            '--bg':           '#090c10',
            '--bg2':          '#0d1117',
            '--surface':      'rgba(255,255,255,0.03)',
            '--surface-hover':'rgba(255,255,255,0.055)',
            '--border':       'rgba(255,255,255,0.06)',
            '--border-mid':   'rgba(255,255,255,0.10)',
            '--text':         '#e2eaf4',
            '--text-2':       '#8899aa',
            '--text-3':       '#4d6070',
            '--cyan':         '#00d4e0',
            '--cyan-dim':     'rgba(0,212,224,0.12)',
            '--cyan-glow':    'rgba(0,212,224,0.25)',
            '--orange':       '#ff7c2a',
            '--orange-dim':   'rgba(255,124,42,0.12)',
            '--orange-glow':  'rgba(255,124,42,0.25)',
            '--red':          '#ff4560',
            '--gold':         '#ffc947',
        },
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
        name: 'Retro',
        css: {
            '--bg':           '#0a0a0a',
            '--bg2':          '#111111',
            '--surface':      'rgba(255,255,255,0.04)',
            '--surface-hover':'rgba(255,255,255,0.07)',
            '--border':       'rgba(255,255,255,0.08)',
            '--border-mid':   'rgba(255,255,255,0.14)',
            '--text':         '#e8e8e8',
            '--text-2':       '#888888',
            '--text-3':       '#444444',
            '--cyan':         '#ffffff',
            '--cyan-dim':     'rgba(255,255,255,0.1)',
            '--cyan-glow':    'rgba(255,255,255,0.2)',
            '--orange':       '#aaaaaa',
            '--orange-dim':   'rgba(170,170,170,0.1)',
            '--orange-glow':  'rgba(170,170,170,0.2)',
            '--red':          '#ff4560',
            '--gold':         '#ffffff',
        },
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
        name: 'Synthwave',
        css: {
            '--bg':           '#0e0718',
            '--bg2':          '#130a22',
            '--surface':      'rgba(180,100,255,0.05)',
            '--surface-hover':'rgba(180,100,255,0.09)',
            '--border':       'rgba(180,100,255,0.1)',
            '--border-mid':   'rgba(180,100,255,0.18)',
            '--text':         '#f0e0ff',
            '--text-2':       '#9977bb',
            '--text-3':       '#553366',
            '--cyan':         '#e040fb',
            '--cyan-dim':     'rgba(224,64,251,0.12)',
            '--cyan-glow':    'rgba(224,64,251,0.28)',
            '--orange':       '#00e5ff',
            '--orange-dim':   'rgba(0,229,255,0.12)',
            '--orange-glow':  'rgba(0,229,255,0.28)',
            '--red':          '#ff4560',
            '--gold':         '#ffec40',
        },
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
        name: 'Arctic',
        css: {
            '--bg':           '#f0f4f8',
            '--bg2':          '#e4ecf4',
            '--surface':      'rgba(0,0,0,0.04)',
            '--surface-hover':'rgba(0,0,0,0.07)',
            '--border':       'rgba(0,0,0,0.08)',
            '--border-mid':   'rgba(0,0,0,0.14)',
            '--text':         '#1a2535',
            '--text-2':       '#5a7090',
            '--text-3':       '#9ab0c8',
            '--cyan':         '#0088cc',
            '--cyan-dim':     'rgba(0,136,204,0.1)',
            '--cyan-glow':    'rgba(0,136,204,0.2)',
            '--orange':       '#e05500',
            '--orange-dim':   'rgba(224,85,0,0.1)',
            '--orange-glow':  'rgba(224,85,0,0.2)',
            '--red':          '#cc2244',
            '--gold':         '#cc7700',
        },
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

// Apply a theme's CSS variables to :root
export function applyThemeCSS(themeId) {
    const theme = THEMES[themeId];
    if (!theme) return;
    const root = document.documentElement;
    for (const [key, val] of Object.entries(theme.css)) {
        root.style.setProperty(key, val);
    }
    // Mark body with theme class for any per-theme overrides
    document.body.dataset.theme = themeId;
}