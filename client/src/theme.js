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
    // Onyx se llamaba «true black» y no lo era: 0,003 de croma y a 0,009 de
    // Obsidian en claridad, o sea un gris a medio camino entre dos temas que ya
    // hacen mejor su trabajo. Deep Dark ocupa ese sitio de verdad —croma 0— asi
    // que quien tuviera Onyx va ahi.
    onyx: 'deepdark',
    // Ayu se iba al tema mas parecido por SUPERFICIE, que es lo que se ve: su
    // fondo era azul tinta (#0d1017, tono 267°) y Amox Dark es el azul vecino
    // (#0f141a, 253°). Ember ocupa su hueco de claridad y tambien es frio, pero
    // su gracia es la sintaxis calida: quien eligio Ayu eligio un fondo, asi que
    // va al fondo mas parecido y ya decidira si quiere el otro.
    ayu: 'amoxdark',
};

/**
 * Sin nada guardado (una instalación nueva) el tema es Amox Dark, el de la casa
 * (6.0, M4.3; auditoría D1). Quien ya eligió uno —incluido Obsidian, `dark`— lo
 * conserva: sólo cambia el valor por defecto.
 */
export const TEMA_POR_DEFECTO = 'amoxdark';
export const migrateTheme = (theme) => RETIRADOS[theme] || theme || TEMA_POR_DEFECTO;

/**
 * Los acentos de antes de la 6.0 (M9) eran siete azules casi iguales; ahora los
 * ocho «Vibrant» recorren el círculo cromático. Un id viejo guardado se traduce
 * al más cercano: los turquesas (amox-2…5) a cian, los azules a azul, el índigo
 * a violeta. Sin traducirlo, su clase ya no existe y el acento caería al cian
 * sin que el selector marcase ninguno.
 */
const ACENTOS_RETIRADOS = {
    'amox-2': 'cyan', 'amox-3': 'cyan', 'amox-4': 'cyan', 'amox-5': 'cyan',
    'amox-6': 'blue', 'amox-7': 'blue', 'amox-8': 'blue', 'amox-9': 'blue', 'amox-10': 'blue',
    islands: 'blue', linear: 'violet',
    // Auditoría de color (2026-11): los sobrios dejaron de repetir el tono de
    // un vivo. Cada uno va al que ocupa su sitio ahora.
    rose: 'clay', lavender: 'mauve', amber: 'sand', copper: 'sand',
};

/**
 * «Theme»: el acento que trae el tema. Es el único sin clase `accent-*`, así que
 * las reglas `.theme-X:not([class*="accent-"])` le ponen el suyo a cada tema.
 * Hasta la auditoría de color ese papel lo hacía `cyan`, y por eso elegir cian
 * en Nord o en Ember daba el acento de Nord o de Ember.
 */
export const ACENTO_DEL_TEMA = 'tema';
export const migrateAccent = (accent) => ACENTOS_RETIRADOS[accent] || accent || ACENTO_DEL_TEMA;

/**
 * El acento guardado de la app.
 *
 * Un `cyan` guardado antes de la auditoría de color no es una elección: la app
 * lo escribía siempre, y significaba «sin clase», o sea el acento del tema. Se
 * lee una vez como `tema`, y desde que se guarda con la marca `amoxsql-accent-v2`
 * un `cyan` ya es el cian. Sin esto, quien nunca eligió acento se quedaría
 * clavado en cian en los temas que traen el suyo.
 */
const MARCA_ACENTO = 'amoxsql-accent-v2';
export const acentoGuardado = () => {
    try {
        const v = localStorage.getItem('amoxsql-accent');
        if (v === 'cyan' && !localStorage.getItem(MARCA_ACENTO)) return ACENTO_DEL_TEMA;
        return migrateAccent(v);
    } catch {
        return ACENTO_DEL_TEMA;
    }
};
export const guardarAcento = (accent) => {
    try {
        localStorage.setItem('amoxsql-accent', accent);
        localStorage.setItem(MARCA_ACENTO, '1');
    } catch { /* sin localStorage no se recuerda */ }
};

/** Body class that defines a theme's own surfaces (Obsidian's are :root's). */
export const themeClassFor = (theme) => {
    // Obsidian se guarda como `dark` y sus superficies son las de :root; la clase
    // solo existe para que pueda traer su propio acento.
    if (theme === 'dark') return 'theme-obsidian';
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
        const accent = acentoGuardado();
        const body = document.body;

        const themeClass = themeClassFor(theme);
        if (themeClass) body.classList.add(themeClass);
        body.classList.add(modeClassFor(theme));

        // el acento del tema no lleva clase
        if (accent !== ACENTO_DEL_TEMA) body.classList.add(`accent-${accent}`);

        const l = parseFloat(localStorage.getItem('amoxsql-accent-l'));
        if (Number.isFinite(l)) body.style.setProperty('--acc-l', String(l));
    } catch { /* sin localStorage se queda con los valores por defecto */ }
};
