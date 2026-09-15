/**
 * Qué es cada archivo. **Una sola tabla, y una sola vez.**
 *
 * Hasta ahora esta decisión vivía en tres sitios que no se conocían entre sí:
 *
 * - `FileExplorer.jsx:171` — qué pasa al hacer doble clic.
 * - `LayoutManager.jsx:1383` — qué `type` lleva la pestaña.
 * - `EditorPane.jsx:389` — qué editor se monta.
 *
 * Tres cadenas de `endsWith` escritas en momentos distintos, con listas
 * distintas. Por eso discrepaban: el explorador sabía de `.amoxdiagram` y la
 * cadena de la pestaña no, así que un diagrama abierto por cierto camino
 * llegaba marcado como SQL.
 *
 * ## Lo que estaba mal de fondo
 *
 * Las tres cadenas acababan igual: **`: 'sql'`**. El descarte era SQL, y eso es
 * una afirmación fortísima sobre un archivo del que no sabemos nada — dice que
 * se puede colorear con una gramática concreta y, peor, que se puede
 * **ejecutar**. De ahí salían el `.json` de configuración que no había forma de
 * abrir, el YAML pintado al azar y el Ctrl+Enter que intentaba mandar un `.py`
 * a la base de datos.
 *
 * Aquí el descarte es **`texto`**, que es la afirmación más débil que se puede
 * hacer sobre un archivo y por eso la única honrada.
 *
 * ## Qué devuelve
 *
 * - `tipo` — qué editor lo abre. Los nuestros por su nombre; `datos` para lo
 *   tabular, `texto` para lo demás y `binario` para lo que no son caracteres.
 * - `idioma` — cómo se colorea. El editor trae todos los idiomas, así que esto
 *   no cuesta nada; lo que costaba era pintarlos todos de SQL.
 * - `ejecutable` — si Ctrl+Enter significa algo. **Sólo SQL y los nuestros.**
 *
 * ## Lo que NO hace
 *
 * No mira dentro del archivo. Un `.json` puede ser un conjunto de datos o la
 * configuración de una herramienta, y **por la extensión no se distinguen**:
 * esa elección es del usuario y se resuelve en la interfaz, no aquí. La tabla
 * da el punto de partida, no la última palabra.
 */

/** El editor llano, para cuando no sabemos nada del archivo. */
export const POR_DEFECTO = { tipo: 'texto', idioma: 'plaintext', ejecutable: false };

/** Lo que no son caracteres: abrirlo como texto sólo produce ruido. */
const BINARIO = { tipo: 'binario', idioma: null, ejecutable: false };

/** Datos que además son binarios: no se leen como texto, pero sí se consultan. */
const DATOS_BINARIOS = { tipo: 'datos', idioma: null, ejecutable: false };

/**
 * Extensión (sin punto, en minúsculas) → qué es.
 *
 * El orden de este objeto no significa nada; la búsqueda es por clave.
 */
export const POR_EXTENSION = {
    // ── Los nuestros ────────────────────────────────────────────────────────
    sql: { tipo: 'sql', idioma: 'sql', ejecutable: true },
    sqlnb: { tipo: 'sqlnb', idioma: 'sql', ejecutable: true },
    sqlchain: { tipo: 'sqlchain', idioma: 'json', ejecutable: true },
    md: { tipo: 'md', idioma: 'markdown', ejecutable: false },
    amoxdeck: { tipo: 'amoxdeck', idioma: 'markdown', ejecutable: false },
    amoxdiagram: { tipo: 'amoxdiagram', idioma: 'markdown', ejecutable: false },
    amoxvis: { tipo: 'amoxvis', idioma: 'json', ejecutable: false },

    // ── Datos ───────────────────────────────────────────────────────────────
    // `json` y `jsonl` están aquí porque es lo que más veces son, no porque
    // siempre lo sean. La otra lectura la ofrece la interfaz.
    csv: { tipo: 'datos', idioma: 'plaintext', ejecutable: false },
    tsv: { tipo: 'datos', idioma: 'plaintext', ejecutable: false },
    json: { tipo: 'datos', idioma: 'json', ejecutable: false },
    jsonl: { tipo: 'datos', idioma: 'json', ejecutable: false },
    ndjson: { tipo: 'datos', idioma: 'json', ejecutable: false },
    parquet: DATOS_BINARIOS,
    xlsx: DATOS_BINARIOS,
    xls: DATOS_BINARIOS,

    // ── Texto: configuración, scripts, notas ────────────────────────────────
    yml: { tipo: 'texto', idioma: 'yaml', ejecutable: false },
    yaml: { tipo: 'texto', idioma: 'yaml', ejecutable: false },
    toml: { tipo: 'texto', idioma: 'ini', ejecutable: false },
    ini: { tipo: 'texto', idioma: 'ini', ejecutable: false },
    cfg: { tipo: 'texto', idioma: 'ini', ejecutable: false },
    conf: { tipo: 'texto', idioma: 'ini', ejecutable: false },
    env: { tipo: 'texto', idioma: 'ini', ejecutable: false },
    py: { tipo: 'texto', idioma: 'python', ejecutable: false },
    ipynb: { tipo: 'texto', idioma: 'json', ejecutable: false },
    r: { tipo: 'texto', idioma: 'r', ejecutable: false },
    js: { tipo: 'texto', idioma: 'javascript', ejecutable: false },
    mjs: { tipo: 'texto', idioma: 'javascript', ejecutable: false },
    cjs: { tipo: 'texto', idioma: 'javascript', ejecutable: false },
    ts: { tipo: 'texto', idioma: 'typescript', ejecutable: false },
    tsx: { tipo: 'texto', idioma: 'typescript', ejecutable: false },
    jsx: { tipo: 'texto', idioma: 'javascript', ejecutable: false },
    sh: { tipo: 'texto', idioma: 'shell', ejecutable: false },
    bash: { tipo: 'texto', idioma: 'shell', ejecutable: false },
    ps1: { tipo: 'texto', idioma: 'powershell', ejecutable: false },
    bat: { tipo: 'texto', idioma: 'bat', ejecutable: false },
    xml: { tipo: 'texto', idioma: 'xml', ejecutable: false },
    html: { tipo: 'texto', idioma: 'html', ejecutable: false },
    css: { tipo: 'texto', idioma: 'css', ejecutable: false },
    txt: { tipo: 'texto', idioma: 'plaintext', ejecutable: false },
    log: { tipo: 'texto', idioma: 'plaintext', ejecutable: false },

    // ── Binario ─────────────────────────────────────────────────────────────
    // Se clasifican para **no abrirlos como texto**: un PNG en el editor no es
    // un archivo ilegible, es una pantalla de basura que parece un fallo.
    png: BINARIO, jpg: BINARIO, jpeg: BINARIO, gif: BINARIO, webp: BINARIO,
    bmp: BINARIO, ico: BINARIO, pdf: BINARIO, zip: BINARIO, gz: BINARIO,
    tar: BINARIO, '7z': BINARIO, exe: BINARIO, dll: BINARIO, wasm: BINARIO,
    duckdb: BINARIO, db: BINARIO, ducklake: BINARIO, sqlite: BINARIO,
    ttf: BINARIO, otf: BINARIO, woff: BINARIO, woff2: BINARIO,
};

