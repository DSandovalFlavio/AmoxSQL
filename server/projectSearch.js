/**
 * projectSearch — buscar texto dentro de los archivos del proyecto.
 *
 * Hoy el explorador solo filtra por NOMBRE de archivo, así que la pregunta
 * "¿dónde escribí lo de la marca de agua?" no tenía respuesta dentro de la app.
 *
 * El ámbito por defecto no es una preferencia de gusto. Medido sobre un
 * proyecto real (184 archivos de fuente, 176 de datos):
 *
 *     fuente  →   1,0 MB  ·    31 ms  ·  756 coincidencias
 *     datos   → 335,0 MB  · 6.118 ms  ·    0 coincidencias
 *
 * 433x más peso, 197x más lento, cero resultados. De ahí las tres categorías:
 * la fuente siempre se busca, los datos de texto son opt-in con su aviso, y los
 * binarios no se leen nunca (además de lento, produce coincidencias basura con
 * secuencias de bytes que parecen palabras).
 *
 * Los formatos propios que por dentro son JSON NO se buscan en crudo: eso haría
 * que "bar" encontrase `"chartType": "bar"` y que "type" devolviese todos los
 * archivos. Se extrae el texto que el usuario reconoce de la interfaz.
 */
const fs = require('fs');
const path = require('path');

// ── Categorías ──────────────────────────────────────────────────────────────
const SOURCE_EXTS = new Set([
    '.sql', '.md', '.amoxdeck', '.amoxdiagram', '.sqlnb', '.sqlchain', '.amoxvis',
    '.yaml', '.yml', '.txt', '.json', '.rules',
]);
const DATA_TEXT_EXTS = new Set(['.csv', '.tsv', '.jsonl', '.ndjson', '.log']);

// Sin interruptor a propósito: buscar texto dentro de un parquet no tiene
// sentido, y para eso está DuckDB.
const BINARY_EXTS = new Set([
    '.parquet', '.xlsx', '.xls', '.duckdb', '.db', '.ducklake', '.wal',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf',
    '.zip', '.gz', '.7z', '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.mp4', '.mp3', '.wav', '.gguf', '.exe', '.dll', '.node',
]);

const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'target', '.venv', 'venv',
    '__pycache__', '.next', 'coverage', '.pytest_cache', '.ruff_cache',
]);

// Archivos que acaban en .json pero no contienen nada que nadie haya escrito.
// El sidecar de notebooks guarda resultados cacheados: pesa megas y es ruido.
const EXCLUDED_NAMES = [
    /\.state\.json$/i,
    /^package-lock\.json$/i,
    /^pnpm-lock\.yaml$/i,
    /^yarn\.lock$/i,
];

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_HITS = 500;
// Tope POR ARCHIVO: sin el, un solo volcado de datos se come el presupuesto
// entero y los resultados de los .sql y .md nunca llegan a verse. Medido: un
// dataset.json de 147 KB acaparaba las 500 coincidencias el solo.
const MAX_HITS_POR_ARCHIVO = 20;

/**
 * No todo .json es configuracion. Un `dataset.json` con un volcado de filas es
 * un archivo de DATOS que casualmente acaba en .json, y buscarlo por defecto
 * ahoga al resto. Heuristica barata: si empieza por `[` es una lista de filas,
 * y la configuracion de verdad nunca pesa medio mega.
 */
function jsonEsVolcadoDeDatos(fullPath, size) {
    if (size > 512 * 1024) return true;
    try {
        const fd = fs.openSync(fullPath, 'r');
        const buf = Buffer.alloc(64);
        const n = fs.readSync(fd, buf, 0, 64, 0);
        fs.closeSync(fd);
        return buf.subarray(0, n).toString('utf8').trimStart().startsWith('[');
    } catch {
        return false;
    }
}

// ── .gitignore ──────────────────────────────────────────────────────────────
/**
 * Traduce una línea de .gitignore a expresión regular. Cubre lo habitual:
 * comentarios, negaciones, anclaje con `/`, `*`, `**` y `?`. No implementa el
 * estándar entero — para eso haría falta una dependencia, y lo que se busca
 * aquí es no perder tiempo en `exports/` y artefactos generados.
 */
