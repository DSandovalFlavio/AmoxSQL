/**
 * «Upgrade the database format» (6.0, fase 3; O4).
 *
 * Una base de la 5.x (DuckDB 1.x) se abre en la 6.0 y sigue en su formato: la 5.x la
 * puede seguir abriendo (comprobado en la fase 0). Pasarla al formato de DuckDB 2 la
 * hace más chica (cadenas en DICT_FSST, borrados compactos: en la fase 3, una base con
 * borrados de 9,4 MB quedó en 6,8 MB) y abre antes las tablas anchas, pero ya no la
 * abre la 5.x ni un dbt con DuckDB 1.x. Por eso es un botón, nunca automático, y deja
 * la original como respaldo al lado.
 *
 * Cómo: `COPY FROM DATABASE` a un archivo nuevo (lo crea DuckDB 2, así que nace en su
 * formato). Comprobado en la fase 3: copia tablas, esquemas, vistas, macros, índices,
 * restricciones (PK, FK, CHECK), comentarios, secuencias (siguen donde iban) y tipos
 * ENUM. Luego la base se presta (se suelta del motor, como con dbt), la original pasa a
 * `<nombre>.before-6.duckdb`, la nueva ocupa su nombre y se vuelve a adjuntar.
 */
const fs = require('fs');
const path = require('path');
const { formatoDelArchivo, FORMATO_DE_DUCKDB_2 } = require('./lago');

class ErrorDeFormato extends Error {}

const unix = (p) => String(p).replace(/\\/g, '/');
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Lo que se sabe de la base abierta (se lee antes de adjuntarla: abierta, el motor la bloquea). */
let alAbrir = { ruta: null, formato: null };
function recordarAlAbrir(ruta) {
    alAbrir = { ruta: ruta || null, formato: ruta ? formatoDelArchivo(ruta) : null };
}

function estado(dbManager) {
    const ruta = dbManager.attachedPath;
    if (!ruta || ruta === ':memory:' || dbManager.isDuckLake) return { aplicable: false };
    const formato = alAbrir.ruta && path.resolve(alAbrir.ruta) === path.resolve(ruta) ? alAbrir.formato : null;
    let tamano = null;
    try { tamano = fs.statSync(ruta).size; } catch { /* sin tamaño */ }
    return {
        aplicable: formato !== null,
        ruta, nombre: path.basename(ruta), formato, tamano,
        anterior: formato !== null && formato < FORMATO_DE_DUCKDB_2,
        soloLectura: !!dbManager._readOnly,
    };
}

/** Un nombre libre al lado: tienda.before-6.duckdb, tienda.before-6-2.duckdb… */
function nombreDeRespaldo(ruta) {
    const dir = path.dirname(ruta);
    const base = path.basename(ruta).replace(/\.duckdb$/i, '').replace(/\.[^.]+$/, '');
    for (let i = 1; i < 100; i++) {
        const c = path.join(dir, `${base}.before-6${i > 1 ? `-${i}` : ''}.duckdb`);
        if (!fs.existsSync(c)) return c;
    }
    throw new ErrorDeFormato('There are too many backups next to the database; move some away and try again.');
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
async function renombrar(de, a) {
    // En Windows un lector que aún no soltó el archivo hace fallar el rename: se reintenta.
    for (let i = 0; ; i++) {
        try { fs.renameSync(de, a); return; } catch (e) {
            if (i >= 20 || !/EBUSY|EPERM|EACCES/.test(e.code || '')) throw e;
            await esperar(150);
        }
    }
}

/** Pasa la base abierta al formato de DuckDB 2. Devuelve { antes, despues, respaldo }. */
async function actualizar(dbManager) {
    const e = estado(dbManager);
    if (!e.aplicable) throw new ErrorDeFormato('Open a DuckDB database file to upgrade its format.');
    if (!e.anterior) throw new ErrorDeFormato(`${e.nombre} already uses the current format.`);
    if (e.soloLectura) throw new ErrorDeFormato(`${e.nombre} is open read-only: open it to write, then upgrade it.`);
    if (dbManager.prestada) throw new ErrorDeFormato('The database is in use by another tool (dbt): try again when it finishes.');

    const ruta = e.ruta;
    const temporal = path.join(path.dirname(ruta), `.${path.basename(ruta)}.amoxtmp`);
    for (const f of [temporal, `${temporal}.wal`]) try { fs.unlinkSync(f); } catch { /* no estaba */ }
    const respaldo = nombreDeRespaldo(ruta);

    // 1. La copia, con la base adjunta como siempre.
    const q = (s) => dbManager.systemQuery(s, { lane: 'main' });
    try {
        await q(`ATTACH ${lit(unix(temporal))} AS __amox_formato_nuevo`);
        await q(`COPY FROM DATABASE ${dbManager.alias} TO __amox_formato_nuevo`);
        await q('DETACH __amox_formato_nuevo');
    } catch (err) {
        await q('DETACH DATABASE IF EXISTS __amox_formato_nuevo').catch(() => {});
        for (const f of [temporal, `${temporal}.wal`]) try { fs.unlinkSync(f); } catch { /* */ }
        throw new ErrorDeFormato(`The copy could not be made, nothing was changed: ${String(err.message || err).split('\n')[0]}`);
    }
    const despues = fs.statSync(temporal).size;
    // Ahora, que está suelto: adjunto, el motor bloquea el archivo y no se lee su cabecera.
    const formatoNuevo = formatoDelArchivo(temporal);

    // 2. El cambio de archivos, con la base suelta del motor.
    await dbManager.prestar('formato');
    let movida = false;
    try {
        await renombrar(ruta, respaldo);
        movida = true;
        try { await renombrar(`${ruta}.wal`, `${respaldo}.wal`); } catch { /* sin WAL */ }
        await renombrar(temporal, ruta);
    } catch (err) {
        if (movida && !fs.existsSync(ruta)) try { await renombrar(respaldo, ruta); } catch { /* lo dice el error */ }
        await dbManager.recuperar().catch(() => {});
        throw new ErrorDeFormato(`The files could not be swapped, the database is as it was: ${err.message}`);
    }
    await dbManager.recuperar();
    alAbrir = { ruta, formato: formatoNuevo };
    return { antes: e.tamano, despues, respaldo, nombre: e.nombre, formato: formatoNuevo };
}

module.exports = { ErrorDeFormato, recordarAlAbrir, estado, actualizar, nombreDeRespaldo };
