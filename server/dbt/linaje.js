/**
 * Resultados en el linaje (5.12, fase 4; I3).
 *
 * `run_results.json` sólo trae los nodos del ÚLTIMO comando: tras un «dbt run --select x»
 * el resto no tendría estado. Así que cada ejecución acumula el último estado de cada
 * nodo en `target/amox_ultimos.json` (está en `target/`, que no va a git), y el linaje
 * pinta cada modelo con cómo le fue la última vez que corrió, cuánto tardó y cuándo.
 *
 * Las filas las cuenta AmoxSQL (dbt-duckdb no las da, fase 0.2): de las tablas, no de
 * las vistas (contar una vista es correrla). Y un test que falla lleva a sus filas: con
 * `store_failures` dbt las deja en una tabla (fase 0.2), que se consulta como la vista
 * previa de un modelo.
 */
const fs = require('fs');
const path = require('path');
const resultados = require('./resultados');
const modelo = require('./modelo');
const dbtProyecto = require('./proyecto');
const dbtConvivir = require('../dbtConvivir');
const { crearInstancia } = require('../motor');

const archivoUltimos = (raiz) => path.join(resultados.carpetaTarget(raiz), 'amox_ultimos.json');
const unix = (p) => String(p || '').replace(/\\/g, '/');
const igual = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function ultimos(raiz) {
    try { return JSON.parse(fs.readFileSync(archivoUltimos(raiz), 'utf8')); } catch { return { nodos: {} }; }
}

/** Suma los resultados de una ejecución a los últimos conocidos de cada nodo. */
function acumular(raiz, res, { comando = null, cuando = new Date() } = {}) {
    if (!res?.nodos?.length) return;
    const u = ultimos(raiz);
    for (const n of res.nodos) {
        u.nodos[n.id] = { estado: n.estado, segundos: n.segundos, fallos: n.fallos, mensaje: n.mensaje ? String(n.mensaje).slice(0, 500) : null, cuando: new Date(cuando).toISOString(), comando };
    }
    u.actualizado = new Date(cuando).toISOString();
    try {
        fs.mkdirSync(path.dirname(archivoUltimos(raiz)), { recursive: true });
        fs.writeFileSync(archivoUltimos(raiz), JSON.stringify(u));
    } catch { /* sin target/: nada que recordar */ }
}

// Las filas de las tablas, recordadas por la fecha del archivo de la base.
const filasPorBase = new Map();
async function contarFilas(raiz, tablas, { dbManager = null } = {}) {
    if (!tablas.length) return {};
    const t = dbtProyecto.targets(raiz);
    const base = dbtConvivir.basesDelPerfil(raiz, { target: t.activo })[0] || null;
    if (!base || !fs.existsSync(base)) return {};
    const adjunta = !!(dbManager?.attachedPath && igual(dbManager.attachedPath, base));
    let mtime = 0;
    try { mtime = fs.statSync(base).mtimeMs; } catch { /* sigue */ }
    const clave = `${base}|${mtime}|${tablas.map(x => x.id).join(',')}`;
    if (filasPorBase.has(clave)) return filasPorBase.get(clave);
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const contar = (catalogo, x) => `SELECT '${x.id.replace(/'/g, "''")}' AS id, count(*)::BIGINT AS n FROM ${q(catalogo)}.${q(x.schema)}.${q(x.alias)}`;
    const out = {};
    const leer = (filas) => { for (const f of filas || []) out[f.id] = Number(f.n); };
    // De una en una: una que no exista (aún no construida) no tapa a las demás.
    if (adjunta) {
        for (const x of tablas) {
            try { leer(await dbManager.systemQuery(contar(dbManager.alias || 'user_db', x), { lane: 'meta' })); } catch { /* sin construir */ }
        }
    } else {
        let inst = null, con = null;
        try {
            const catalogo = tablas[0].database || path.basename(base).replace(/\.[^.]+$/, '');
            inst = await crearInstancia(':memory:');
            con = await inst.connect();
            await con.run(`ATTACH '${unix(base).replace(/'/g, "''")}' AS "${String(catalogo).replace(/"/g, '""')}" (READ_ONLY)`);
            for (const x of tablas) {
                try { leer(await (await con.run(contar(catalogo, x))).getRowObjectsJson()); } catch { /* sin construir */ }
            }
        } catch { /* dbt la tiene abierta: sin filas esta vez */ } finally {
            try { con?.closeSync(); inst?.closeSync(); } catch { /* ya cerrada */ }
        }
    }
    filasPorBase.set(clave, out);
    return out;
}

