/**
 * Las fuentes con nombre (C1, fase 1 del plan de la 5.10).
 *
 * Una fuente es un dato que llega de fuera —un Excel, un CSV, un Parquet— con
 * un nombre estable: `ventas-semanales`. Se consulta como una tabla más,
 * `SELECT * FROM fuentes."ventas-semanales"`, desde el editor, un cuaderno,
 * Data Flow, la IA o la línea de comandos.
 *
 * Tiene dos mitades (Dec-9):
 *   - La DEFINICIÓN la escribe una persona y es la misma en todas las máquinas:
 *     un JSON en `<home>/workspaces/<id>/fuentes/<nombre>.json` (viaja en el
 *     .amoxworkspace) o en `<proyecto>/.amoxsql/fuentes/<nombre>.json`. Con el
 *     mismo nombre, gana la del proyecto (la regla de B2).
 *   - La UBICACIÓN en esta máquina la registra la máquina: tabla
 *     `fuentes_locales` de la base de AmoxSQL. No hace falta cuando la
 *     definición ya la dice para todos: una URL (s3://, https://) o, en una
 *     fuente de proyecto, una ruta relativa al proyecto.
 *
 * El catálogo (Dec-10): cada sesión hace `ATTACH ':memory:' AS fuentes` y crea
 * dentro una VISTA por fuente. Nada se escribe en la base del proyecto; el dato
 * se lee del archivo cada vez. Lo confirmó la prueba 0.1:
 *   - crear la vista lee el archivo (para saber sus columnas), así que una
 *     fuente cuyo archivo no está se crea como una vista con `error(…)` que lo
 *     explica al consultarla;
 *   - un esquema `fuentes` dentro del proyecto da un error de ambigüedad (no se
 *     lee lo que no es): `fuentes.main."x"` funciona siempre.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const baseCentral = require('./central/BaseCentral');
const scaffolder = require('./projectScaffolder');
const { homeAmox } = require('./rutas');
const excel = require('./excel');

const CATALOGO = 'fuentes';
const NOMBRE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NOMBRE = 64;
const TIPOS = ['archivo', 'carpeta', 'bucket', 'lago'];
// C4: los formatos de un lago (una tabla, no un archivo).
const LAGOS = ['delta', 'iceberg', 'ducklake'];
const FORMATOS = {
    csv: /\.(csv|tsv|txt)(\.gz)?$/i,
    parquet: /\.parquet$/i,
    json: /\.(json|jsonl|ndjson)(\.gz)?$/i,
    xlsx: /\.(xlsx|xlsm)$/i,
};
const REMOTA = /^(s3|gs|gcs|r2|az|azure|abfss|https?):\/\//i;

// ── Nombres y definiciones ──────────────────────────────────────────────────

function validarNombre(nombre) {
    const n = String(nombre ?? '').trim();
    if (!n) throw new Error('A source needs a name.');
    if (n.length > MAX_NOMBRE) throw new Error(`A source name has ${MAX_NOMBRE} characters at most.`);
    if (!NOMBRE.test(n)) {
        throw new Error('A source name uses lowercase letters, digits and hyphens only (for example: weekly-sales).');
    }
    return n;
}

/** Del nombre de un archivo a un nombre de fuente válido: «Ventas Semana 39.xlsx» → ventas-semana-39. */
function sugerirNombre(texto) {
    const base = String(texto || '').replace(/\.[^.]+$/, '');
    const n = base.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_NOMBRE)
        .replace(/-+$/, '');
    return n || 'source';
}

function formatoDe(ruta) {
    for (const [f, re] of Object.entries(FORMATOS)) if (re.test(String(ruta || ''))) return f;
    return null;
}

const texto = (v, max = 500) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));

/**
 * Limpia una definición que llega del cliente o de un archivo. Lo que no se
 * reconoce se descarta; lo que no vale, se dice.
 */
