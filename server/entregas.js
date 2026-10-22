/**
 * La entrega anterior (5.14, F3; Dec-52).
 *
 * Cuando un nodo Excel, Export File o Publish va a escribir encima de un archivo
 * que ya existe, el que había se copia a `<proyecto>/.amoxsql/entregas/<clave>/`
 * antes de escribir. Se guardan las **5 últimas** de cada archivo y ninguna de
 * más de 200 MB; viven fuera de git (la carpeta `.amoxsql/entregas/` no viaja en
 * un paquete) y nunca se guarda un archivo remoto.
 *
 * Después, **Compare with the previous one** lee los dos con el motor y dice qué
 * filas aparecen, desaparecen o cambian por una columna clave.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAXIMO = 5;
const TOPE = 200 * 1024 * 1024;
const REMOTO = /^[a-z][a-z0-9+.-]*:\/\//i;
const LEIBLES = /\.(xlsx|xlsm|csv|tsv|txt|parquet|json|jsonl|ndjson)$/i;

const carpetaDe = (proyecto) => path.join(proyecto, '.amoxsql', 'entregas');

/**
 * La carpeta de las copias de un archivo: su nombre y un trozo del hash de su
 * ruta completa (dos `ventas.xlsx` en carpetas distintas no se pisan).
 */
function claveDe(ruta) {
    const abs = path.resolve(ruta);
    const h = crypto.createHash('sha1').update(abs.toLowerCase()).digest('hex').slice(0, 8);
    return `${path.basename(abs).replace(/[^\w.-]+/g, '_')}-${h}`;
}

function leerIndice(dir) {
    try { return JSON.parse(fs.readFileSync(path.join(dir, 'indice.json'), 'utf8')); } catch { return null; }
}
function escribirIndice(dir, indice) {
    fs.writeFileSync(path.join(dir, 'indice.json'), JSON.stringify(indice, null, 2));
}

const sello = (d) => d.toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');

/**
 * Copia el archivo que está a punto de reemplazarse. Devuelve la copia hecha
 * (`{ archivo, ruta, escrita, bytes }`) o `null` si no había nada que guardar:
 * no existe, es remoto, es una carpeta (salida particionada) o pasa del tope.
 */
function guardarAnterior(proyecto, destino) {
    if (!proyecto || !destino || REMOTO.test(destino)) return null;
    let st;
    try { st = fs.statSync(destino); } catch { return null; }
    if (!st.isFile()) return null;
    if (st.size > TOPE) return { omitida: 'more than 200 MB' };
    const dir = path.join(carpetaDe(proyecto), claveDe(destino));
    fs.mkdirSync(dir, { recursive: true });
    // Las copias no son del repositorio: la carpeta se ignora sola.
    const ignorar = path.join(carpetaDe(proyecto), '.gitignore');
    if (!fs.existsSync(ignorar)) fs.writeFileSync(ignorar, '*\n');
    const ext = path.extname(destino);
    let archivo = `${sello(st.mtime)}${ext}`;
    for (let i = 2; fs.existsSync(path.join(dir, archivo)); i++) archivo = `${sello(st.mtime)}-${i}${ext}`;
    // Guardar la copia nunca impide entregar: un archivo que otro programa tiene
    // abierto no se copia, y la escritura dirá ella misma quién lo tiene.
    try {
        fs.copyFileSync(destino, path.join(dir, archivo));
    } catch (e) {
        try { fs.unlinkSync(path.join(dir, archivo)); } catch { /* no llegó a crearse */ }
        if (!leerIndice(dir)) fs.rmSync(dir, { recursive: true, force: true });
        return { omitida: /EBUSY|EPERM|EACCES/.test(e.code || '') ? 'it was in use' : e.message };
    }
    const indice = leerIndice(dir) || { ruta: path.resolve(destino), copias: [] };
    indice.ruta = path.resolve(destino);
    const copia = { archivo, escrita: st.mtime.toISOString(), guardada: new Date().toISOString(), bytes: st.size };
    indice.copias.unshift(copia);
    // La poda: las 5 últimas.
    for (const vieja of indice.copias.splice(MAXIMO)) {
        try { fs.unlinkSync(path.join(dir, vieja.archivo)); } catch { /* ya no estaba */ }
    }
    escribirIndice(dir, indice);
    return { ...copia, ruta: path.join(dir, archivo) };
}