function reglaAExpresion(cuerpo) {
    const soloDirectorio = cuerpo.endsWith('/');
    let patron = soloDirectorio ? cuerpo.slice(0, -1) : cuerpo;
    const anclada = patron.startsWith('/') || patron.slice(0, -1).includes('/');
    if (patron.startsWith('/')) patron = patron.slice(1);

    let re = '';
    for (let i = 0; i < patron.length; i++) {
        const c = patron[i];
        if (c === '*') {
            if (patron[i + 1] === '*') { re += '.*'; i++; }
            else re += '[^/]*';
        } else if (c === '?') re += '[^/]';
        else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }

    return {
        soloDirectorio,
        re: new RegExp(anclada ? `^${re}(/|$)` : `(^|/)${re}(/|$)`),
    };
}

function cargarIgnore(rootDir) {
    let texto;
    try {
        texto = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
    } catch {
        return () => false;
    }

    const reglas = [];
    for (const linea of texto.split(/\r?\n/)) {
        const t = linea.trim();
        if (!t || t.startsWith('#')) continue;
        const negada = t.startsWith('!');
        const cuerpo = negada ? t.slice(1) : t;
        if (!cuerpo) continue;
        try { reglas.push({ negada, ...reglaAExpresion(cuerpo) }); } catch { /* regla rara: se ignora */ }
    }

    // La última regla que casa manda, que es como se comporta git.
    return (relPath, esDirectorio) => {
        let ignorado = false;
        for (const r of reglas) {
            if (r.soloDirectorio && !esDirectorio && !r.re.test(relPath)) continue;
            if (r.re.test(relPath)) ignorado = !r.negada;
        }
        return ignorado;
    };
}

// ── Extracción de texto por formato ─────────────────────────────────────────
/** Una línea buscable: `donde` dice en qué parte del archivo vive. */
function linea(n, text, donde) {
    return { line: n, text: text.length > 400 ? `${text.slice(0, 400)}…` : text, donde };
}

function lineasPlanas(raw) {
    return raw.split(/\r?\n/).map((t, i) => linea(i + 1, t, null));
}

function lineasDeNotebook(raw) {
    const out = [];
    const doc = JSON.parse(raw);
    const celdas = Array.isArray(doc.cells) ? doc.cells : [];
    celdas.forEach((celda, i) => {
        const contenido = typeof celda.content === 'string' ? celda.content : '';
        const donde = `celda ${i + 1}${celda.type === 'markdown' ? ' · markdown' : ''}`;
        contenido.split(/\r?\n/).forEach((t, j) => out.push(linea(j + 1, t, donde)));
    });
    return out;
}

function lineasDeChain(raw) {
    const out = [];
    const doc = JSON.parse(raw);
    if (doc.name) out.push(linea(null, String(doc.name), 'nombre'));
    if (doc.description) out.push(linea(null, String(doc.description), 'descripción'));
    for (const nodo of Array.isArray(doc.nodes) ? doc.nodes : []) {
        const donde = `nodo «${nodo.label || nodo.type || '?'}»`;
        if (nodo.label) out.push(linea(null, String(nodo.label), donde));
        if (nodo.description) out.push(linea(null, String(nodo.description), donde));
        for (const valor of Object.values(nodo.config || {})) {
            if (typeof valor === 'string' && valor.trim()) {
                valor.split(/\r?\n/).forEach(t => out.push(linea(null, t, donde)));
            }
        }
    }
    return out;
}

function lineasDeGrafico(raw) {
    const out = [];
    const doc = JSON.parse(raw);
    const cfg = doc.config || doc;
    for (const clave of ['chartTitle', 'chartSubtitle', 'xAxisKey', 'rightYAxisKey', 'splitByKey']) {
        if (typeof cfg[clave] === 'string' && cfg[clave].trim()) out.push(linea(null, cfg[clave], clave));
    }
    for (const k of Array.isArray(cfg.yAxisKeys) ? cfg.yAxisKeys : []) {
        if (typeof k === 'string') out.push(linea(null, k, 'yAxisKeys'));
    }
    const consulta = doc.query || cfg.query;
    if (typeof consulta === 'string') consulta.split(/\r?\n/).forEach((t, i) => out.push(linea(i + 1, t, 'consulta')));
    return out;
}

const EXTRACTORES = {
    '.sqlnb': lineasDeNotebook,
    '.sqlchain': lineasDeChain,
    '.amoxvis': lineasDeGrafico,
};