function normalizarDefinicion(d) {
    const x = d && typeof d === 'object' ? d : {};
    const nombre = validarNombre(x.nombre);
    const tipo = x.tipo || 'archivo';
    if (!TIPOS.includes(tipo)) throw new Error(`Unknown source type: ${tipo}`);
    const ubicacion = texto(x.ubicacion, 2000) || null;
    let formato = x.formato || null;
    if (tipo === 'lago') {
        if (!LAGOS.includes(formato)) throw new Error(`A lake source is Delta, Iceberg or DuckLake (got: ${formato || 'nothing'}).`);
    } else if (formato && !FORMATOS[formato]) throw new Error(`Unknown format: ${formato}`);
    const def = { nombre, tipo, descripcion: texto(x.descripcion, 1000) || null, formato, ubicacion };
    if (tipo === 'carpeta') {
        // C3: una carpeta donde «llega» el archivo. El patrón es sólo el nombre
        // (sin carpetas): `ventas*.xlsx`. Por defecto, el más reciente.
        const patron = texto(x.patron, 200) || '*';
        if (/[\\/]/.test(patron)) throw new Error('The pattern is a file name, without folders (for example: sales*.xlsx).');
        def.patron = patron;
        def.criterio = x.criterio === 'todos' ? 'todos' : 'reciente';
        if (x.subcarpetas === true) def.subcarpetas = true;
        if (!def.formato) def.formato = formatoDe(patron);
    }
    if (tipo === 'bucket') {
        // C4: archivos en la nube (o en una carpeta con la misma forma), con
        // patrón de ruta (`**/*.parquet`) y particiones hive (`anio=2026/`).
        def.patron = texto(x.patron, 300) || null;
        if (x.hive === true) def.hive = true;
        if (!def.formato) def.formato = formatoDe(def.patron || def.ubicacion || '') || 'parquet';
    }
    if (tipo === 'lago' && formato === 'ducklake') {
        const tabla = texto(x.tabla, 200);
        if (!tabla) throw new Error('A DuckLake source needs the table to read (for example: sales or main.sales).');
        if (!/^[A-Za-z_][\w$]*(\.[A-Za-z_][\w$]*)?$/.test(tabla)) throw new Error(`Not a table name: ${tabla}`);
        def.tabla = tabla;
    }
    if (texto(x.credencial, 64)) def.credencial = texto(x.credencial, 64);
    // C6: una fuente que publica un proceso dice quién la publica; y cualquiera
    // puede pedir que se avise si su archivo tiene más de N días (6.5).
    if (x.publicada && typeof x.publicada === 'object') {
        def.publicada = { proceso: texto(x.publicada.proceso, 300) || null, proyecto: texto(x.publicada.proyecto, 300) || null };
    }
    const dias = Number(x.frescuraDias);
    if (Number.isFinite(dias) && dias > 0) def.frescuraDias = Math.min(Math.round(dias), 3650);
    if (x.excel && typeof x.excel === 'object') {
        // Hoja (o varias, unidas con _hoja), rango, encabezado, rellenar y
        // limpiar nombres: las mismas opciones que el diálogo de importar (C2).
        const e = excel.normalizarOpciones(x.excel);
        if (Object.keys(e).length) def.excel = e;
    }
    if (x.csv && typeof x.csv === 'object') {
        const c = {};
        if (texto(x.csv.delimitador, 4)) c.delimitador = texto(x.csv.delimitador, 4);
        if (x.csv.encabezado === false) c.encabezado = false;
        if (Object.keys(c).length) def.csv = c;
    }
    return def;
}

// ── Dónde viven las definiciones ────────────────────────────────────────────

function carpetaDelWorkspace(id) {
    if (!/^[\w-]{4,64}$/.test(String(id || ''))) throw new Error('Invalid workspace id.');
    return path.join(homeAmox(), 'workspaces', String(id), 'fuentes');
}

function carpetaDelProyecto(raiz) {
    return path.join(path.resolve(raiz), '.amoxsql', 'fuentes');
}

/** El id del proyecto (project.json), creándolo si no lo tenía: la ubicación local cuelga de él. */
function idDelProyecto(raiz, { crear = false } = {}) {
    const pj = scaffolder.getProjectConfig(raiz) || {};
    if (pj.id && /^[\w-]{4,64}$/.test(String(pj.id))) return String(pj.id);
    if (!crear) return null;
    const id = crypto.randomUUID();
    scaffolder.saveProjectConfig(raiz, { id });
    return id;
}

function workspaceDelProyecto(raiz) {
    const pj = scaffolder.getProjectConfig(raiz) || {};
    const id = pj.workspace && pj.workspace.id ? String(pj.workspace.id) : null;
    return id && /^[\w-]{4,64}$/.test(id) ? id : null;
}

/** El ámbito de una fuente en `fuentes_locales`: `w:<id>` o `p:<id>`. */
const ambitoDeWorkspace = (id) => `w:${id}`;
const ambitoDeProyecto = (id) => `p:${id}`;

function leerCarpeta(dir, origen) {
    const lista = [];
    let nombres = [];
    try { nombres = fs.readdirSync(dir).filter(f => /\.json$/i.test(f)); } catch { return lista; }
    for (const f of nombres.sort()) {
        const abs = path.join(dir, f);
        try {
            const def = normalizarDefinicion(JSON.parse(fs.readFileSync(abs, 'utf8')));
            if (`${def.nombre}.json` !== f) throw new Error(`The file name must be ${def.nombre}.json.`);
            lista.push({ def, origen, archivo: abs });
        } catch (e) {
            lista.push({ def: null, origen, archivo: abs, error: e.message, nombre: f.replace(/\.json$/i, '') });
        }
    }
    return lista;
}

/**
 * Las fuentes que ve un proyecto (o un workspace sin proyecto): las del
 * workspace y las del proyecto, ganando estas. Cada una dice de dónde viene.
 */
