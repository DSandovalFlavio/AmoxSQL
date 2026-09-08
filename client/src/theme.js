/**
 * Single source of truth for which app themes are "light" mode.
 *
 * Historically this list was duplicated in 6 places (App.jsx, SqlEditor ×2,
 * MarkdownEditor, DeckEditor, MarkdownPreview). Import from here instead.
 *
 * The app applies TWO body classes for theming:
 *   - a MODE class (`mode-light` / `mode-dark`) — carries everything that only
 *     depends on light-vs-dark (scrollbars, code-editor chrome, feedback ramps…)
 *   - a THEME class (`theme-mist`, `theme-nord`, …; the default dark
 *     "obsidian" theme has none) — carries per-theme surfaces/text/borders.
 */
export const LIGHT_THEMES = ['mist', 'amoxlight', 'sterlinglight'];

export const isLightTheme = (theme) => LIGHT_THEMES.includes(theme);

/**
 * Temas retirados → su sustituto.
 *
 * Quien ya tuviera uno de estos guardado se quedaria sin clase de tema y con la
 * app en el oscuro por defecto sin haber tocado nada. Cada uno apunta al que
 * mas se le parece de los que quedan: los dos claros genericos a Amox Light (el
 * claro de la casa) y Sterling Dark a Sterling Deep, que es la misma paleta
 * sobre superficies mas hondas.
 *
 * La migracion se aplica AL LEER, no al escribir: asi tambien arregla un perfil
 * copiado de otra maquina o de una version anterior.
 */
const RETIRADOS = {
    light: 'amoxlight',
    ivory: 'amoxlight',
    sterlingdark: 'sterlingdeep',
};

export const migrateTheme = (theme) => RETIRADOS[theme] || theme || 'dark';

/** Body class that defines a theme's own surfaces. Default dark = no class. */
export const themeClassFor = (theme) => {
    if (theme === 'dark') return null; // obsidian default
    return `theme-${theme}`;
};

/** Mode class applied alongside the theme class. */
export const modeClassFor = (theme) => (isLightTheme(theme) ? 'mode-light' : 'mode-dark');

/**
 * Aplica al <body> el tema, el modo y el acento que haya guardados.
 *
 * App.jsx ya hace esto con efectos reactivos para la ventana principal, pero
 * SALE ANTES de llegar a ellos cuando la ventana es la emergente de resultados
 * (`return <PopoutResultsPage />` en la primera línea del componente). Sin
 * clases en el body, los tokens caen a los valores por defecto de :root: tema
 * oscuro y acento cian, saliera de donde saliera la ventana.
 *
 * Es de un solo tiro y sin estado: la ventana emergente no cambia de tema por
 * su cuenta, solo tiene que nacer con el que ya elegiste.
 */
export const applyStoredTheme = () => {
    try {
        const theme = migrateTheme(localStorage.getItem('amoxsql-theme'));
        const accent = localStorage.getItem('amoxsql-accent') || 'cyan';
        const body = document.body;

        const themeClass = themeClassFor(theme);
        if (themeClass) body.classList.add(themeClass);
        body.classList.add(modeClassFor(theme));

        // cian es el acento por defecto y no lleva clase
        if (accent !== 'cyan') body.classList.add(`accent-${accent}`);

        const l = parseFloat(localStorage.getItem('amoxsql-accent-l'));
        if (Number.isFinite(l)) body.style.setProperty('--acc-l', String(l));
    } catch { /* sin localStorage se queda con los valores por defecto */ }
};
