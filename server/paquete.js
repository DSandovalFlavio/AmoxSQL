/**
 * El paquete de un proyecto (5.14, G2 + G3; Dec-47, Dec-48).
 *
 * Un `.amoxproject` es un ZIP con lo que hace falta para que otra persona —u otra
 * máquina tuya— tenga el mismo proyecto: sus procesos, consultas, cuadernos,
 * gráficos, decks, el contexto del asistente, sus fuentes y destinos, y su
 * `project.json` (sin su `id`, que es de esta carpeta). Sin datos es una plantilla
 * (G2): «Save as template…».
 *
 *   - **Los datos van aparte y se eligen.** Bases, lagos, CSV, Excel, Parquet…,
 *     desmarcados de serie. Excepción: una plantilla de Excel que usa un nodo Excel
 *     va marcada, porque sin ella el proceso no corre.
 *   - **Nunca** credenciales (sólo viajan sus nombres, en el manifiesto), `.git`,
 *     `.env*`, la carpeta de trabajo ni las entregas guardadas.
 *
 * Empezar desde un paquete es crear un proyecto: se extrae en una carpeta vacía,
 * con un `id` nuevo, y se dice lo que le falta (manifiesto, A2).
 */
const fs = require('fs');
const path = require('path');
const zip = require('./zip');

const FORMATO = 'amoxproject';
const VERSION = 1;
const MANIFIESTO = 'amoxproject.json';

// Lo que nunca viaja: carpetas y archivos.
const CARPETAS_FUERA = new Set(['.git', 'node_modules', 'target', 'dbt_packages', 'logs', '__pycache__', '.venv', 'venv']);
const RUTAS_FUERA = [/^\.amoxsql\/(trabajo|entregas|temporal)(\/|$)/i, /^\.amox\/(?!snippets\.json$|bookmarks\.json$)/i];
const ARCHIVOS_FUERA = /(^|\/)(\.env(\..*)?|.*\.(pem|key|pfx|p12)|~\$.*|.*\.amoxtmp|.*\.(duckdb|db)\.wal|\.DS_Store|Thumbs\.db)$/i;
// Lo que son datos: se elige.
const BASES = /\.(duckdb|ducklake|db|sqlite|sqlite3)(\.sqlite)?$/i;
const DATOS = /\.(csv|tsv|txt|xlsx|xlsm|xls|parquet|json|jsonl|ndjson|gz|arrow|feather|avro|orc)$/i;
const MAX_DATO = 1024 * 1024 * 1024;   // 1 GB: más, no se ofrece (un paquete no es una copia de seguridad)

const unix = (p) => String(p).split(path.sep).join('/');