function definiciones({ raiz = null, workspaceId = null } = {}) {
    const ws = workspaceId || (raiz ? workspaceDelProyecto(raiz) : null);
    const porNombre = new Map();
    const invalidas = [];
    if (ws) {
        for (const x of leerCarpeta(carpetaDelWorkspace(ws), 'workspace')) {
            if (!x.def) { invalidas.push(x); continue; }
            porNombre.set(x.def.nombre, { ...x, ambito: ambitoDeWorkspace(ws), workspaceId: ws });
        }
    }
    if (raiz) {
        const pid = idDelProyecto(raiz);
        for (const x of leerCarpeta(carpetaDelProyecto(raiz), 'proyecto')) {
            if (!x.def) { invalidas.push(x); continue; }
            const tapa = porNombre.get(x.def.nombre);
            porNombre.set(x.def.nombre, {
                ...x, ambito: pid ? ambitoDeProyecto(pid) : null, raiz: path.resolve(raiz),
                sobrescribe: tapa ? 'workspace' : null,
            });
        }
    }
    return { fuentes: [...porNombre.values()].sort((a, b) => a.def.nombre.localeCompare(b.def.nombre)), invalidas, workspaceId: ws };
}

function rutaDeDefinicion({ raiz = null, workspaceId = null }, nombre) {
    const n = validarNombre(nombre);
    const dir = raiz ? carpetaDelProyecto(raiz) : carpetaDelWorkspace(workspaceId);
    return { dir, abs: path.join(dir, `${n}.json`) };
}

/**
 * Guarda una definición en el workspace o en el proyecto. `anterior` permite
 * renombrar: se borra el archivo viejo y su ubicación local se traslada.
 */
async function guardar(destino, definicion, { anterior = null } = {}) {
    const def = normalizarDefinicion(definicion);
    const { dir, abs } = rutaDeDefinicion(destino, def.nombre);
    if (anterior && anterior !== def.nombre) {
        if (fs.existsSync(abs)) throw new Error(`A source named "${def.nombre}" already exists.`);
        const viejo = rutaDeDefinicion(destino, anterior).abs;
        if (fs.existsSync(viejo)) fs.rmSync(viejo);
        const ambito = ambitoDe(destino, { crear: false });
        if (ambito && baseCentral.estaAbierta()) {
            await baseCentral.query(`UPDATE fuentes_locales SET nombre = $3 WHERE ambito = $1 AND nombre = $2`, [ambito, anterior, def.nombre]);
        }
    }
    fs.mkdirSync(dir, { recursive: true });
    // Sin claves vacías: el archivo lo lee y lo edita una persona.
    const limpio = Object.fromEntries(Object.entries(def).filter(([, v]) => v !== null && v !== undefined));
    fs.writeFileSync(abs, JSON.stringify(limpio, null, 2) + '\n', 'utf8');
    return def;
}

async function borrar(destino, nombre) {
    const { abs } = rutaDeDefinicion(destino, nombre);
    if (!fs.existsSync(abs)) throw new Error(`There is no source named "${nombre}" here.`);
    fs.rmSync(abs);
    const ambito = ambitoDe(destino, { crear: false });
    if (ambito && baseCentral.estaAbierta()) {
        await baseCentral.query(`DELETE FROM fuentes_locales WHERE ambito = $1 AND nombre = $2`, [ambito, nombre]);
    }
}

function ambitoDe({ raiz = null, workspaceId = null }, { crear = false } = {}) {
    if (raiz) {
        const id = idDelProyecto(raiz, { crear });
        return id ? ambitoDeProyecto(id) : null;
    }
    return workspaceId ? ambitoDeWorkspace(workspaceId) : null;
}

// ── La ubicación en esta máquina ────────────────────────────────────────────

async function ubicacionesLocales() {
    if (!baseCentral.estaAbierta()) return new Map();
    const filas = await baseCentral.query(`SELECT ambito, nombre, ubicacion, actualizada FROM fuentes_locales`);
    return new Map(filas.map(f => [`${f.ambito}\u0000${f.nombre}`, f]));
}

/** Registra dónde está la fuente en ESTA máquina. `ubicacion` null la olvida. */
async function ubicar(destino, nombre, ubicacion) {
    const n = validarNombre(nombre);
    if (!baseCentral.estaAbierta()) throw new Error('The AmoxSQL database is not open: the location cannot be saved.');
    const ambito = ambitoDe(destino, { crear: true });
    if (!ambito) throw new Error('Open a project or choose a workspace first.');
    if (!ubicacion) {
        await baseCentral.query(`DELETE FROM fuentes_locales WHERE ambito = $1 AND nombre = $2`, [ambito, n]);
        return null;
    }
    const u = String(ubicacion).trim();
    if (!REMOTA.test(u) && !path.isAbsolute(u)) throw new Error('The location on this machine must be a full path.');
    const ruta = REMOTA.test(u) ? u : path.resolve(u);
    await baseCentral.query(
        `INSERT OR REPLACE INTO fuentes_locales (ambito, nombre, ubicacion, actualizada) VALUES ($1, $2, $3, current_timestamp)`,
        [ambito, n, ruta]
    );
    return ruta;
}

/**
 * Dónde se lee una fuente aquí, y por qué:
 *   'definicion' — la definición la da para todos (una URL o una ruta absoluta
 *                  escrita a mano, que vale si existe);
 *   'relativa'   — fuente de proyecto con una ruta relativa al proyecto;
 *   'local'      — la registró esta máquina;
 *   null         — no se sabe dónde está.
 */
