/**
 * Running SQL: queries (cancelable, capped, in slices), notebook cells, profile and export.
 *
 * Rutas movidas de `server/index.js` (6.0, M7) sin cambiar ninguna URL. Lo que
 * comparten con el resto llega por `./compartido` (index.js lo llena antes de
 * cargar este archivo); el estado que cambia en marcha se lee como `ctx.X`.
 */

const registrador = require('../registrador');
const express = require('express');
const fs = require('fs');
const path = require('path');
const dbManager        = require('../DatabaseManager');
const secretos         = require('../secretos');
const fuentes          = require('../fuentes');
const procedencia      = require('../procedencia');
const variablesDelProyecto = require('../variables');
const aiManager = require('../AiManager');

const ctx = require('./compartido');
const {
    addAutoloadExtension, anotarExtensionDelProyecto, anotarFuentesDelSql,
    invalidateTableContextCache,
} = ctx;

const rutas = express.Router();

/**
 * Mientras dbt tiene la base del proyecto (fase 2b), lo que la lea no puede
 * correr: se dice por qué en vez de dejar que el motor diga «schema user_db
 * does not exist». Devuelve true si ya respondió.
 */
function baseOcupadaPorDbt(res) {
    const p = dbManager.prestada;
    if (!p) return false;
    const hora = new Date(p.desde).toLocaleTimeString();
    res.status(409).json({
        error: `dbt is using ${path.basename(p.ruta)} (since ${hora}). AmoxSQL released it so dbt can write; queries run again as soon as dbt finishes.`,
        ocupadaPor: p.quien,
    });
    return true;
}

const { applyRowLimit, TOPE_FILAS, TOPE_BYTES } = require('../_sqlUtils');

const { detectResultType } = require('../_sqlClassify');

// Track in-flight user queries for cancellation support
const activeQueries = new Map(); // queryId → { interrupt, cancelada, deFondo }

/**
 * Apunta una consulta cancelable y la ata a su respuesta.
 *
 * En `res` y no en `req`: en un POST, `req` se cierra en cuanto se ha leído el
 * cuerpo. Con `req` la consulta se borraba del registro nada más empezar, y Stop
 * respondía 404 sin interrumpir nada: el motor seguía ocupado hasta acabar.
 *
 * `cancelada` la mira quien está esperando su turno o convirtiendo filas, donde
 * interrumpir al motor no serviría de nada.
 */
function registrarConsulta(qid, res, { deFondo = false } = {}) {
    const registro = {
        deFondo,
        cancelada: false,
        interrupt() {
            this.cancelada = true;
            if (dbManager.isRunning('main', qid)) dbManager.interruptQuery('main');
        },
    };
    activeQueries.set(qid, registro);
    res.on('close', () => {
        if (activeQueries.get(qid) === registro && !res.writableFinished) registro.interrupt();
        activeQueries.delete(qid);
    });
    return registro;
}

/**
 * Lo que corre por su cuenta (perfil, totales de un gráfico) cede ante lo que pides.
 * Antes tu consulta esperaba detrás sin explicación: parecía que Run no funcionaba.
 */
function cancelarLoDeFondo() {
    let cuantas = 0;
    for (const r of activeQueries.values()) {
        if (r.deFondo && !r.cancelada) { r.interrupt(); cuantas++; }
    }
    return cuantas;
}

/**
 * El JSON de un resultado, a trozos. `res.json` lo escribía de una vez: el servidor
 * se quedaba sin atender a nadie, y por encima del medio GB, «Invalid string length».
 */
async function responderFilas(res, filas, resto) {
    const POR_TROZO = 5000;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.write('{"data":[');
    for (let i = 0; i < filas.length; i += POR_TROZO) {
        if (res.destroyed) return;
        const trozo = JSON.stringify(filas.slice(i, i + POR_TROZO)).slice(1, -1);
        const sigue = res.write((i > 0 ? ',' : '') + trozo);
        if (!sigue) await new Promise(r => { const fin = () => { res.off('drain', fin); res.off('close', fin); r(); }; res.on('drain', fin); res.on('close', fin); });
        else await new Promise(setImmediate);
    }
    res.end(`],${JSON.stringify(resto).slice(1)}`);
}

