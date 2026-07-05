/**
 * Single source of truth for which app themes are "light" mode.
 *
 * Historically this list was duplicated in 6 places (App.jsx, SqlEditor ×2,
 * MarkdownEditor, DeckEditor, MarkdownPreview). Import from here instead.
 *
 * The app applies TWO body classes for theming:
 *   - a MODE class (`mode-light` / `mode-dark`) — carries everything that only
 *     depends on light-vs-dark (scrollbars, code-editor chrome, feedback ramps…)
 *   - a THEME class (`light-theme`, `theme-ivory`, `theme-nord`, …; the default
 *     dark "obsidian" theme has none) — carries per-theme surfaces/text/borders.
 */
export const LIGHT_THEMES = ['light', 'ivory', 'mist', 'snow'];

export const isLightTheme = (theme) => LIGHT_THEMES.includes(theme);

/** Body class that defines a theme's own surfaces. Default dark = no class. */
export const themeClassFor = (theme) => {
    if (theme === 'light') return 'light-theme';
    if (theme === 'dark') return null; // obsidian default
    return `theme-${theme}`;
};

/** Mode class applied alongside the theme class. */
export const modeClassFor = (theme) => (isLightTheme(theme) ? 'mode-light' : 'mode-dark');