function resolver(item, locales) {
    const d = item.def;
    if (d.ubicacion && REMOTA.test(d.ubicacion)) return { ubicacion: d.ubicacion, como: 'definicion' };
    if (d.ubicacion && item.origen === 'proyecto' && !path.isAbsolute(d.ubicacion)) {
        return { ubicacion: path.resolve(item.raiz, d.ubicacion), como: 'relativa' };
    }
    const local = item.ambito ? locales.get(`${item.ambito}\u0000${d.nombre}`) : null;
    if (local) return { ubicacion: local.ubicacion, como: 'local', actualizada: local.actualizada };
    if (d.ubicacion && path.isAbsolute(d.ubicacion)) return { ubicacion: d.ubicacion, como: 'definicion' };
    return { ubicacion: null, como: null };
}

// ── Carpetas: el archivo que acaba de llegar (C3) ───────────────────────────
// Una carpeta sincronizada escribe un archivo en varias pasadas (Dec-14): sólo
// cuenta como llegado el que lleva unos segundos sin cambiar de tamaño ni de
// fecha, y nunca los temporales de Office (`~$…`) ni los del sincronizador.

const ESTABLE_MS = 3000;
const MAX_ARCHIVOS = 5000;
const MAX_UNIDOS = 500;
const TEMPORAL = /^[~.]|\.(tmp|temp|part|partial|crdownload|download|swp|lock)$/i;

const esTemporal = (nombre) => TEMPORAL.test(String(nombre));

