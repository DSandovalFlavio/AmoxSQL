/**
 * Lo que dice cada tabla y cada columna (5.12, fase 5; I5, Dec-30).
 *
 * Hasta la 5.11 AmoxSQL sólo leía los comentarios de tabla que llevan su marca de
 * procedencia (C5); un comentario normal —el que escribe dbt con `persist_docs`, o
 * uno puesto a mano con COMMENT ON— no se enseñaba. Ahora:
 *   1. los comentarios del motor: tablas, vistas y columnas (sin la procedencia, que
 *      tiene su propia línea);
 *   2. si el proyecto es de dbt y la base adjunta es la de su target, lo que no
 *      tenga comentario se toma del `manifest.json` (un proyecto sin persist_docs).
 * El explorador lo enseña y el asistente lo recibe con el esquema.
 */
const fs = require('fs');
const path = require('path');
const { MARCA } = require('./procedencia');
const esquemas = require('./esquemas');

const unaLinea = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/**
 * { 'esquema.tabla': { descripcion, columnas: { col: descripcion }, de: 'base'|'dbt' } }
 * para la base en uso (la del carril que se pasa).
 */
async function deLaBase(db, { raiz = null, attachedPath = null } = {}) {
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql, { lane: 'meta' }) : db.query(sql));
    const r = {};
    const entrada = (k) => r[k] || (r[k] = { descripcion: null, columnas: {}, de: 'base' });
    const [tablas, vistas, columnas] = await Promise.all([
        // El esquema con su ruta (`ventas.crudo`), como lo enseña el explorador (esquemas.js).
        q(`SELECT table_schema AS s, table_name AS t, table_comment AS c FROM ${esquemas.TABLAS} AS x WHERE table_catalog = current_database() AND table_comment IS NOT NULL AND table_comment <> ''`).catch(() => []),
        Promise.resolve([]),
        q(`SELECT table_schema AS s, table_name AS t, column_name AS col, column_comment AS c FROM ${esquemas.COLUMNAS} AS x WHERE table_catalog = current_database() AND column_comment IS NOT NULL AND column_comment <> ''`).catch(() => []),
    ]);
    for (const f of [...tablas, ...vistas]) {
        if (String(f.c).includes(MARCA)) continue;          // la procedencia va aparte
        entrada(`${f.s}.${f.t}`).descripcion = unaLinea(f.c);
    }
    for (const f of columnas) entrada(`${f.s}.${f.t}`).columnas[f.col] = unaLinea(f.c);

    // Del manifiesto de dbt, para lo que la base no dice.
    if (raiz && attachedPath && fs.existsSync(path.join(raiz, 'dbt_project.yml'))) {
        try {
            const dbtConvivir = require('./dbtConvivir');
            const dbtProyecto = require('./dbt/proyecto');
            const resultados = require('./dbt/resultados');
            const t = dbtProyecto.targets(raiz);
            const base = dbtConvivir.basesDelPerfil(raiz, { target: t.activo })[0];
            if (base && path.resolve(base).toLowerCase() === path.resolve(attachedPath).toLowerCase()) {
                const m = resultados.manifiesto(raiz);
                for (const n of [...Object.values(m?.nodes || {}), ...Object.values(m?.sources || {})]) {
                    if (!['model', 'seed', 'snapshot', 'source'].includes(n.resource_type) || !n.schema) continue;
                    const k = `${n.schema}.${n.alias || n.identifier || n.name}`;
                    const desc = unaLinea(n.description);
                    const cols = Object.values(n.columns || {}).filter(c => c.description);
                    if (!desc && !cols.length) continue;
                    const e = entrada(k);
                    if (!e.descripcion && desc) { e.descripcion = desc; e.de = 'dbt'; }
                    for (const c of cols) if (!e.columnas[c.name]) e.columnas[c.name] = unaLinea(c.description);
                }
            }
        } catch { /* sin manifiesto: sólo la base */ }
    }
    return r;
}

module.exports = { deLaBase };