// ── Cloud Export (S3 / GCS via DuckDB httpfs) ──
rutas.post('/api/export/cloud', async (req, res) => {
    const { query, destination, format, provider: cloudProvider } = req.body;
    // destination: s3://bucket/path/file.parquet or gs://bucket/path/file.csv
    // format: parquet, csv, json
    // cloudProvider: s3 or gcs
    // Cloud export supports only CSV/JSON/Parquet — NOT xlsx. Validate up front so
    // an unsupported format never silently falls through to a Parquet body written
    // under a mismatched extension.
    const allowedCloudFormats = ['csv', 'parquet', 'json'];
    if (!allowedCloudFormats.includes((format || '').toLowerCase())) {
        return res.status(400).json({
            error: `Formato no soportado para export a la nube: ${format || '(vacío)'}. Usa CSV, JSON o Parquet.`,
        });
    }

    try {
        const config = aiManager.getConfig();

        // Load httpfs extension
        await dbManager.systemQuery('INSTALL httpfs; LOAD httpfs;');

        // Un secreto temporal con nombre, en vez de SET globales: antes el valor
        // iba pegado al SQL y GCS dejaba s3_endpoint apuntando a Google.
        if (cloudProvider === 's3' || cloudProvider === 'gcs') await secretos.prepararNube(dbManager, cloudProvider, config);

        // Build COPY statement
        const formatUpper = (format || 'parquet').toUpperCase();
        const copyOpts = formatUpper === 'CSV' ? "(FORMAT CSV, HEADER)" : formatUpper === 'JSON' ? "(FORMAT JSON, ARRAY true)" : "(FORMAT PARQUET)";
        const copyQuery = `COPY (${query}) TO '${String(destination).replace(/'/g, "''")}' ${copyOpts}`;

        await dbManager.systemQuery(copyQuery);
        res.json({ success: true, message: `Exported to ${destination}` });
    } catch (err) {
        registrador.error('[Cloud Export] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/export/cloud/test', async (req, res) => {
    const { provider: cloudProvider } = req.body;
    try {
        const config = aiManager.getConfig();
        await dbManager.systemQuery('INSTALL httpfs; LOAD httpfs;');

        if (cloudProvider === 's3') {
            const s3 = await secretos.prepararNube(dbManager, 's3', config);
            // Try to list a bucket
            if (s3.defaultBucket) {
                const result = await dbManager.systemQuery(`SELECT count(*) as cnt FROM glob('s3://${String(s3.defaultBucket).replace(/'/g, "''")}/*')`);
                res.json({ success: true, message: `Connected. Found files in bucket.`, count: result[0]?.cnt });
            } else {
                res.json({ success: true, message: 'Credentials set. No bucket specified for testing.' });
            }
        } else if (cloudProvider === 'gcs') {
            await secretos.prepararNube(dbManager, 'gcs', config);
            res.json({ success: true, message: 'GCS credentials configured.' });
        } else {
            res.json({ success: false, message: 'Unknown provider' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// applyRowLimit lives in ./_sqlUtils (shared with ai/tools.js execute_sql).

rutas.post('/api/query', async (req, res) => {
    const { query, queryId, limit, deFondo } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    const topeFilas = limit > 0 ? Math.min(limit, TOPE_FILAS) : TOPE_FILAS;
    const { sql: limitedSql, limited, limit: rowLimit } = applyRowLimit(query, topeFilas);

    const qid = queryId || require('crypto').randomUUID();
    // User cancellation targets ONLY the 'main' lane, and ONLY if THIS query is
    // the one currently executing there. DuckDB's interrupt flag is sticky: an
    // interrupt with nothing running kills the NEXT statement — which is why
    // opening a chart used to fail with "Interrupted!" when a previous fetch
    // had been aborted client-side (e.g. dev double-mount).
    const cedieron = deFondo ? 0 : cancelarLoDeFondo();
    const registro = registrarConsulta(qid, res, { deFondo: !!deFondo });

    // Mientras dbt tiene la base, se dice; lo que sólo lee fuentes o memoria corre.
    if (dbManager.prestada && !/^\s*(SELECT|WITH|FROM|DESCRIBE|SUMMARIZE|PRAGMA)\b[\s\S]*\bfuentes\s*\./i.test(query) && baseOcupadaPorDbt(res)) {
        activeQueries.delete(qid);
        return;
    }
    try {
        // Una consulta a una fuente justo al abrir el proyecto espera al catalogo.
        if (ctx.montandoFuentes && /\bfuentes\s*\./i.test(query)) await ctx.montandoFuentes;
        // El proyecto depende de las fuentes que nombra aunque esta vez no se
        // puedan leer (sin red, sin credencial): se anotan antes de correr.
        anotarFuentesDelSql(query);
        const start = performance.now();
        // 6.0 (M1, F3): al historial, sólo lo que se ejecuta desde el editor (`historial: true`;
        // las vistas previas, los totales de un gráfico o un deck también pasan por aquí), con el
        // texto del usuario —no el envuelto con el tope— y una vez.
        const opciones = { trackId: qid, cancelada: () => registro.cancelada, maxFilas: topeFilas + 1, maxBytes: TOPE_BYTES, ...(req.body.historial === true && !deFondo ? { historial: query } : {}) };
        let result;
        try {
            result = await dbManager.queryWithMetadata(limitedSql, opciones).catch((err) => {
                delete opciones.historial;          // un reintento no se apunta dos veces
                // Interrumpir lo de fondo justo cuando acababa deja el aviso puesto
                // y se lo lleva la siguiente: la tuya. Se repite una vez.
                if (cedieron && !registro.cancelada && /Interrupted/i.test(err.message)) {
                    return dbManager.queryWithMetadata(limitedSql, opciones);
                }
                throw err;
            });
        } catch (err) {
            // Lo poco que no admite ir de subconsulta se ejecuta tal cual; el tope
            // de filas y de tamaño sigue valiendo.
            if (!limited || /^\s*(SELECT|WITH)\b/i.test(query) || !/Parser Error|syntax error/i.test(err.message)) throw err;
            result = await dbManager.queryWithMetadata(query, opciones);
        }
        const end = performance.now();

        // Detect truncation: we fetched limit+1 rows, if we got them all it means there are more
        let rows = result.rows;
        let truncated = false;
        if (rows.length > topeFilas) {
            rows = rows.slice(0, topeFilas);
            truncated = true;
        }
        if (result.cortadoPor === 'tamano') truncated = true;

        // Invalidate table context cache if query may have changed schema
        const upperQuery = query.toUpperCase().trim();
        if (upperQuery.startsWith('CREATE') || upperQuery.startsWith('DROP') ||
            upperQuery.startsWith('ALTER') || upperQuery.startsWith('INSERT') ||
            upperQuery.startsWith('DELETE') || upperQuery.startsWith('UPDATE')) {
            invalidateTableContextCache();
        }

        // If the user activated an extension straight from the editor (a bare
        // `LOAD name;`), remember it so it survives reconnects and app restarts,
        // exactly like the Extensions panel does. Deliberately conservative:
        // only a lone LOAD of a simple identifier, never a file-path LOAD.
        try {
            const loadMatch = /^\s*LOAD\s+["']?([a-zA-Z0-9_]+)["']?\s*;?\s*$/i.exec(query);
            if (loadMatch) {
                const extName = loadMatch[1];
                if (!dbManager.getLoadedExtensions().includes(extName)) {
                    dbManager.rememberExtension(extName);
                    addAutoloadExtension(extName);
                }
                anotarExtensionDelProyecto(extName);
            }
        } catch { /* non-fatal bookkeeping */ }
        await anotarMaterializacion(query);

        // Classify the statement so the editor can decide how to render it: a
        // tabular result gets the table, a DML/DDL side-effect gets a summary
        // ("Table Created", "5 rows updated", …) instead of an empty grid.
        const { resultType, details: resultDetails } = detectResultType(query);
        let rowsAffected = null;
        if (['rows_inserted', 'rows_updated', 'rows_deleted'].includes(resultType)) {
            // DuckDB returns DML affected-row counts as a single "Count" column.
            const first = rows[0];
            const count = first?.Count ?? first?.count;
            if (count !== undefined && count !== null) rowsAffected = Number(count);
        }

        await responderFilas(res, rows, {
            types: result.types,
            executionTime: (end - start).toFixed(2),
            rowCount: rows.length,
            truncated,
            rowLimit: truncated ? rows.length : (limited ? rowLimit : null),
            topePorTamano: result.cortadoPor === 'tamano',
            queryId: qid,
            resultType,
            resultDetails,
            rowsAffected,
        });
    } catch (err) {
        if (res.headersSent) res.end();
        // 6.0: `$x` sin declarar, en palabras.
        else res.status(500).json({ error: variablesDelProyecto.explicarError(err.message) || err.message });
    } finally {
        activeQueries.delete(qid);
    }
});

/**
 * Ejecuta una celda de cuaderno: deja la vista puesta y devuelve sus filas.
 *
 * ## Por que no basta con /api/query
 *
 * Por el limite de filas. `applyRowLimit` solo recorta un texto que EMPIECE por
 * `SELECT` o `WITH`; si se mandara todo junto empezaria por `CREATE`, pasaria de
 * largo, y la celda se traeria la tabla entera al navegador sin que nadie lo
 * pidiera. Por eso llegan dos piezas: `preparacion` deja la vista y `lector`
 * —que si empieza por SELECT— trae las filas ya recortadas.
 *
 * Van en UNA llamada y no en dos porque la via es una conexion viva: entre dos
 * llamadas cabria una cancelacion, y la celda quedaria con la vista creada y sin
 * filas que ensenar.
 *
 * ## El aviso de nombre tapado
 *
 * Medido contra el motor: una vista temporal llamada `ventas` tapa a la tabla
 * real `ventas` **y tambien a `main.ventas`**; solo se escapa escribiendo el
 * catalogo entero (`memory.main.ventas`). Asi que crear la vista en silencio
 * dejaria la tabla de verdad fuera del alcance de quien escriba `FROM ventas`
 * mas abajo, sin un solo error. Se avisa ANTES de ejecutar y no se ejecuta nada
 * hasta que el aviso se acepta.
 */
rutas.post('/api/cuaderno/celda', async (req, res) => {
    const { preparacion, lector, vista, deja, limit, queryId, aceptarTapado, historial } = req.body;
    if (!lector) return res.status(400).json({ error: 'The reader query is missing' });
    if (baseOcupadaPorDbt(res)) return;

    /**
     * Cambiar de tipo: relevar lo temporal que estorbe, y SOLO si estorba.
     *
     * `CREATE OR REPLACE` sabe reemplazar una vista por otra vista, pero no una
     * vista por una tabla: responde «Existing object x is of type View, trying
     * to replace with type Table». Eso lo provoca el boton «Materializar», que
     * existe justo para cambiar de tipo.
     *
     * Y NO vale mandar siempre un `DROP` del otro tipo desde el cliente: medido
     * contra el motor, `DROP TABLE IF EXISTS` sobre una VISTA no es inofensivo,
     * falla igual. El `IF EXISTS` perdona que no haya nada, no que haya otra
     * cosa. Asi que hay que mirar QUE hay antes de tirar nada, y eso solo se
     * sabe aqui: los objetos temporales son por conexion y el catalogo vive en
     * el motor, no en el documento.
     *
     * Va calificado a `temp.main` a proposito: sin calificar, el DROP se
     * llevaria por delante la vista PERMANENTE del mismo nombre, que es de
     * quien abrio el proyecto y no vuelve al cerrar.
     */
    if (vista && (deja === 'vista' || deja === 'tabla')) {
        try {
            const nombre = String(vista).replace(/'/g, "''");
            const hay = await dbManager.systemQuery(`
                SELECT 'vista' AS tipo FROM duckdb_views()
                 WHERE temporary AND NOT internal AND lower(view_name) = lower('${nombre}')
                UNION ALL
                SELECT 'tabla' FROM duckdb_tables()
                 WHERE temporary AND lower(table_name) = lower('${nombre}')
                LIMIT 1
            `);
            if (hay.length && hay[0].tipo !== deja) {
                const id = `"${String(vista).replace(/"/g, '""')}"`;
                const que = hay[0].tipo === 'tabla' ? 'TABLE' : 'VIEW';
                await dbManager.systemQuery(`DROP ${que} IF EXISTS temp.main.${id}`);
            }
        } catch (err) {
            // Si no se puede mirar el catalogo se sigue: el CREATE dira lo suyo
            // con un error del motor, que es mejor que negarse a ejecutar.
            registrador.aviso('[cuaderno] no se pudo comprobar el tipo previo:', err.message);
        }
    }

    if (vista && !aceptarTapado) {
        try {
            const choque = await dbManager.systemQuery(`
                SELECT name, tipo FROM (
                    SELECT table_name AS name, 'tabla' AS tipo, temporary FROM duckdb_tables()
                    UNION ALL
                    SELECT view_name, 'vista', temporary FROM duckdb_views() WHERE NOT internal AND database_name <> 'fuentes'
                ) WHERE NOT temporary AND lower(name) = lower('${String(vista).replace(/'/g, "''")}')
                LIMIT 1
            `);
            if (choque.length) {
                return res.json({ tapado: { nombre: choque[0].name, tipo: choque[0].tipo } });
            }
        } catch (err) {
            // Que no se pueda mirar el catalogo no debe impedir trabajar; se
            // sigue sin el aviso, que es lo que pasaba hasta hoy de todos modos.
            registrador.aviso('[cuaderno] no se pudo comprobar el nombre:', err.message);
        }
    }

    const topeFilas = limit > 0 ? Math.min(limit, TOPE_FILAS) : TOPE_FILAS;
    const { sql: lectorLimitado, limited, limit: rowLimit } = applyRowLimit(lector, topeFilas);
    const qid = queryId || require('crypto').randomUUID();
    cancelarLoDeFondo();
    const registro = registrarConsulta(qid, res);

    try {
        const start = performance.now();
        const cancelada = () => registro.cancelada;
        // 6.0 (M1, F3): al historial, el SQL de la celda tal como lo escribió el usuario.
        const apunte = typeof historial === 'string' && historial.trim() ? { historial } : {};
        if (preparacion) await dbManager.queryWithMetadata(preparacion, { trackId: qid, cancelada, ...apunte });
        const result = await dbManager.queryWithMetadata(lectorLimitado, { trackId: qid, cancelada, maxFilas: topeFilas + 1, maxBytes: TOPE_BYTES, ...(preparacion ? {} : apunte) });
        const end = performance.now();

        let rows = result.rows;
        let truncated = false;
        if (rows.length > topeFilas) {
            rows = rows.slice(0, topeFilas);
            truncated = true;
        }
        if (result.cortadoPor === 'tamano') truncated = true;

        // La celda ha podido crear o tapar objetos: el contexto de tablas que
        // alimenta el autocompletado y a la IA deja de valer.
        if (preparacion) invalidateTableContextCache();

        await responderFilas(res, rows, {
            types: result.types,
            executionTime: (end - start).toFixed(2),
            rowCount: rows.length,
            truncated,
            rowLimit: truncated ? rows.length : (limited ? rowLimit : null),
            queryId: qid,
            vista: vista || null,
        });
    } catch (err) {
        if (res.headersSent) res.end();
        // 6.0: `$x` sin declarar, en palabras.
        else res.status(500).json({ error: variablesDelProyecto.explicarError(err.message) || err.message });
    } finally {
        activeQueries.delete(qid);
    }
});

/**
 * Las vistas y tablas temporales vivas de la sesion, con su descripcion.
 *
 * Son el equivalente al dataframe que ya existia y que la interfaz nunca conto.
 * `NOT internal` deja fuera las del propio motor.
 */
rutas.get('/api/cuaderno/vistas', async (req, res) => {
    try {
        const filas = await dbManager.systemQuery(`
            SELECT view_name AS nombre, 'vista' AS tipo, comment AS descripcion
            FROM duckdb_views() WHERE temporary AND NOT internal
            UNION ALL
            SELECT table_name, 'tabla', comment
            FROM duckdb_tables() WHERE temporary AND NOT internal
            ORDER BY nombre
        `);
        res.json(filas);
    } catch (err) {
        registrador.aviso('[cuaderno] no se pudieron listar las vistas vivas:', err.message);
        res.json([]);
    }
});

rutas.post('/api/query/cancel/:queryId', (req, res) => {
    const { queryId } = req.params;
    const entry = activeQueries.get(queryId);
    if (!entry) return res.status(404).json({ error: 'Query not found or already completed' });
    try {
        entry.interrupt();
        activeQueries.delete(queryId);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/profile', async (req, res) => {
    const { query, queryId } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    // El perfil relee la consulta entera, varias veces. Va de fondo: se cancela al
    // salir de la vista (se cierra la petición) o cuando corres otra consulta.
    const qid = queryId || require('crypto').randomUUID();
    const registro = registrarConsulta(qid, res, { deFondo: true });
    const opciones = { trackId: qid, cancelada: () => registro.cancelada };

    try {
        // Strip trailing semicolons to prevent syntax errors when nesting
        const cleanQuery = query.trim().replace(/;+$/, '');

        // 1. DuckDB SUMMARIZE for core statistics
        const profileQuery = `SUMMARIZE ${cleanQuery}`;
        const start = performance.now();
        const profileData = await dbManager.systemQuery(profileQuery, opciones);

        // 2. Fetch Global Stats
        const globalRowsQuery = `SELECT COUNT(*) as total_rows FROM (${cleanQuery}) as sq`;
        const globalDupesQuery = `SELECT COUNT(*) as duplicate_rows FROM (SELECT * FROM (${cleanQuery}) as sq GROUP BY ALL HAVING COUNT(*) > 1) as sq2`;

        // 3. Build Advanced Summary & Correlation Queries
        let advancedSelects = [];
        let numericCols = [];
        profileData.forEach(col => {
            const isNumeric = ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'TINYINT', 'SMALLINT'].some(t => col.column_type.toUpperCase().includes(t));
            const colName = col.column_name;
            const safeCol = `"${colName}"`;

            if (isNumeric) {
                numericCols.push(colName);
                advancedSelects.push(`SKEWNESS(${safeCol}) as "${colName}_skewness"`);
                advancedSelects.push(`KURTOSIS(${safeCol}) as "${colName}_kurtosis"`);
                advancedSelects.push(`COUNT(CASE WHEN ${safeCol} = 0 THEN 1 END) as "${colName}_zeros"`);
                advancedSelects.push(`COUNT(CASE WHEN ${safeCol} < 0 THEN 1 END) as "${colName}_negatives"`);
                // Outliers beyond the 1.5·IQR fences (SUMMARIZE quartiles injected as literals).
                const q25n = parseFloat(col.q25);
                const q75n = parseFloat(col.q75);
                if (!Number.isNaN(q25n) && !Number.isNaN(q75n) && q75n > q25n) {
                    const iqr = q75n - q25n;
                    const lo = q25n - 1.5 * iqr;
                    const hi = q75n + 1.5 * iqr;
                    advancedSelects.push(`COUNT(CASE WHEN ${safeCol} < ${lo} OR ${safeCol} > ${hi} THEN 1 END) as "${colName}_outliers"`);
                }
            } else {
                advancedSelects.push(`MAX(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_max_length"`);
                advancedSelects.push(`MIN(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_min_length"`);
                advancedSelects.push(`AVG(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_avg_length"`);
                // Value-based semantic hint: how many values look like an email address.
                advancedSelects.push(`COUNT(CASE WHEN CAST(${safeCol} AS VARCHAR) LIKE '%_@_%.__%' THEN 1 END) as "${colName}_emaillike"`);
                // Date span + distinct dates → range and gap detection.
                if (/DATE|TIMESTAMP/.test(col.column_type.toUpperCase())) {
                    advancedSelects.push(`DATE_DIFF('day', MIN(${safeCol}), MAX(${safeCol})) as "${colName}_dayspan"`);
                    advancedSelects.push(`COUNT(DISTINCT ${safeCol}) as "${colName}_distinctdates"`);
                }
            }
        });

        // Add correlation matrix if multiple numerics
        let corrSelects = [];
        if (numericCols.length > 1) {
            for (let i = 0; i < numericCols.length; i++) {
                for (let j = i + 1; j < numericCols.length; j++) {
                    const c1 = numericCols[i];
                    const c2 = numericCols[j];
                    corrSelects.push(`CORR("${c1}", "${c2}") as "corr_${c1}_${c2}"`);
                }
            }
        }

        let advancedQuery = '';
        if (advancedSelects.length > 0 || corrSelects.length > 0) {
            const allSelects = [...advancedSelects, ...corrSelects].join(',\n');
            advancedQuery = `SELECT \n${allSelects}\nFROM (${cleanQuery}) as subq`;
        }

        // 4. Fetch Visual Data (Histograms for numeric, Top 5 for text)
        const visualQueries = profileData.map(col => {
            const isNumeric = ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'TINYINT', 'SMALLINT'].some(t => col.column_type.toUpperCase().includes(t));
            const colName = `"${col.column_name}"`;
            // 6.0 (O5): a VARIANT's «top values» are whole objects; its keys go below.
            if (String(col.column_type).toUpperCase() === 'VARIANT') return null;

            if (isNumeric) {
                if (col.min === null || col.max === null || col.min === col.max) return null;
                const min = parseFloat(col.min);
                const max = parseFloat(col.max);
                const range = max - min;
                const binWidth = range / 5;

                return `SELECT 
                    '${col.column_name}' as col_name,
                    COUNT(CASE WHEN ${colName} >= ${min} AND ${colName} < ${min + binWidth} THEN 1 END) as b1,
                    COUNT(CASE WHEN ${colName} >= ${min + binWidth} AND ${colName} < ${min + (binWidth * 2)} THEN 1 END) as b2,
                    COUNT(CASE WHEN ${colName} >= ${min + (binWidth * 2)} AND ${colName} < ${min + (binWidth * 3)} THEN 1 END) as b3,
                    COUNT(CASE WHEN ${colName} >= ${min + (binWidth * 3)} AND ${colName} < ${min + (binWidth * 4)} THEN 1 END) as b4,
                    COUNT(CASE WHEN ${colName} >= ${min + (binWidth * 4)} AND ${colName} <= ${max} THEN 1 END) as b5
                    FROM (${cleanQuery}) as subq`;
            } else {
                return `SELECT 
                    '${col.column_name}' as col_name,
                    ${colName} as val, 
                    COUNT(*) as count 
                    FROM (${cleanQuery}) as subq 
                    WHERE ${colName} IS NOT NULL 
                    GROUP BY ${colName} 
                    ORDER BY count DESC 
                    LIMIT 5`;
            }
        }).filter(q => q !== null);

        let visuals = {};
        if (visualQueries.length > 0) {
            const visualResults = await Promise.all(visualQueries.map(q => dbManager.systemQuery(q, opciones)));
            visualResults.forEach(res => {
                if (!res || res.length === 0) return;
                const colName = res[0].col_name;
                if ('b1' in res[0]) {
                    const row = res[0];
                    visuals[colName] = { type: 'histogram', data: [Number(row.b1), Number(row.b2), Number(row.b3), Number(row.b4), Number(row.b5)] };
                } else {
                    visuals[colName] = { type: 'top', data: res.map(r => ({ value: String(r.val), count: Number(r.count) })) };
                }
            });
        }

        // 6.0 (O5): a VARIANT column — which keys its objects have, in how many rows, and
        // with which types (variant_extract needs a constant key: a second pass).
        for (const col of profileData.filter(c => String(c.column_type).toUpperCase() === 'VARIANT')) {
            try {
                const c = `"${String(col.column_name).replace(/"/g, '""')}"`;
                const claves = await dbManager.systemQuery(
                    `SELECT k, count(*) AS n FROM (SELECT unnest(variant_keys(${c})) AS k FROM (${cleanQuery}) AS subq WHERE variant_type(${c}) = 'OBJECT') GROUP BY k ORDER BY n DESC, k LIMIT 30`, opciones);
                if (!claves.length) continue;
                const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
                const tiposSql = claves.map((r, i) => `list(DISTINCT variant_type(variant_extract(${c}, ${lit(r.k)}))) FILTER (WHERE variant_type(variant_extract(${c}, ${lit(r.k)})) IS NOT NULL) AS t${i}`).join(', ');
                const tipos = (await dbManager.systemQuery(`SELECT ${tiposSql} FROM (${cleanQuery}) AS subq WHERE variant_type(${c}) = 'OBJECT'`, opciones))[0] || {};
                visuals[col.column_name] = {
                    type: 'keys',
                    data: claves.map((r, i) => ({ value: r.k, count: Number(r.n), tipos: (tipos[`t${i}`] || []).map(String).sort() })),
                };
            } catch { /* sin claves: se queda con lo general */ }
        }

        // 5. Execute Global & Advanced queries in parallel
        const parallelExecutions = [
            dbManager.systemQuery(globalRowsQuery, opciones),
            dbManager.systemQuery(globalDupesQuery, opciones)
        ];
        if (advancedQuery) {
            parallelExecutions.push(dbManager.systemQuery(advancedQuery, opciones));
        }

        const parallelResults = await Promise.all(parallelExecutions);

        const totalRows = parallelResults[0][0]?.total_rows || 0;
        const duplicateRows = parallelResults[1][0]?.duplicate_rows || 0;
        const advancedStats = advancedQuery ? parallelResults[2][0] : {};

        // Candidate composite key: if no single column is unique, test whether the two
        // highest-cardinality columns together form a unique key (one cheap extra query).
        let candidateKey = null;
        try {
            const tr = Number(totalRows);
            const singleKey = profileData.some((c) => tr > 0 && parseInt(c.approx_unique) >= tr * 0.999);
            if (!singleKey && Number(duplicateRows) === 0 && profileData.length >= 2 && tr > 0) {
                const top2 = [...profileData].sort((a, b) => parseInt(b.approx_unique) - parseInt(a.approx_unique)).slice(0, 2);
                const c1 = top2[0].column_name;
                const c2 = top2[1].column_name;
                const r = await dbManager.systemQuery(`SELECT (COUNT(*) = COUNT(DISTINCT (CAST("${c1}" AS VARCHAR), CAST("${c2}" AS VARCHAR)))) as is_key FROM (${cleanQuery}) __amox_ck`, opciones);
                const v = r[0]?.is_key;
                if (v === true || v === 1 || String(v).toLowerCase() === 'true') candidateKey = [c1, c2];
            }
        } catch (e) { /* candidate-key detection is best-effort */ }

        // Process Correlational Matrix
        let correlations = [];
        if (corrSelects.length > 0 && advancedStats) {
            for (let i = 0; i < numericCols.length; i++) {
                for (let j = i + 1; j < numericCols.length; j++) {
                    const c1 = numericCols[i];
                    const c2 = numericCols[j];
                    const key = `corr_${c1}_${c2}`;
                    if (advancedStats[key] !== undefined && advancedStats[key] !== null) {
                        correlations.push({ col1: c1, col2: c2, score: advancedStats[key] });
                    }
                }
            }
        }

        const end = performance.now();

        res.json({
            profile: profileData,
            visuals: visuals,
            advanced: advancedStats,
            global: {
                totalRows: Number(totalRows),
                duplicateRows: Number(duplicateRows)
            },
            candidateKey: candidateKey,
            correlations: correlations,
            executionTime: (end - start).toFixed(2)
        });
    } catch (err) {
        if (registro.cancelada) res.json({ cancelada: true });
        else res.status(500).json({ error: err.message });
    } finally {
        activeQueries.delete(qid);
    }
});

/* --- Data Export API (DuckDB COPY TO) --- */
rutas.post('/api/export-data', async (req, res) => {
    const { query, format, filename } = req.body;
    if (!query || !format || !filename) {
        return res.status(400).json({ error: 'query, format, and filename are required' });
    }

    const allowedFormats = ['csv', 'parquet', 'xlsx'];
    if (!allowedFormats.includes(format)) {
        return res.status(400).json({ error: `Unsupported format: ${format}. Use: ${allowedFormats.join(', ')}` });
    }

    // Security: ensure the resolved export path stays within the project root.
    // path.join + resolve prevents path traversal (e.g. "../../../etc/passwd").
    const resolvedRoot = path.resolve(ctx.ROOT_DIR);
    const fullPath = path.resolve(path.join(ctx.ROOT_DIR, filename)).replace(/\\/g, '/');
    if (!fullPath.startsWith(resolvedRoot.replace(/\\/g, '/'))) {
        return res.status(400).json({ error: 'Export path must be within the project directory.' });
    }
    const cleanQuery = query.trim().replace(/;+$/, '');

    try {
        let copyFormat;
        if (format === 'csv') copyFormat = "CSV";
        else if (format === 'parquet') copyFormat = "PARQUET";
        else if (format === 'xlsx') {
            try {
                // 5.11 (D3): the workbook is written by AmoxSQL, formatted from
                // the column types (dates, decimals, bold fixed header, filter,
                // widths). On the user's connection — the query may read a
                // notebook's temp views — and out of the query history.
                const { escribirLibro } = require('../xlsxEscribir');
                const usuario = { query: (sql) => dbManager.systemQuery(sql) };
                const nombre = path.basename(fullPath).replace(/\.xlsx$/i, '');
                const r = await escribirLibro(usuario, fullPath, [{ nombre, consulta: cleanQuery }]);
                return res.json({ success: true, path: filename, rowCount: r.hojas[0].filas });
            } catch (xlsxErr) {
                return res.status(500).json({ error: `Excel export failed: ${xlsxErr.message}` });
            }
        }

        // Count rows first
        const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM (${cleanQuery}) t`);
        const rowCount = countResult[0]?.cnt || 0;

        // Execute COPY TO (Parquet doesn't accept HEADER)
        const copyOptions = format === 'csv' ? "(HEADER, DELIMITER ',')" : "(FORMAT PARQUET)";
        await dbManager.query(`COPY (${cleanQuery}) TO '${fullPath}' ${copyOptions}`);

        res.json({ success: true, path: filename, rowCount });
    } catch (err) {
        registrador.error("Export data failed:", err);
        res.status(500).json({ error: err.message });
    }
});

/* --- Notebook State Persistence API --- */
rutas.get('/api/notebook-state', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ctx.ROOT_DIR, filePath);
    const statePath = fullPath + '.state.json';

    try {
        if (!fs.existsSync(statePath)) return res.json(null);
        const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        res.json(data);
    } catch (err) {
        registrador.aviso('Failed to read notebook state:', err.message);
        res.json(null);
    }
});

rutas.post('/api/notebook-state', async (req, res) => {
    const { path: filePath, state } = req.body;
    if (!filePath || !state) return res.status(400).json({ error: 'Path and state are required' });

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ctx.ROOT_DIR, filePath);
    const statePath = fullPath + '.state.json';

    try {
        // Async write: sidecar state can carry MBs of cached results
        await fs.promises.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        registrador.error('Failed to write notebook state:', err.message);
        res.status(500).json({ error: 'Failed to write state', details: err.message });
    }
});

/**
 * `CREATE TABLE x AS … fuentes."y" …` desde el editor: la tabla x guarda que
 * viene de la fuente y, y de qué archivo era entonces (C5, 4.1). Sólo si lee
 * UNA fuente: con varias, o mezclada con tablas, no hay un origen que contar.
 */
const CREA_TABLA = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)\s+AS\b/i;

async function anotarMaterializacion(sql) {
    if (!ctx.PROYECTO_ABIERTO) return;
    try {
        const m = CREA_TABLA.exec(String(sql || ''));
        if (!m) return;
        const usadas = fuentes.usadas(sql);
        if (usadas.length !== 1) return;
        const f = (await fuentes.listar({ raiz: ctx.ROOT_DIR })).fuentes.find(x => x.nombre === usadas[0]);
        if (!f) return;
        const archivos = f.tipo === 'carpeta'
            ? (f.actual && f.ubicacionAqui ? [path.join(f.ubicacionAqui, f.actual.nombre)] : [])
            : (f.ubicacionAqui && !/^[a-z][a-z0-9+.-]+:\/\//i.test(f.ubicacionAqui) ? [f.ubicacionAqui] : []);
        await procedencia.anotar(dbManager, m[1], {
            origen: 'fuente', fuente: f.nombre, archivos,
            hoja: f.excel?.hoja || null, hojas: f.excel?.hojas || null, rango: f.excel?.rango || null,
        });
    } catch (e) { registrador.aviso('[Procedencia] Materialización sin anotar:', e.message); }
}

module.exports = rutas;
