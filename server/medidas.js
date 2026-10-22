/**
 * Las medidas del workspace, usables (5.13, E1 reducida; Dec-41).
 *
 * Una medida de `metrics.yml` («revenue: SUM(amount) FILTER (WHERE status =
 * 'paid')») se convierte en una macro del motor con las columnas que usa como
 * parámetros: `revenue(amount, status)`. Se escribe igual en cualquier proyecto
 * del workspace, en el editor, un cuaderno o Data Flow, y da lo mismo.
 *
 * Probado en la fase 0.1 (`scripts/poc513/p00_medidas.mjs`):
 *   - una macro SIN parámetros no ve las columnas de quien la llama;
 *   - con las columnas como parámetros, sí, agrupada o no;
 *   - una macro TEMPORAL llamada como una función del motor (`sum`) la tapa en
 *     toda la sesión: un nombre que ya es una función nunca se crea;
 *   - las TEMPORALES son de cada conexión: el gestor de la base las vuelve a crear
 *     en cada carril (`ponerSesion`). Nunca se escriben en la base del usuario.
 *
 * Las medidas salen del workspace (`<home>/workspaces/<id>/contexto/metrics.yml`)
 * y del proyecto (`context/metrics.yml`, la carpeta que lee el asistente); por
 * nombre, gana el proyecto.
 * Una medida puede decir sus columnas a mano (`columns: [importe, estado]`) si la
 * extracción automática no basta.
 */
const fs = require('fs');
const path = require('path');
const { parseMetrics } = require('./ai/contextLoader');
const { workspaceDelProyecto } = require('./ai/capaWorkspace');

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Dónde están los metrics.yml de un proyecto (y de su workspace). */
function archivos(raiz) {
    const out = [];
    const ws = raiz ? workspaceDelProyecto(raiz) : null;
    if (ws) out.push({ origen: 'workspace', ruta: path.join(ws.dir, 'contexto', 'metrics.yml'), nombreWs: ws.nombre });
    // La carpeta `context/` del proyecto (la que crea el andamiaje y lee el asistente).
    if (raiz) out.push({ origen: 'proyecto', ruta: path.join(raiz, 'context', 'metrics.yml') });
    return out;
}

/** Una firma de los archivos (ruta y fecha), para saber si hay que volver a leer. */
function firma(raiz) {
    return archivos(raiz).map(a => { try { return `${a.ruta}@${fs.statSync(a.ruta).mtimeMs}`; } catch { return `${a.ruta}@-`; } }).join('|');
}

/** Las medidas del workspace y del proyecto, por nombre (gana el proyecto). */
function leer(raiz) {
    const porNombre = new Map();
    for (const a of archivos(raiz)) {
        let texto;
        try { texto = fs.readFileSync(a.ruta, 'utf8'); } catch { continue; }
        for (const m of parseMetrics(texto)) porNombre.set(m.name, { ...m, origen: a.origen, nombreWs: a.nombreWs || null });
    }
    return [...porNombre.values()];
}

/**
 * Las columnas de la expresión de una medida, en orden de aparición: los
 * identificadores que no son palabras del motor, ni funciones (seguidos de «(»),
 * ni tipos tras `::` o `AS`, ni lo que va entre comillas simples.
 */
function columnasDe(sql, reservadas) {
    const limpio = String(sql).replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, ' ');
    const out = [];
    const re = /"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$]*)(\s*\()?/g;
    let m, previo = '';
    while ((m = re.exec(limpio))) {
        if (m[1] !== undefined) { out.push(m[1].replace(/""/g, '"')); previo = ''; continue; }
        const id = m[2];
        const trasTipo = /::\s*$/.test(limpio.slice(0, m.index)) || /^as$/i.test(previo);
        if (!m[3] && !trasTipo && !reservadas.has(id.toLowerCase())) out.push(id);
        previo = id;
    }
    return [...new Set(out)];
}

let reservadasCache = null;
async function reservadasDe(q) {
    if (!reservadasCache) reservadasCache = new Set((await q(`SELECT lower(keyword_name) AS k FROM duckdb_keywords()`)).map(r => r.k));
    return reservadasCache;
}