/** Si la escritura falló, la copia recién hecha sobra: el archivo sigue siendo el de antes. */
function descartar(proyecto, destino, copia) {
    if (!copia?.archivo) return;
    const dir = path.join(carpetaDe(proyecto), claveDe(destino));
    try { fs.unlinkSync(path.join(dir, copia.archivo)); } catch { /* nada */ }
    const indice = leerIndice(dir);
    if (indice) {
        indice.copias = indice.copias.filter(c => c.archivo !== copia.archivo);
        if (indice.copias.length) escribirIndice(dir, indice);
        else fs.rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Guarda la anterior, escribe, y si escribir falla deshace la copia. `escribir`
 * es la escritura del nodo; lo que devuelve se devuelve.
 */
async function conAnterior(proyecto, destino, escribir) {
    const copia = guardarAnterior(proyecto, destino);
    try {
        const r = await escribir();
        return { r, copia };
    } catch (e) {
        descartar(proyecto, destino, copia);
        throw e;
    }
}

/** Para el resumen del paso: lo que se dice de la copia. */
const paraResumen = (copia) => (copia?.archivo ? { archivo: copia.archivo, escrita: copia.escrita, ruta: copia.ruta } : copia?.omitida ? { omitida: copia.omitida } : null);

/** Las copias guardadas de un archivo, la más nueva primero. */
function listar(proyecto, destino) {
    const dir = path.join(carpetaDe(proyecto), claveDe(destino));
    const indice = leerIndice(dir);
    if (!indice) return [];
    return indice.copias
        .filter(c => fs.existsSync(path.join(dir, c.archivo)))
        .map(c => ({ ...c, ruta: path.join(dir, c.archivo) }));
}

/**
 * Desde una copia guardada, su archivo y las demás copias. Sólo vale una ruta
 * dentro de una carpeta `.amoxsql/entregas/` (lo que llega del cliente no abre
 * cualquier archivo como «copia»).
 */
function deCopia(rutaCopia) {
    const abs = path.resolve(String(rutaCopia || ''));
    const dir = path.dirname(abs);
    if (path.basename(path.dirname(dir)) !== 'entregas' || path.basename(path.dirname(path.dirname(dir))) !== '.amoxsql') {
        throw new Error('That is not a saved delivery.');
    }
    const indice = leerIndice(dir);
    if (!indice || !indice.copias.some(c => c.archivo === path.basename(abs))) throw new Error('That saved delivery is no longer there.');
    let actual = null;
    try { const st = fs.statSync(indice.ruta); actual = { ruta: indice.ruta, escrita: st.mtime.toISOString(), bytes: st.size }; } catch { /* ya no está */ }
    return {
        ruta: indice.ruta, actual,
        copias: indice.copias.filter(c => fs.existsSync(path.join(dir, c.archivo))).map(c => ({ ...c, ruta: path.join(dir, c.archivo) })),
    };
}

// ── Comparar ────────────────────────────────────────────────────────────────

const lit = (s) => `'${String(s).replace(/\\/g, '/').replace(/'/g, "''")}'`;
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

/** El SELECT que lee un archivo entregado; un Excel, su primera hoja. */
function lectura(ruta) {
    if (REMOTO.test(ruta)) throw new Error('A remote file is not compared.');
    if (!LEIBLES.test(ruta)) throw new Error(`${path.basename(ruta)}: this kind of file cannot be compared.`);
    if (!fs.existsSync(ruta)) throw new Error(`${path.basename(ruta)} is no longer there.`);
    if (/\.xls[xm]$/i.test(ruta)) return require('./excel').sqlDeLectura(ruta, {});
    if (/\.parquet$/i.test(ruta)) return `SELECT * FROM read_parquet(${lit(ruta)})`;
    if (/\.(json|jsonl|ndjson)$/i.test(ruta)) return `SELECT * FROM read_json_auto(${lit(ruta)})`;
    return `SELECT * FROM read_csv(${lit(ruta)}, header = true, all_varchar = true)`;
}

/**
 * Compara dos archivos por una o varias columnas clave. Sin clave, compara filas
 * enteras (aparecen y desaparecen; «cambiar» necesita saber qué fila es cuál).
 * Las columnas se comparan como texto: un número que pasó a decimal no es una
 * fila nueva. Devuelve recuentos y una muestra de cada grupo.
 */
async function comparar(dbManager, { actual, anterior, clave = [], muestra = 50 }) {
    const qa = lectura(actual);
    const qb = lectura(anterior);
    const describir = async (q) => (await dbManager.query(`DESCRIBE ${q}`)).map(f => ({ nombre: f.column_name, tipo: String(f.column_type) }));
    const [da, db] = await Promise.all([describir(qa), describir(qb)]);
    const ca = da.map(c => c.nombre);
    const cb = db.map(c => c.nombre);
    // Un Excel guarda todo número como decimal: 2 se lee 2.0. Comparado como
    // texto, el entero se dice sin el «.0» (en los dos lados por igual).
    const decimal = new Set([...da, ...db].filter(c => /^(DOUBLE|FLOAT|REAL)$/i.test(c.tipo)).map(c => c.nombre));
    const comunes = ca.filter(c => cb.includes(c));
    const anadidas = ca.filter(c => !cb.includes(c));
    const quitadas = cb.filter(c => !ca.includes(c));
    const claves = (Array.isArray(clave) ? clave : [clave]).filter(c => comunes.includes(c));
    if (!comunes.length) throw new Error('The two files have no column in common.');

    const texto = (alias) => comunes.map(c => (decimal.has(c)
        ? `regexp_replace(CAST(${alias}.${ident(c)} AS VARCHAR), '\\.0$', '') AS ${ident(c)}`
        : `CAST(${alias}.${ident(c)} AS VARCHAR) AS ${ident(c)}`)).join(', ');
    const base = `WITH a AS (SELECT ${texto('x')} FROM (${qa}) x), b AS (SELECT ${texto('y')} FROM (${qb}) y)`;
    const filas = async (sql) => (await dbManager.query(sql)).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
    const cuenta = async (sql) => Number((await dbManager.query(`${base} SELECT count(*) AS n FROM (${sql})`))[0].n);
    const [totalActual, totalAnterior] = await Promise.all([cuenta('SELECT * FROM a'), cuenta('SELECT * FROM b')]);

    if (!claves.length) {
        const nuevas = 'SELECT * FROM a EXCEPT ALL SELECT * FROM b';
        const idas = 'SELECT * FROM b EXCEPT ALL SELECT * FROM a';
        return {
            columnas: { comunes, anadidas, quitadas }, clave: [], filas: { actual: totalActual, anterior: totalAnterior },
            aparecen: { n: await cuenta(nuevas), muestra: await filas(`${base} ${nuevas} LIMIT ${muestra}`) },
            desaparecen: { n: await cuenta(idas), muestra: await filas(`${base} ${idas} LIMIT ${muestra}`) },
            cambian: null,
        };
    }

    const k = claves.map(ident).join(', ');
    const union = claves.map(c => `a.${ident(c)} IS NOT DISTINCT FROM b.${ident(c)}`).join(' AND ');
    const resto = comunes.filter(c => !claves.includes(c));
    // Una clave repetida no identifica una fila: se dice, y se compara igual.
    const repetidas = Number((await dbManager.query(`${base} SELECT count(*) AS n FROM (SELECT ${k} FROM a GROUP BY ${k} HAVING count(*) > 1)`))[0].n);
    const nuevas = `SELECT a.* FROM a ANTI JOIN b ON ${union}`;
    const idas = `SELECT b.* FROM b ANTI JOIN a ON ${union}`;
    const distinto = resto.length ? resto.map(c => `a.${ident(c)} IS DISTINCT FROM b.${ident(c)}`).join(' OR ') : 'false';
    const cambiadas = `SELECT ${claves.map(c => `a.${ident(c)}`).join(', ')}, ${resto.length ? resto.map(c => `b.${ident(c)} AS ${ident(`${c} (before)`)}, a.${ident(c)} AS ${ident(c)}`).join(', ') : '1 AS _'} FROM a JOIN b ON ${union} WHERE ${distinto}`;
    const muestraCambios = await filas(`${base} ${cambiadas} LIMIT ${muestra}`);
    // En cada fila cambiada, qué columnas cambiaron (para resaltarlas).
    for (const f of muestraCambios) {
        f.__cambiaron = resto.filter(c => String(f[c] ?? '') !== String(f[`${c} (before)`] ?? '') || (f[c] == null) !== (f[`${c} (before)`] == null));
    }
    return {
        columnas: { comunes, anadidas, quitadas }, clave: claves, filas: { actual: totalActual, anterior: totalAnterior }, repetidas,
        aparecen: { n: await cuenta(nuevas), muestra: await filas(`${base} ${nuevas} LIMIT ${muestra}`) },
        desaparecen: { n: await cuenta(idas), muestra: await filas(`${base} ${idas} LIMIT ${muestra}`) },
        cambian: { n: await cuenta(cambiadas), muestra: muestraCambios },
    };
}

/**
 * Una columna que sirva de clave: la primera cuyos valores no se repiten en el
 * archivo actual (y no son nulos). Si ninguna, ninguna.
 */
async function claveSugerida(dbManager, ruta) {
    const q = lectura(ruta);
    const cols = (await dbManager.query(`DESCRIBE ${q}`)).map(f => f.column_name).slice(0, 12);
    for (const c of cols) {
        const [r] = await dbManager.query(`SELECT count(*) AS n, count(DISTINCT ${ident(c)}) AS d, count(${ident(c)}) AS nn FROM (${q})`);
        if (Number(r.n) > 0 && Number(r.d) === Number(r.n) && Number(r.nn) === Number(r.n)) return c;
    }
    return null;
}

module.exports = { guardarAnterior, descartar, conAnterior, paraResumen, listar, deCopia, comparar, claveSugerida, claveDe, MAXIMO, TOPE };