/**
 * Texto buscable de un archivo. Los formatos propios pasan por su extractor;
 * el resto —incluido `.amoxdeck`, que YA es markdown— van tal cual.
 * Si un extractor falla (archivo a medio escribir, JSON roto) se cae a texto
 * plano en vez de perder el archivo entero.
 */
function textoBuscable(ext, raw) {
    const extractor = EXTRACTORES[ext];
    if (!extractor) return lineasPlanas(raw);
    try {
        return extractor(raw);
    } catch {
        return lineasPlanas(raw);
    }
}

// ── Recorrido, con caché por mtime ──────────────────────────────────────────
// rootDir -> Map(relPath -> { mtime, size, lineas })
const cache = new Map();

function categoria(ext) {
    if (BINARY_EXTS.has(ext)) return 'binario';
    if (SOURCE_EXTS.has(ext)) return 'fuente';
    if (DATA_TEXT_EXTS.has(ext)) return 'datos';
    return 'otro';
}

function recolectar(rootDir, { scope, maxBytes }) {
    const ignorado = cargarIgnore(rootDir);
    const elegidos = [];
    const omitidos = [];
    let bytesDatos = 0;
    let nDatos = 0;

    const walk = (dir, rel) => {
        let entradas;
        try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entradas) {
            const relHijo = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) {
                if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
                if (ignorado(relHijo, true)) continue;
                walk(path.join(dir, e.name), relHijo);
                continue;
            }
            if (e.name.startsWith('.')) continue;
            if (EXCLUDED_NAMES.some(re => re.test(e.name))) continue;
            if (ignorado(relHijo, false)) continue;

            const ext = path.extname(e.name).toLowerCase();
            let cat = categoria(ext);
            if (cat === 'binario' || cat === 'otro') continue;

            let stat;
            try { stat = fs.statSync(path.join(dir, e.name)); } catch { continue; }

            // Un .json que por dentro es un volcado de filas cuenta como datos.
            if (ext === '.json' && jsonEsVolcadoDeDatos(path.join(dir, e.name), stat.size)) cat = 'datos';

            if (cat === 'datos') {
                nDatos++;
                try { bytesDatos += fs.statSync(path.join(dir, e.name)).size; } catch { /* noop */ }
                if (scope !== 'todo' && scope !== 'datos') continue;
            }
            if (cat === 'fuente' && scope === 'datos') continue;

            if (stat.size > maxBytes) {
                omitidos.push({ path: relHijo, motivo: 'tamaño', size: stat.size });
                continue;
            }
            elegidos.push({ rel: relHijo, full: path.join(dir, e.name), ext, mtime: stat.mtimeMs, size: stat.size });
        }
    };

    walk(rootDir, '');
    return { elegidos, omitidos, datos: { n: nDatos, bytes: bytesDatos } };
}

function lineasDe(rootDir, archivo) {
    let porProyecto = cache.get(rootDir);
    if (!porProyecto) { porProyecto = new Map(); cache.set(rootDir, porProyecto); }

    const previo = porProyecto.get(archivo.rel);
    if (previo && previo.mtime === archivo.mtime) return previo.lineas;

    let raw;
    try { raw = fs.readFileSync(archivo.full, 'utf8'); } catch { return []; }
    const lineas = textoBuscable(archivo.ext, raw);
    porProyecto.set(archivo.rel, { mtime: archivo.mtime, lineas });
    return lineas;
}