/**
 * Prepara las medidas de un proyecto: la macro de cada una o por qué no.
 * `q` ejecuta SQL en una conexión (se usa para compilar cada macro y quitarla:
 * así una que no compila se sabe aquí y no al usarla).
 *
 * @returns {{ medidas: [{ nombre, columnas, sql, descripcion, origen, estado: 'lista'|'saltada', motivo?, llamada }], sentencias: string[] }}
 */
async function preparar(q, raiz) {
    const reservadas = await reservadasDe(q);
    const crudas = leer(raiz);
    const medidas = [];
    const sentencias = [];
    for (const m of crudas) {
        const nombre = String(m.name || '').trim();
        const base = { nombre, sql: m.sql, descripcion: m.description || '', origen: m.origen, nombreWs: m.nombreWs, grano: m.grain || null, tabla: m.table || null };
        const saltar = (motivo, columnas = []) => medidas.push({ ...base, columnas, estado: 'saltada', motivo });
        if (!IDENT.test(nombre)) { saltar('The name must be letters, digits and _ (it becomes a function).'); continue; }
        const columnas = Array.isArray(m.columns) && m.columns.length ? m.columns : columnasDe(m.sql, reservadas);
        // Un nombre que ya es una función (del motor o de una extensión) nunca:
        // una macro temporal la taparía en toda la sesión (fase 0.1).
        const ya = await q(`SELECT count(*)::INTEGER AS n FROM duckdb_functions() WHERE lower(function_name) = lower(${lit(nombre)}) AND NOT (function_type = 'macro' AND database_name = 'temp')`).catch(() => [{ n: 0 }]);
        if (Number(ya?.[0]?.n) > 0) { saltar(`"${nombre}" is already a function of the engine: give the measure another name.`, columnas); continue; }
        const sentencia = `CREATE OR REPLACE TEMP MACRO ${ident(nombre)}(${columnas.map(ident).join(', ')}) AS ${m.sql}`;
        try {
            await q(sentencia);
            await q(`DROP MACRO IF EXISTS temp.main.${ident(nombre)}`);
        } catch (e) {
            saltar(String(e.message || e).split('\n')[0].replace(/^[A-Za-z ]+ Error: /, ''), columnas);
            continue;
        }
        medidas.push({ ...base, columnas, estado: 'lista', llamada: `${nombre}(${columnas.map(c => (IDENT.test(c) ? c : ident(c))).join(', ')})` });
        sentencias.push(sentencia);
    }
    return { medidas, sentencias };
}

/**
 * Las medidas del proyecto en la sesión de AmoxSQL: en cada carril del gestor
 * de la base, también los que se creen después. Devuelve el informe.
 */
async function montar(dbManager, raiz) {
    const q = (sql) => dbManager.systemQuery(sql, { lane: 'meta' });
    // Las de antes se quitan (una medida borrada o renombrada no se queda).
    const anteriores = estado.medidas.filter(m => m.estado === 'lista').map(m => `DROP MACRO IF EXISTS temp.main.${ident(m.nombre)}`);
    for (const s of anteriores) await q(s).catch(() => {});
    const r = raiz ? await preparar(q, raiz) : { medidas: [], sentencias: [] };
    await dbManager.ponerSesion('medidas', [...anteriores, ...r.sentencias]);
    estado = { raiz, firma: raiz ? firma(raiz) : '', medidas: r.medidas, en: new Date().toISOString() };
    return r.medidas;
}

let estado = { raiz: null, firma: '', medidas: [], en: null };

/** El informe de lo montado; si los archivos cambiaron, se vuelve a montar. */
async function actuales(dbManager, raiz) {
    if (raiz && (estado.raiz !== raiz || estado.firma !== firma(raiz))) await montar(dbManager, raiz);
    return estado.medidas;
}

/** Para un contexto aislado (una ejecución de Data Flow): una sola conexión. */
async function enContexto(ctx, raiz) {
    if (!raiz) return [];
    const q = (sql) => ctx.query(sql);
    const r = await preparar(q, raiz);
    for (const s of r.sentencias) await q(s).catch(() => {});
    return r.medidas;
}

/** La llamada de una medida montada (`revenue(amount, status)`), o null. */
function llamadaDe(nombre) {
    return estado.medidas.find(m => m.nombre === nombre && m.estado === 'lista')?.llamada || null;
}

module.exports = { leer, columnasDe, preparar, montar, actuales, enContexto, firma, archivos, llamadaDe };
