/**
 * deckRegions — qué huecos tiene cada disposición, cómo se llaman y cómo se
 * leen y se escriben.
 *
 * Hasta ahora esta información existía, pero **repartida y en forma de JSX**:
 * `SlidePreview` la usaba para pintar y `SlideDesigner` la volvía a construir
 * para editar, cada uno a su manera. Dos verdades sobre la misma cosa que no
 * tenían por qué coincidir, y que había que leer enteras para contestar algo
 * tan simple como «¿cuántos sitios donde escribir tiene una lámina de
 * hallazgo?». La respuesta la da ahora una tabla.
 *
 * La regla que ordena la tabla: **una región es un hueco que el renderizador
 * pinta por separado.** Ni uno más. Es tentador partir la prosa de una lámina
 * de contenido en «afirmación» y «cuerpo» porque queda más ordenado en el
 * inspector, pero `SlidePreview` la pinta de un tirón: dibujar ahí dos
 * regiones sería enseñar una costura que no existe, y el usuario la
 * descubriría al ver que el texto no se reparte como le prometimos.
 *
 * Las partes de prosa se identifican por NOMBRE y no por índice porque una
 * lámina puede no tener cabecera: con índices, escribir en «la segunda parte»
 * de una lámina sin título escribiría en la primera.
 *
 * `partirCabecera` y `tieneTituloPropio` viven aquí y ya no en
 * `SlideFigureParts.jsx`: son reglas sobre cómo se trocea la prosa, que es
 * exactamente el trabajo de este módulo, y estando en un archivo `.jsx` no se
 * podían ejercitar sin montar medio React. Aquel las reexporta para no obligar
 * a tocar a quien ya las importaba.
 */

/**
 * ¿La lámina escribe su propio encabezado? Si lo hace, el de la figura sobra —
 * nunca se enseñan los dos.
 *
 * Es una comprobación de texto, no un parseo: un `#` dentro de un bloque de
 * código cercado cuenta como encabezado. La consecuencia es leve (el título de
 * la figura no asciende) y no compensa montar un parser de markdown aquí para
 * cubrirlo. Cuatro espacios de sangría sí se descartan, porque eso ya es un
 * bloque de código indentado.
 */
export function tieneTituloPropio(markdown) {
    return /^ {0,3}#{1,6}\s+\S/m.test(markdown || '');
}

/**
 * Parte la prosa en cabecera (el encabezado que abre la lámina, más la bajada
 * que lo sigue) y el resto.
 *
 * La afirmación cruza la lámina a todo lo ancho aunque el cuerpo vaya en dos
 * columnas: es lo que la lámina sostiene, no una nota de la columna izquierda.
 * Metida dentro de una columna de 5/12 el título se parte en cuatro líneas y
 * empuja al resto fuera de la diapositiva.
 *
 * Sólo se parte si el encabezado es lo PRIMERO: un `##` en mitad del texto es
 * una subsección, no la afirmación de la lámina.
 */