const TABLAS = new Set(['table', 'incremental', 'seed', 'snapshot']);

/**
 * Lo que el linaje pinta encima del manifiesto:
 *   nodos: { id: { estado, segundos, cuando, mensaje, filas } }
 *   tests: { idDelModelo: { total, fallan, avisan, lista: [{ id, nombre, estado, fallos, filas: bool }] } }
 *   lentos: los ids de los 3 nodos más lentos (de más de un segundo)
 */
async function paraElLinaje(raiz, { dbManager = null } = {}) {
    const m = resultados.manifiesto(raiz);
    const u = ultimos(raiz);
    const nodos = {};
    const tests = {};
    for (const [id, r] of Object.entries(u.nodos || {})) {
        const n = m?.nodes?.[id];
        if (!n) continue;
        if (n.resource_type === 'test') {
            const de = n.attached_node || n.depends_on?.nodes?.find(d => d.startsWith('model.') || d.startsWith('seed.') || d.startsWith('snapshot.'));
            if (!de) continue;
            const t = tests[de] || (tests[de] = { total: 0, fallan: 0, avisan: 0, lista: [] });
            t.total++;
            if (['fail', 'error'].includes(r.estado)) t.fallan++;
            if (r.estado === 'warn') t.avisan++;
            t.lista.push({ id, nombre: n.name, estado: r.estado, fallos: r.fallos, filas: !!(n.relation_name && ['fail', 'warn'].includes(r.estado)), mensaje: r.mensaje });
            continue;
        }
        nodos[id] = { estado: r.estado, segundos: r.segundos, cuando: r.cuando, mensaje: ['error', 'fail'].includes(r.estado) ? r.mensaje : null };
    }
    // Las filas de las tablas que terminaron bien.
    const tablas = Object.entries(nodos)
        .filter(([id, r]) => r.estado === 'success' && TABLAS.has(m?.nodes?.[id]?.config?.materialized || m?.nodes?.[id]?.resource_type))
        .map(([id]) => ({ id, schema: m.nodes[id].schema, alias: m.nodes[id].alias || m.nodes[id].name, database: m.nodes[id].database }));
    const filas = await contarFilas(raiz, tablas, { dbManager }).catch(() => ({}));
    for (const [id, n] of Object.entries(filas)) if (nodos[id]) nodos[id].filas = n;
    const lentos = Object.entries(nodos).filter(([, r]) => (r.segundos || 0) >= 1).sort((a, b) => b[1].segundos - a[1].segundos).slice(0, 3).map(([id]) => id);
    return { actualizado: u.actualizado || null, nodos, tests, lentos };
}

/** El SQL de las filas que rompen un test (store_failures), listo para AmoxSQL. */
async function filasDeTest(raiz, idTest, { dbManager }) {
    const m = resultados.manifiesto(raiz);
    const n = m?.nodes?.[idTest];
    if (!n || n.resource_type !== 'test') throw new Error('That test is not in the project.');
    if (!n.relation_name) throw new Error(`dbt did not keep the failing rows of ${n.name}: add «+store_failures: true» under data_tests in dbt_project.yml and run the tests again.`);
    const p = await modelo.paraAmox(raiz, `select * from ${n.relation_name}`, n.database, { dbManager, queFalta: 'Run the tests first.' });
    return { sql: p.sql, nombre: n.name };
}

module.exports = { acumular, ultimos, paraElLinaje, filasDeTest, contarFilas };