/** Quita tildes para que "diagnostico" encuentre "diagnóstico". */
function normalizar(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── API ─────────────────────────────────────────────────────────────────────
/**
 * Busca `q` como texto plano, sin distinguir mayúsculas ni tildes.
 * `scope`: 'fuente' (por defecto) · 'datos' · 'todo'.
 */
function searchProject(rootDir, { q, scope = 'fuente', limit = MAX_HITS, maxBytes = MAX_FILE_BYTES } = {}) {
    const t0 = Date.now();
    const aguja = normalizar(String(q || '').trim());
    if (!aguja) return { hits: [], truncado: false, omitidos: [], datos: { n: 0, bytes: 0 }, ms: 0, archivos: 0 };

    const { elegidos, omitidos, datos } = recolectar(rootDir, { scope, maxBytes });
    const hits = [];
    const totalPorArchivo = {};
    let truncado = false;

    for (const archivo of elegidos) {
        let enEste = 0;
        for (const l of lineasDe(rootDir, archivo)) {
            if (!l.text) continue;
            const col = normalizar(l.text).indexOf(aguja);
            if (col < 0) continue;
            enEste++;
            // Se cuentan todas, pero solo se devuelven las primeras de cada
            // archivo: asi los resultados se reparten en vez de acumularse.
            if (enEste <= MAX_HITS_POR_ARCHIVO && hits.length < limit) {
                hits.push({ path: archivo.rel, line: l.line, col, text: l.text.trim(), donde: l.donde });
            }
        }
        if (enEste) totalPorArchivo[archivo.rel] = enEste;
        if (hits.length >= limit) { truncado = true; break; }
    }

    return { hits, totalPorArchivo, truncado, omitidos, datos, ms: Date.now() - t0, archivos: elegidos.length };
}

/**
 * Vista de solo-markdown del mismo recorrido: front-matter, casillas y enlaces.
 * Es lo que consume el panel de pendientes del editor de documentos.
 */
function docsIndex(rootDir) {
    const { elegidos } = recolectar(rootDir, { scope: 'fuente', maxBytes: MAX_FILE_BYTES });
    const docs = [];

    for (const archivo of elegidos.filter(a => a.ext === '.md')) {
        let raw;
        try { raw = fs.readFileSync(archivo.full, 'utf8'); } catch { continue; }
        docs.push(analizarMarkdown(archivo.rel, raw));
    }
    return docs;
}

// ── Análisis de un .md: front-matter, casillas y enlaces ────────────────────
const TASK_RE = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s*(.*)$/;
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
const DUE_RE = /\s+vence\s+(\d{4}-\d{2}-\d{2})\s*$/i;
const OWNER_RE = /\s+@([\w.\-áéíóúüñÁÉÍÓÚÜÑ]+)\s*$/;

function separarMeta(rawText) {
    let text = (rawText || '').trim();
    let owner = null;
    let due = null;
    for (let i = 0; i < 2; i++) {
        const vence = text.match(DUE_RE);
        if (vence && !due) { due = vence[1]; text = text.slice(0, vence.index).trim(); continue; }
        const quien = text.match(OWNER_RE);
        if (quien && !owner) { owner = quien[1]; text = text.slice(0, quien.index).trim(); continue; }
        break;
    }
    return { text, owner, due };
}

function analizarMarkdown(relPath, raw) {
    // Partir por /\r?\n/ y no por '\n': con CRLF cada línea arrastraría un \r
    // final y el `$` de las expresiones de abajo no casaría con nada.
    const lines = raw.split(/\r?\n/);

    let frontmatter = null;
    let start = 0;
    if (lines[0]?.trim() === '---') {
        const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
        if (end > 0) {
            try {
                const yaml = require('js-yaml');
                frontmatter = yaml.load(lines.slice(1, end).join('\n')) || null;
            } catch { frontmatter = null; }
            start = end + 1;
        }
    }

    const tasks = [];
    const links = new Set();
    let inFence = false;
    let fence = '';

    for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        // Las casillas y los enlaces dentro de un bloque cercado son ejemplos,
        // no pendientes ni referencias reales.
        const marca = line.match(/^\s*(```|~~~)/);
        if (marca) {
            if (!inFence) { inFence = true; fence = marca[1]; }
            else if (line.trim().startsWith(fence)) { inFence = false; }
            continue;
        }
        if (inFence) continue;

        const tarea = line.match(TASK_RE);
        if (tarea) tasks.push({ line: i + 1, done: tarea[1].toLowerCase() === 'x', ...separarMeta(tarea[2]) });

        LINK_RE.lastIndex = 0;
        let enlace;
        while ((enlace = LINK_RE.exec(line)) !== null) {
            const href = enlace[1];
            if (/^(https?:|mailto:|#)/i.test(href)) continue;
            links.add(href.replace(/^\.\//, '').split('#')[0]);
        }
    }

    const title = lines.slice(start).find(l => /^#\s+/.test(l))?.replace(/^#\s+/, '').trim()
        || path.basename(relPath, '.md');

    return { path: relPath, title, frontmatter, tasks, links: [...links] };
}

function invalidar(rootDir) {
    if (rootDir) cache.delete(rootDir);
    else cache.clear();
}

module.exports = {
    searchProject,
    docsIndex,
    invalidar,
    // exportados para las pruebas
    cargarIgnore,
    textoBuscable,
    categoria,
    normalizar,
    SOURCE_EXTS,
    DATA_TEXT_EXTS,
    BINARY_EXTS,
};