/** `ventas*.xlsx` → expresión que casa el nombre entero, sin distinguir mayúsculas. */
function globARegex(patron) {
    const r = String(patron || '*').split('').map(c => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join('');
    return new RegExp(`^${r}$`, 'i');
}

/**
 * Los archivos de la carpeta que casan con el patrón, del más reciente al más
 * viejo, cada uno con `quieto` (lleva ESTABLE_MS sin cambiar). Las subcarpetas,
 * sólo si se pide, y hasta tres niveles.
 */
function archivosDeCarpeta(dir, { patron = '*', subcarpetas = false } = {}, ahora = Date.now()) {
    const re = globARegex(patron);
    const lista = [];
    const recorrer = (d, nivel) => {
        let entradas = [];
        try { entradas = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entradas) {
            if (lista.length >= MAX_ARCHIVOS) return;
            if (esTemporal(e.name)) continue;
            const abs = path.join(d, e.name);
            if (e.isDirectory()) { if (subcarpetas && nivel < 3) recorrer(abs, nivel + 1); continue; }
            if (!re.test(e.name)) continue;
            let st;
            try { st = fs.statSync(abs); } catch { continue; }
            lista.push({
                ruta: abs, nombre: path.relative(dir, abs).split(path.sep).join('/'), tamano: st.size,
                modificada: st.mtime.toISOString(), mtimeMs: st.mtimeMs,
                quieto: st.size > 0 && ahora - st.mtimeMs >= ESTABLE_MS,
            });
        }
    };
    recorrer(dir, 0);
    return lista.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** Los que se leen: el más reciente ya quieto, o todos los quietos. */
function elegidos(def, dir) {
    const todos = archivosDeCarpeta(dir, def);
    const quietos = todos.filter(a => a.quieto);
    return { todos, leidos: def.criterio === 'todos' ? quietos.slice(0, MAX_UNIDOS) : quietos.slice(0, 1) };
}

/** Lo que se sabe sin abrir el archivo: si está, cuánto ocupa, cuándo cambió. */
function estadoDe(def, ubicacion) {
    const e = estadoBase(def, ubicacion);
    // 6.5: «avisar si tiene más de N días». Se sigue leyendo; sólo se avisa.
    if (def.frescuraDias && e.modificada) {
        const dias = (Date.now() - new Date(e.modificada).getTime()) / 86400000;
        if (dias > def.frescuraDias) return { ...e, vieja: true, edadDias: Math.floor(dias) };
    }
    return e;
}

function estadoBase(def, ubicacion) {
    if (def.tipo === 'bucket' || def.tipo === 'lago') {
        if (!ubicacion) return { estado: 'sin_ubicar' };
        if (REMOTA.test(ubicacion)) return { estado: 'remota' };
        const base = ubicacion.split(/[*?]/)[0];
        return fs.existsSync(base) ? { estado: 'encontrada' } : { estado: 'no_encontrada' };
    }
    if (def.tipo !== 'carpeta') return estadoDelArchivo(ubicacion);
    if (!ubicacion) return { estado: 'sin_ubicar' };
    if (REMOTA.test(ubicacion)) return { estado: 'remota' };
    try {
        if (!fs.statSync(ubicacion).isDirectory()) return { estado: 'no_es_carpeta' };
    } catch {
        return { estado: 'no_encontrada' };
    }
    const { todos, leidos } = elegidos(def, ubicacion);
    if (!leidos.length) return { estado: todos.length ? 'llegando' : 'vacia', archivos: todos.length };
    const actual = leidos[0];
    return {
        estado: 'encontrada',
        archivos: todos.length,
        actual: { nombre: actual.nombre, tamano: actual.tamano, modificada: actual.modificada },
        modificada: actual.modificada,
        anteriores: todos.filter(a => a.ruta !== actual.ruta).slice(0, 5).map(a => ({ nombre: a.nombre, modificada: a.modificada })),
        leidos: def.criterio === 'todos' ? leidos.length : 1,
    };
}

/** Lo que se sabe sin abrir el archivo: si está, cuánto ocupa, cuándo cambió. */
function estadoDelArchivo(ubicacion) {
    if (!ubicacion) return { estado: 'sin_ubicar' };
    if (REMOTA.test(ubicacion)) return { estado: 'remota' };
    try {
        const st = fs.statSync(ubicacion);
        if (!st.isFile()) return { estado: 'no_es_archivo' };
        return { estado: 'encontrada', tamano: st.size, modificada: st.mtime.toISOString() };
    } catch {
        return { estado: 'no_encontrada' };
    }
}

// ── El SQL de lectura ───────────────────────────────────────────────────────

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const paraMotor = (u) => (REMOTA.test(u) ? u : u.split(path.sep).join('/'));

/**
 * El SELECT que lee la fuente. Para Excel, las reglas de la prueba 0.2:
 * siempre `empty_as_varchar` (el motor decide el tipo por la primera fila de
 * datos y una celda vacía ahí rompe la lectura), nunca `ignore_errors` (que
 * «arregla» eso perdiendo el texto), y un rango abierto por abajo se cierra al
 * final de la hoja con `stop_at_empty`.
 */
function sqlDeLectura(def, ubicacion) {
    if (def.tipo === 'carpeta') return sqlDeCarpeta(def, ubicacion);
    if (def.tipo === 'bucket') return sqlDeBucket(def, ubicacion);
    if (def.tipo === 'lago') return sqlDeLago(def, ubicacion);
    return sqlDeArchivo(def, ubicacion);
}

// ── Lagos y buckets (C4) ────────────────────────────────────────────────────

/** `s3://cubo/ventas/` + `**\/*.parquet` → la ruta con patrón que lee el motor. */
function rutaDeBucket(def, ubicacion) {
    const u = paraMotor(ubicacion);
    if (/[*?]/.test(u) || /\.(parquet|csv|tsv|json|jsonl|ndjson)(\.gz)?$/i.test(u)) return u;
    const patron = def.patron || (def.formato === 'csv' ? '**/*.csv' : def.formato === 'json' ? '**/*.json' : '**/*.parquet');
    return `${u.replace(/\/+$/, '')}/${patron.replace(/^\/+/, '')}`;
}

function sqlDeBucket(def, ubicacion) {
    const ruta = lit(rutaDeBucket(def, ubicacion));
    const op = ['union_by_name = true'];
    if (def.hive) op.push('hive_partitioning = true');
    if (def.formato === 'csv') return `SELECT * FROM read_csv(${ruta}, ${op.join(', ')})`;
    if (def.formato === 'json') return `SELECT * FROM read_json_auto(${ruta}, ${op.join(', ')})`;
    return `SELECT * FROM read_parquet(${ruta}, ${op.join(', ')})`;
}

/** El alias con que se adjunta un DuckLake de una fuente (sólo lectura). */
const aliasDeLago = (nombre) => `amox_lago_${String(nombre).replace(/[^a-z0-9]/g, '_')}`;

function sqlDeLago(def, ubicacion) {
    const u = lit(paraMotor(ubicacion));
    if (def.formato === 'delta') return `SELECT * FROM delta_scan(${u})`;
    if (def.formato === 'iceberg') return `SELECT * FROM iceberg_scan(${u}, allow_moved_paths = true)`;
    const [a, b] = String(def.tabla).split('.');
    return `SELECT * FROM ${aliasDeLago(def.nombre)}.${b ? `${ident(a)}.${ident(b)}` : ident(a)}`;
}

/** El prefijo al que se limita el secreto: hasta antes del primer comodín. */
function alcanceDe(ubicacion) {
    const u = String(ubicacion).split(/[*?]/)[0];
    return u.replace(/\/+$/, '');
}

/**
 * Lo que tiene que pasar en la sesión antes de crear la vista: el secreto de su
 * credencial (TEMPORAL, con SCOPE en su prefijo: dos buckets con claves
 * distintas conviven) y, para un DuckLake, adjuntarlo en sólo lectura.
 */
async function preparar(def, ubicacion) {
    const sentencias = [];
    if (def.credencial && REMOTA.test(ubicacion)) {
        const secretos = require('./secretos');
        sentencias.push(await secretos.sqlDeCredencial(def.credencial, alcanceDe(ubicacion)));
    }
    if (def.tipo === 'lago' && def.formato === 'ducklake') {
        const cat = REMOTA.test(ubicacion) || /^(sqlite|postgres|mysql):/i.test(ubicacion) ? ubicacion : paraMotor(ubicacion);
        sentencias.push(`ATTACH IF NOT EXISTS ${lit(`ducklake:${cat}`)} AS ${aliasDeLago(def.nombre)} (READ_ONLY)`);
    }
    return sentencias;
}

/** Las extensiones que necesita una fuente (para el manifiesto, 5.5). */
function extensionesDe(def, ubicacion) {
    const e = new Set();
    if (ubicacion && REMOTA.test(ubicacion)) e.add('httpfs');
    if (def.tipo === 'lago') e.add(def.formato);
    if ((def.formato || formatoDe(ubicacion || '')) === 'xlsx') e.add('excel');
    return [...e];
}

/**
 * Un error de nube o de lago, dicho para personas (5.4): qué falla —la
 * credencial, el permiso, la ruta, la extensión— y qué hacer.
 */
function explicarNube(e, def, ubicacion) {
    const m = String(e?.message || e).split('\n')[0];
    let x;
    if ((x = /Failed to download extension "?(\w+)"?/i.exec(m)) || (x = /extension "?(\w+)"? (?:is not|could not be) (?:installed|loaded)/i.exec(m))) {
        return `It needs the ${x[1]} extension, which is downloaded the first time (this needs internet). Connect and try again.`;
    }
    if (/HTTP 403|AccessDenied|Forbidden/i.test(m)) {
        return def.credencial
            ? `The credential "${def.credencial}" has no permission to read ${ubicacion}.`
            : `Reading ${ubicacion} needs a credential: choose one in the source (Settings → Credentials to add it).`;
    }
    if (/InvalidAccessKeyId|SignatureDoesNotMatch|HTTP 401|invalid.*(key|token)/i.test(m)) {
        return `The credential "${def.credencial || '?'}" was rejected: check its key id and secret.`;
    }
    if (/HTTP 404|NoSuchBucket|NoSuchKey|No files found|does not exist|not found/i.test(m)) {
        return `Nothing found at ${ubicacion}. Check the path${def.patron ? ` and the pattern (${def.patron})` : ''}.`;
    }
    if (/Could not (establish connection|connect to server|resolve)|timed out|Connection refused|Unable to connect/i.test(m)) {
        return `Cannot reach ${ubicacion}: check the network${def.credencial ? ' and the endpoint of the credential' : ''}.`;
    }
    if (/version-hint/i.test(m)) {
        return 'This Iceberg table has no version-hint file: point the source at its metadata file (…/metadata/vN.metadata.json).';
    }
    if (/is not on this machine/.test(m)) return m;
    return m.replace(/^[A-Za-z ]+ Error: /, '');
}

/**
 * Las tablas de un lago (5.3): las carpetas que son tablas Delta (tienen
 * `_delta_log/`) o Iceberg (`metadata/*.metadata.json`), y los catálogos
 * DuckLake (`*.ducklake`). En local se recorre el disco; en la nube se pregunta
 * con `glob()` (con la credencial ya preparada en `db`).
 */
async function explorar(db, ubicacion, { profundidad = 4 } = {}) {
    const tablas = new Map();
    const anotar = (ruta, formato) => {
        const r = String(ruta).replace(/[\\/]+$/, '');
        if (!tablas.has(r)) tablas.set(r, { ruta: r, formato, nombre: sugerirNombre(r.split(/[\\/]/).pop()) });
    };
    if (REMOTA.test(ubicacion)) {
        const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
        const base = ubicacion.replace(/\/+$/, '');
        for (const f of await q(`SELECT file FROM glob(${lit(`${base}/**/_delta_log/*.json`)}) LIMIT 2000`)) {
            anotar(f.file.replace(/\/_delta_log\/[^/]+$/, ''), 'delta');
        }
        for (const f of await q(`SELECT file FROM glob(${lit(`${base}/**/metadata/*.metadata.json`)}) LIMIT 2000`)) {
            anotar(f.file.replace(/\/metadata\/[^/]+$/, ''), 'iceberg');
        }
    } else {
        const recorrer = (d, nivel) => {
            let entradas = [];
            try { entradas = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
            if (entradas.some(e => e.isDirectory() && e.name === '_delta_log')) { anotar(d, 'delta'); return; }
            if (entradas.some(e => e.isDirectory() && e.name === 'metadata')) {
                try { if (fs.readdirSync(path.join(d, 'metadata')).some(n => /\.metadata\.json$/i.test(n))) { anotar(d, 'iceberg'); return; } } catch { /* no es */ }
            }
            for (const e of entradas) {
                if (e.isFile() && /\.ducklake$/i.test(e.name)) anotar(path.join(d, e.name), 'ducklake');
                else if (e.isDirectory() && nivel < profundidad && !esTemporal(e.name)) recorrer(path.join(d, e.name), nivel + 1);
            }
        };
        recorrer(ubicacion, 0);
    }
    return [...tablas.values()].sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/**
 * Una carpeta: el más reciente se lee como un archivo; todos, unidos por nombre
 * de columna con `_archivo` (el nombre de cada uno). La lista va escrita en la
 * vista: cuando llega otro, el vigilante la rehace; una ejecución de Data Flow
 * o de la línea de comandos la rehace al empezar (3.4).
 */
function sqlDeCarpeta(def, dir) {
    const { todos, leidos } = elegidos(def, dir);
    if (!leidos.length) {
        throw new Error(todos.length
            ? `the file in ${dir} is still arriving (it changed in the last seconds)`
            : `no file in ${dir} matches ${def.patron || '*'}`);
    }
    if (def.criterio !== 'todos') return sqlDeArchivo(def, leidos[0].ruta);
    return leidos
        .map(a => `SELECT *, ${lit(a.nombre)} AS _archivo FROM (${sqlDeArchivo(def, a.ruta)})`)
        .join('\nUNION ALL BY NAME\n');
}

function sqlDeArchivo(def, ubicacion) {
    const u = lit(paraMotor(ubicacion));
    const formato = def.formato || formatoDe(ubicacion);
    switch (formato) {
        case 'parquet':
            return `SELECT * FROM read_parquet(${u})`;
        case 'json':
            return `SELECT * FROM read_json_auto(${u})`;
        case 'xlsx':
            // Las reglas viven en server/excel.js, compartidas con la importación
            // y con Data Flow.
            return REMOTA.test(ubicacion)
                ? `SELECT * FROM read_xlsx(${u}, ${excel.opcionesDeLectura(def.excel || {}).join(', ')})`
                : excel.sqlDeLectura(ubicacion, def.excel || {});
        case 'csv':
        default: {
            const c = def.csv || {};
            const op = [];
            if (c.delimitador) op.push(`delim = ${lit(c.delimitador)}`);
            if (c.encabezado === false) op.push('header = false');
            return `SELECT * FROM read_csv(${u}${op.length ? ', ' + op.join(', ') : ''})`;
        }
    }
}

/**
 * Una vista que no lee nada y, al consultarla, dice por qué. El error va en el
 * WHERE y no en la columna: si fuera en la columna, `SELECT count(*)` la
 * descartaría sin evaluarla y devolvería 1 en vez de fallar.
 */
function sqlDeAviso(mensaje) {
    return `SELECT NULL::VARCHAR AS aviso WHERE error(${lit(mensaje)}) IS NULL`;
}

function avisoSinUbicar(nombre) {
    return `The source "${nombre}" has no location on this machine. Set it in the Sources panel.`;
}

// ── El catálogo ─────────────────────────────────────────────────────────────

/**
 * Monta (o pone al día) el catálogo `fuentes` en una sesión del motor. `db` es
 * cualquier cosa con `systemQuery` o `query` (un carril de dbManager, un
 * contexto aislado de Data Flow). Las vistas que ya no corresponden se quitan.
 *
 * Devuelve qué pasó con cada fuente, para que la interfaz lo enseñe.
 */
async function montar(db, { raiz = null, workspaceId = null } = {}) {
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
    await q(`ATTACH IF NOT EXISTS ':memory:' AS ${CATALOGO}`);
    const { fuentes } = (raiz || workspaceId) ? definiciones({ raiz, workspaceId }) : { fuentes: [] };
    const locales = fuentes.length ? await ubicacionesLocales().catch(() => new Map()) : new Map();

    const existentes = (await q(
        `SELECT view_name FROM duckdb_views() WHERE database_name = '${CATALOGO}' AND NOT internal`
    )).map(r => r.view_name);
    const quedan = new Set(fuentes.map(f => f.def.nombre));
    for (const v of existentes) {
        if (!quedan.has(v)) await q(`DROP VIEW IF EXISTS ${CATALOGO}.main.${ident(v)}`);
    }

    const informe = [];
    for (const item of fuentes) {
        const { def } = item;
        const vista = `${CATALOGO}.main.${ident(def.nombre)}`;
        const r = resolver(item, locales);
        let estado = 'lista';
        let error = null;
        if (!r.ubicacion) {
            estado = 'sin_ubicar';
            await q(`CREATE OR REPLACE VIEW ${vista} AS ${sqlDeAviso(avisoSinUbicar(def.nombre))}`);
        } else {
            try {
                for (const s of await preparar(def, r.ubicacion)) await q(s);
                await q(`CREATE OR REPLACE VIEW ${vista} AS ${sqlDeLectura(def, r.ubicacion)}`);
            } catch (e) {
                estado = 'error';
                // Un Excel que no es un libro (un CSV disfrazado, un .xls) dice qué
                // es; un bucket o un lago, qué falla (credencial, permiso, ruta…).
                error = (def.tipo === 'bucket' || def.tipo === 'lago')
                    ? explicarNube(e, def, r.ubicacion)
                    : def.tipo !== 'carpeta' && (def.formato || formatoDe(r.ubicacion)) === 'xlsx' && !REMOTA.test(r.ubicacion)
                        ? excel.explicar(e, r.ubicacion).message
                        : String(e?.message || e).split('\n')[0];
                await q(`CREATE OR REPLACE VIEW ${vista} AS ${sqlDeAviso(`The source "${def.nombre}" cannot be read: ${error}`)}`);
            }
        }
        if (def.descripcion) {
            try { await q(`COMMENT ON VIEW ${vista} IS ${lit(def.descripcion)}`); } catch { /* sólo es la descripción */ }
        }
        informe.push({
            nombre: def.nombre, estado, error, ubicacion: r.ubicacion, como: r.como,
            ...(def.tipo === 'carpeta' && r.ubicacion && !REMOTA.test(r.ubicacion)
                ? { carpeta: { dir: r.ubicacion, patron: def.patron, subcarpetas: !!def.subcarpetas, criterio: def.criterio } }
                : {}),
        });
    }
    return informe;
}

/**
 * La lista para la interfaz: cada fuente con su origen, su ubicación aquí y el
 * estado del archivo. No toca el motor.
 */
async function listar({ raiz = null, workspaceId = null } = {}) {
    const { fuentes, invalidas, workspaceId: ws } = definiciones({ raiz, workspaceId });
    const locales = await ubicacionesLocales().catch(() => new Map());
    return {
        workspaceId: ws,
        fuentes: fuentes.map(item => {
            const r = resolver(item, locales);
            return {
                ...item.def,
                origen: item.origen,
                sobrescribe: item.sobrescribe || null,
                ubicacionAqui: r.ubicacion,
                como: r.como,
                ...estadoDe(item.def, r.ubicacion),
            };
        }),
        invalidas: invalidas.map(x => ({ nombre: x.nombre, origen: x.origen, error: x.error })),
    };
}

/** ¿Hay en la base del proyecto un esquema que se llame como el catálogo? (Dec-10) */
async function hayEsquemaHomonimo(db) {
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
    try {
        const r = await q(`SELECT count(*)::INTEGER AS n FROM duckdb_schemas() WHERE schema_name = '${CATALOGO}' AND database_name <> '${CATALOGO}'`);
        return Number(r?.[0]?.n || 0) > 0;
    } catch {
        return false;
    }
}

/**
 * Los nombres de fuente que menciona un SQL: `fuentes."x"`, `fuentes.x` y
 * `fuentes.main."x"`. Para el manifiesto (1.6). Tosco a propósito: equivocarse
 * por exceso sólo añade un nombre que luego no se encuentra entre las fuentes.
 */
function usadas(sql) {
    const nombres = new Set();
    const re = /\bfuentes\s*\.\s*(?:main\s*\.\s*)?(?:"([^"]+)"|([a-z0-9_]+))/gi;
    let m;
    while ((m = re.exec(String(sql || ''))) !== null) {
        const n = (m[1] || m[2] || '').trim();
        if (n && n.toLowerCase() !== 'main' && NOMBRE.test(n)) nombres.add(n);
    }
    return [...nombres];
}

/**
 * Registra (o pone al día) la fuente que deja un nodo Publish (6.4): en el
 * workspace del proyecto —o en el proyecto si no tiene—, con su ubicación en
 * esta máquina. Un archivo publicado dentro del proyecto va relativo; uno en
 * un bucket, con su URL en la definición.
 */
async function registrarPublicada({ raiz, workspaceId = null, enProyecto = false }, def, ruta) {
    const destino = workspaceId && !enProyecto ? { workspaceId } : { raiz };
    const previa = definiciones(destino.raiz ? { raiz: destino.raiz } : { workspaceId }).fuentes
        .find(f => f.def.nombre === def.nombre && f.origen === (destino.raiz ? 'proyecto' : 'workspace'));
    const nueva = { ...(previa?.def || {}), ...def, tipo: 'archivo' };
    let ubicacionAqui = null;
    if (REMOTA.test(ruta)) {
        nueva.ubicacion = ruta;
    } else if (destino.raiz) {
        const rel = path.relative(destino.raiz, ruta);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) nueva.ubicacion = rel.split(path.sep).join('/');
        else { delete nueva.ubicacion; ubicacionAqui = ruta; }
    } else {
        delete nueva.ubicacion;
        ubicacionAqui = ruta;
    }
    const guardada = await guardar(destino, nueva);
    if (ubicacionAqui && baseCentral.estaAbierta()) await ubicar(destino, guardada.nombre, ubicacionAqui);
    return { fuente: guardada, en: destino.raiz ? 'proyecto' : 'workspace' };
}

module.exports = {
    registrarPublicada,
    CATALOGO, TIPOS, FORMATOS,
    validarNombre, sugerirNombre, formatoDe, normalizarDefinicion,
    carpetaDelWorkspace, carpetaDelProyecto, idDelProyecto, workspaceDelProyecto,
    definiciones, guardar, borrar, ubicar, ubicacionesLocales, resolver, estadoDelArchivo,
    sqlDeLectura, sqlDeAviso, avisoSinUbicar, montar, listar, hayEsquemaHomonimo, usadas,
    ESTABLE_MS, esTemporal, globARegex, archivosDeCarpeta, estadoDe,
    LAGOS, preparar, explicarNube, explorar, extensionesDe, aliasDeLago, rutaDeBucket, alcanceDe,
};