/**
 * Archivos que se reconocen **por el nombre entero**, porque no tienen
 * extensión. Son unos pocos y muy usados: dejarlos caer en el descarte sería
 * abrir un `Dockerfile` sin colorear habiendo un idioma para él.
 *
 * La clave va en minúsculas; la comparación también.
 */
export const POR_NOMBRE = {
    dockerfile: { tipo: 'texto', idioma: 'dockerfile', ejecutable: false },
    makefile: { tipo: 'texto', idioma: 'makefile', ejecutable: false },
    '.gitignore': { tipo: 'texto', idioma: 'plaintext', ejecutable: false },
    '.gitattributes': { tipo: 'texto', idioma: 'plaintext', ejecutable: false },
    '.editorconfig': { tipo: 'texto', idioma: 'ini', ejecutable: false },
    '.env': { tipo: 'texto', idioma: 'ini', ejecutable: false },
};

/** El nombre del archivo, venga la ruta con las barras que venga. */
export function nombreDe(ruta) {
    return String(ruta || '').split(/[/\\]/).pop() || '';
}

/**
 * La extensión, en minúsculas y sin punto. Cadena vacía si no tiene.
 *
 * Se coge **la última**, no la primera: `ventas.csv.gz` está comprimido y no es
 * un CSV, y tratarlo como CSV daría un error incomprensible al leerlo. Y un
 * nombre que empieza por punto y no tiene más puntos —`.gitignore`— **no tiene
 * extensión**: ese punto es parte del nombre.
 */
export function extensionDe(ruta) {
    const nombre = nombreDe(ruta);
    const i = nombre.lastIndexOf('.');
    if (i <= 0) return '';
    return nombre.slice(i + 1).toLowerCase();
}

/**
 * Qué es este archivo.
 *
 * Nunca devuelve `null`: lo desconocido es `texto`, que es el descarte seguro.
 * Devolver `null` obligaría a cada consumidor a inventarse un suyo, y eso es
 * exactamente como llegamos a tener tres cadenas que discrepaban.
 */
export function tipoDeArchivo(ruta) {
    const nombre = nombreDe(ruta).toLowerCase();
    if (!nombre) return POR_DEFECTO;

    const porNombre = POR_NOMBRE[nombre];
    if (porNombre) return porNombre;

    const ext = extensionDe(nombre);
    return POR_EXTENSION[ext] || POR_DEFECTO;
}

/** Atajos, para que quien pregunte no tenga que acordarse de la forma del objeto. */
export function esEjecutable(ruta) {
    return tipoDeArchivo(ruta).ejecutable === true;
}

export function esBinario(ruta) {
    return tipoDeArchivo(ruta).tipo === 'binario';
}

export function idiomaDe(ruta) {
    return tipoDeArchivo(ruta).idioma || 'plaintext';
}

/**
 * El `type` de la pestaña.
 *
 * `datos` y `binario` describen el archivo, no un editor: si algo de eso acaba
 * abierto en una pestaña es porque el usuario pidió verlo, y lo que se abre es
 * el editor llano. Así que aquí se traducen a `texto`.
 */
export function tipoDePestana(ruta) {
    const t = tipoDeArchivo(ruta).tipo;
    return t === 'datos' || t === 'binario' ? 'texto' : t;
}