/** ¿Este archivo es «del proyecto» aunque su extensión sea de datos? */
function esDelProyecto(rel, tamano) {
    if (/^\.amoxsql\//i.test(rel)) return true;                    // fuentes, destinos, project.json…
    if (/^\.amox\/(snippets|bookmarks)\.json$/i.test(rel)) return true;
    if (/\.state\.json$/i.test(rel)) return true;                   // estado de un cuaderno
    if (/(^|\/)context\//i.test(rel)) return true;                  // el contexto del asistente
    if (/\.json$/i.test(rel) && tamano < 64 * 1024) return true;    // configuración, no datos
    return false;
}

/** Las plantillas de Excel que usan los nodos Excel de los procesos. */
function plantillasUsadas(raiz, archivos) {
    const usadas = new Set();
    for (const rel of archivos.filter(r => /\.sqlchain$/i.test(r))) {
        try {
            const c = JSON.parse(fs.readFileSync(path.join(raiz, rel), 'utf8'));
            for (const n of c.nodes || []) {
                const cfg = n.config || n.data?.config || {};
                if (n.type === 'excel' && cfg.modo === 'plantilla' && cfg.plantilla && !path.isAbsolute(cfg.plantilla)) {
                    usadas.add(unix(path.normalize(cfg.plantilla)).replace(/^\.\//, ''));
                }
            }
        } catch { /* un proceso roto no impide exportar */ }
    }
    return usadas;
}

/** Recorre la carpeta: [{ rel, tamano }], sin lo que nunca viaja. */
function recorrer(raiz) {
    const out = [];
    const rec = (dir, relDir) => {
        let entradas = [];
        try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entradas) {
            const rel = relDir ? `${relDir}/${e.name}` : e.name;
            if (e.isDirectory()) {
                // Una carpeta entera fuera (trabajo, entregas); de `.amox` se mira archivo a archivo.
                if (CARPETAS_FUERA.has(e.name) || RUTAS_FUERA[0].test(`${rel}/`)) continue;
                rec(path.join(dir, e.name), rel);
            } else if (e.isFile()) {
                if (ARCHIVOS_FUERA.test(rel) || RUTAS_FUERA.some(r => r.test(rel))) continue;
                let tamano = 0;
                try { tamano = fs.statSync(path.join(dir, e.name)).size; } catch { continue; }
                out.push({ rel, tamano });
            }
        }
    };
    rec(raiz, '');
    return out;
}

/**
 * Lo que tiene el proyecto, para el diálogo de exportar:
 *   proyecto  lo que viaja siempre
 *   datos     lo que se elige: [{ rel, tamano, tipo: 'base'|'datos', marcado, motivo? }]
 */
function contenido(raiz) {
    const todos = recorrer(raiz);
    const plantillas = plantillasUsadas(raiz, todos.map(a => a.rel));
    const proyecto = [];
    const datos = [];
    for (const a of todos) {
        if (BASES.test(a.rel)) datos.push({ ...a, tipo: 'base', marcado: false });
        else if (DATOS.test(a.rel) && !esDelProyecto(a.rel, a.tamano)) {
            const plantilla = plantillas.has(a.rel);
            datos.push({ ...a, tipo: 'datos', marcado: plantilla, ...(plantilla ? { motivo: 'An Excel node fills this template' } : {}) });
        } else proyecto.push(a);
    }
    for (const d of datos) if (d.tamano > MAX_DATO) { d.marcado = false; d.demasiado = true; }
    return { proyecto, datos, plantillas: [...plantillas] };
}

/** El project.json de un paquete: sin el id de esta carpeta. */
function projectJsonParaPaquete(raiz) {
    try {
        const pj = JSON.parse(fs.readFileSync(path.join(raiz, '.amoxsql', 'project.json'), 'utf8'));
        delete pj.id;
        return pj;
    } catch { return null; }
}

/**
 * Escribe el paquete. `incluir`: las rutas de datos elegidas (las demás de datos
 * no viajan). Escribe aparte y renombra.
 */
async function exportar(raiz, destino, { incluir = null, plantilla = false } = {}) {
    const c = contenido(raiz);
    const elegidos = new Set(plantilla ? c.datos.filter(d => d.motivo).map(d => d.rel) : (incluir || c.datos.filter(d => d.marcado).map(d => d.rel)));
    const datos = c.datos.filter(d => elegidos.has(d.rel) && !d.demasiado);
    const pj = projectJsonParaPaquete(raiz);
    const manifiesto = {
        formato: FORMATO, version: VERSION, exportado: new Date().toISOString(),
        nombre: path.basename(raiz), plantilla: !!plantilla,
        requiere: pj?.requiere || {},
        archivos: c.proyecto.length, datos: datos.map(d => d.rel),
    };
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const temporal = path.join(path.dirname(destino), `.${path.basename(destino)}.amoxtmp`);
    const z = new zip.EscritorZip(temporal);
    try {
        z.agregar(MANIFIESTO, JSON.stringify(manifiesto, null, 2));
        for (const a of c.proyecto) {
            if (a.rel === '.amoxsql/project.json' && pj) { z.agregar(a.rel, JSON.stringify(pj, null, 2)); continue; }
            await z.agregarFlujo(a.rel, fs.createReadStream(path.join(raiz, a.rel)));
        }
        for (const d of datos) await z.agregarFlujo(d.rel, fs.createReadStream(path.join(raiz, d.rel)));
        z.cerrar();
    } catch (e) {
        try { z.abandonar(); } catch { /* ya cerrado */ }
        try { fs.rmSync(temporal, { force: true }); } catch { /* no estaba */ }
        throw e;
    }
    fs.renameSync(temporal, destino);
    return { ruta: destino, bytes: fs.statSync(destino).size, archivos: c.proyecto.length, datos: datos.map(d => d.rel), manifiesto };
}

class ErrorDePaquete extends Error {}

/** Lo que trae un paquete, sin extraerlo. */
function leer(paquete) {
    let z;
    try { z = zip.abrir(paquete); } catch (e) { throw new ErrorDePaquete(`This is not a project package: ${e.message}`); }
    try {
        const m = z.leer(MANIFIESTO);
        if (!m) throw new ErrorDePaquete('This file is not an AmoxSQL project package (it has no amoxproject.json).');
        let manifiesto;
        try { manifiesto = JSON.parse(m.toString('utf8')); } catch { throw new ErrorDePaquete('The package manifest is damaged.'); }
        if (manifiesto.formato !== FORMATO) throw new ErrorDePaquete('This file is not an AmoxSQL project package.');
        if (manifiesto.version > VERSION) throw new ErrorDePaquete('This package was made by a newer AmoxSQL: update to open it.');
        return { manifiesto, entradas: z.entradas.map(e => ({ nombre: e.nombre, tamano: e.original })).filter(e => e.nombre !== MANIFIESTO) };
    } finally { z.cerrar(); }
}

/**
 * Extrae un paquete en una carpeta nueva (o vacía) y le da un id nuevo. Nunca
 * escribe fuera de esa carpeta (una entrada con `..` o absoluta se rechaza).
 */
function extraer(paquete, carpeta) {
    const { manifiesto } = leer(paquete);
    const raiz = path.resolve(carpeta);
    if (fs.existsSync(raiz) && fs.readdirSync(raiz).length) throw new ErrorDePaquete(`The folder is not empty: ${raiz}. Choose a new folder for the project.`);
    fs.mkdirSync(raiz, { recursive: true });
    const z = zip.abrir(paquete);
    const escritos = [];
    try {
        for (const e of z.entradas) {
            if (e.nombre === MANIFIESTO || e.nombre.endsWith('/')) continue;
            const destino = path.resolve(raiz, e.nombre);
            if (path.isAbsolute(e.nombre) || /(^|[\\/])\.\.([\\/]|$)/.test(e.nombre) || !destino.startsWith(raiz + path.sep)) {
                throw new ErrorDePaquete(`The package has an entry outside the project (${e.nombre}): it was not opened.`);
            }
            if (ARCHIVOS_FUERA.test(e.nombre)) continue;
            fs.mkdirSync(path.dirname(destino), { recursive: true });
            fs.writeFileSync(destino, z.leer(e.nombre));
            escritos.push(e.nombre);
        }
    } finally { z.cerrar(); }
    // El id es de cada carpeta: el registro le da uno nuevo al abrirla.
    const pjRuta = path.join(raiz, '.amoxsql', 'project.json');
    try {
        const pj = JSON.parse(fs.readFileSync(pjRuta, 'utf8'));
        delete pj.id;
        fs.writeFileSync(pjRuta, JSON.stringify(pj, null, 2));
    } catch { /* sin project.json */ }
    return { raiz, archivos: escritos.length, manifiesto };
}

module.exports = { FORMATO, MANIFIESTO, ErrorDePaquete, contenido, exportar, leer, extraer, recorrer };