export function partirCabecera(markdown) {
    const texto = (markdown || '').replace(/\r\n/g, '\n');
    const m = texto.match(/^ {0,3}#{1,6}[ \t]+\S[^\n]*/);
    if (!m || m.index !== 0) return { cabecera: '', resto: texto };

    let corte = m[0].length;
    // La bajada: el párrafo inmediatamente posterior, si lo hay. Se queda con
    // la cabecera porque matiza el título, no el cuerpo.
    const tras = texto.slice(corte).replace(/^\n+/, '');
    const saltados = texto.slice(corte).length - tras.length;
    const finParrafo = tras.search(/\n\s*\n/);
    const parrafo = finParrafo === -1 ? tras : tras.slice(0, finParrafo);
    const esParrafo = parrafo.trim() && !/^ {0,3}([#>\-*+]|\d+\.|```|\||<!--)/.test(parrafo.trim());
    if (esParrafo) corte += saltados + parrafo.length;

    return { cabecera: texto.slice(0, corte).trim(), resto: texto.slice(corte).trim() };
}

// El marcador de columna de `two-col`. Mismo patrón que en SlidePreview: con
// `\r?\n` implícito por el flag `m`, que en Windows hace falta.
export const COL_BREAK_RE = /^\s*<!--\s*col\s*-->\s*$/m;

/**
 * Las cuatro cosas que puede ser una región:
 *
 *   texto      un trozo de la prosa de la lámina
 *   directiva  un dato de la lámina que no vive en la prosa (el antetítulo)
 *   figura     el hueco de UNA figura
 *   figuras    la rejilla de varias (chart-grid, compare)
 */

/** Los trozos en que se puede partir la prosa. */
export const PARTES = {
    TODO: 'todo',
    CABECERA: 'cabecera',
    RESTO: 'resto',
    COL_A: 'col-a',
    COL_B: 'col-b',
};

/**
 * La tabla. El orden de cada lista **es** el orden del tabulador, así que va
 * en orden de lectura: de arriba abajo y de izquierda a derecha.
 */
const ANTETITULO = { id: 'eyebrow', nombre: 'eyebrow', tipo: 'directiva', pista: 'the deck thread' };

const soloTexto = (nombre, pista) => [
    { id: 'texto', nombre, tipo: 'texto', parte: PARTES.TODO, pista },
];

export const REGIONES_POR_DISPOSICION = {
    // ── Apertura ── Son todo título: una sola región y sin antetítulo, que
    // competiría con lo único que la lámina tiene que decir.
    cover: soloTexto('cover', 'the title and the promise in one line'),
    section: soloTexto('section', 'the name of the block that starts here'),
    closing: soloTexto('closing', 'where the conversation goes next'),
    statement: soloTexto('statement', 'a single sentence, set large'),

    // ── Evidencia ──
    // Ojo con los nombres: `partirCabecera` deja en la cabecera el encabezado
    // **y la bajada que lo sigue**, porque la bajada matiza el título y cruza
    // a todo lo ancho con él. Así que la narrativa de una lámina de hallazgo
    // vive casi siempre arriba, no en la columna de al lado de la figura.
    // Llamar «narrativa» a la parte de abajo prometía algo que no es: lo de
    // abajo es lo que se añade junto a la figura, y se llama por su sitio.
    finding: [
        ANTETITULO,
        { id: 'claim', nombre: 'claim', tipo: 'texto', parte: PARTES.CABECERA, pista: 'the claim this slide can defend, and its standfirst' },
        { id: 'detalle', nombre: 'detail', tipo: 'texto', parte: PARTES.RESTO, pista: 'what goes alongside the figure' },
        { id: 'figura', nombre: 'figure', tipo: 'figura', pista: 'pick a figure' },
    ],
    'chart-full': [
        ANTETITULO,
        { id: 'texto', nombre: 'claim', tipo: 'texto', parte: PARTES.TODO, pista: 'the claim' },
        { id: 'figura', nombre: 'figure', tipo: 'figura', pista: 'pick a figure' },
    ],
    'chart-grid': [
        ANTETITULO,
        { id: 'claim', nombre: 'claim', tipo: 'texto', parte: PARTES.CABECERA, pista: 'what these figures compare' },
        { id: 'figuras', nombre: 'figures', tipo: 'figuras', tope: 4, pista: 'up to four figures' },
        { id: 'cierre', nombre: 'closing', tipo: 'texto', parte: PARTES.RESTO, pista: 'what to look for in them' },
    ],
    compare: [
        ANTETITULO,
        { id: 'claim', nombre: 'claim', tipo: 'texto', parte: PARTES.CABECERA, pista: 'what is being compared' },
        { id: 'figuras', nombre: 'figures', tipo: 'figuras', tope: 2, pista: 'two figures' },
        { id: 'veredicto', nombre: 'verdict', tipo: 'texto', parte: PARTES.RESTO, pista: 'which one wins, and why' },
    ],

    // ── Dato ── El bloque de dato vive dentro de la prosa, así que la región
    // es una sola aunque por dentro lleve YAML.
    summary: [ANTETITULO, ...soloTexto('summary', 'the metrics and the three findings')],
    metric: [ANTETITULO, ...soloTexto('figure', 'the number to remember tomorrow')],
    table: [ANTETITULO, ...soloTexto('table', 'the detail, in order')],
    steps: [ANTETITULO, ...soloTexto('steps', 'the process, by stage')],
    actions: [ANTETITULO, ...soloTexto('actions', 'what to do, who and when')],

    // ── Texto ──
    content: [ANTETITULO, ...soloTexto('content', 'text, bullets or a table')],
    method: [ANTETITULO, ...soloTexto('method', 'definitions, exclusions and caveats')],
    'two-col': [
        ANTETITULO,
        { id: 'col-a', nombre: 'left column', tipo: 'texto', parte: PARTES.COL_A, pista: 'the first idea' },
        { id: 'col-b', nombre: 'right column', tipo: 'texto', parte: PARTES.COL_B, pista: 'the second' },
    ],
};

/** Las regiones de una lámina. Una disposición desconocida cae en `content`. */
export function regionesDe(layout) {
    return REGIONES_POR_DISPOSICION[layout] || REGIONES_POR_DISPOSICION.content;
}

/** ¿Esta disposición tiene hueco para una figura? */
export function admiteFigura(layout) {
    return regionesDe(layout).some((r) => r.tipo === 'figura' || r.tipo === 'figuras');
}

// ── Leer y escribir un trozo de prosa ───────────────────────────────────────

/**
 * El valor de una parte. `two-col` parte por el marcador; el resto, por el
 * encabezado de apertura.
 */
export function leerParte(prose, parte) {
    const texto = prose || '';
    switch (parte) {
        case PARTES.CABECERA:
            return partirCabecera(texto).cabecera;
        case PARTES.RESTO:
            return partirCabecera(texto).resto;
        case PARTES.COL_A:
            return (texto.split(COL_BREAK_RE)[0] || '').trim();
        case PARTES.COL_B:
            return (texto.split(COL_BREAK_RE)[1] || '').trim();
        case PARTES.TODO:
        default:
            return texto;
    }
}

/**
 * Devuelve la prosa COMPLETA con esa parte sustituida.
 *
 * Completa y no el trozo: así una región nunca puede partir el archivo. Es la
 * misma regla que ya seguían a mano `editarCabecera` y `editarResto` en
 * SlideDesigner, aquí en un solo sitio y para las cinco partes.
 */
export function escribirParte(prose, parte, valor) {
    const texto = prose || '';
    const nuevo = (valor || '').trim();
    switch (parte) {
        case PARTES.CABECERA:
            return [nuevo, partirCabecera(texto).resto].filter(Boolean).join('\n\n');
        case PARTES.RESTO:
            return [partirCabecera(texto).cabecera, nuevo].filter(Boolean).join('\n\n');
        case PARTES.COL_A:
            return [nuevo, '<!-- col -->', leerParte(texto, PARTES.COL_B)].join('\n\n');
        case PARTES.COL_B:
            return [leerParte(texto, PARTES.COL_A), '<!-- col -->', nuevo].join('\n\n');
        case PARTES.TODO:
        default:
            return nuevo;
    }
}
