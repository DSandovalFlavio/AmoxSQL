/**
 * Publicar un archivo (C6, fase 6 del plan de la 5.10).
 *
 * El puente entre quien prepara los datos y quien los usa: un proceso de Data
 * Flow deja un Parquet en una carpeta (o un bucket) y lo registra como fuente
 * con nombre del workspace, así que cualquier otro proyecto lo lee por su
 * nombre. Tres garantías:
 *
 *   1. Nadie lee nunca medio archivo (Dec-13). Se escribe `.<nombre>.amoxtmp`
 *      en la MISMA carpeta y se renombra al final: en el mismo volumen el
 *      renombrado es atómico. En Windows cualquier proceso con el destino
 *      abierto impide reemplazarlo —también un lector que lo comparte todo
 *      (prueba 0.4)—, así que reintentar es el camino normal, no el raro.
 *   2. Lo publicado lleva dentro su esquema y su fecha (Dec-12), en
 *      `KV_METADATA`: quien lo consume en otra máquina no necesita nada más.
 *   3. Un esquema roto no se publica (6.3). Si desaparece una columna o cambia
 *      de tipo respecto a lo ya publicado, se para y el archivo anterior queda
 *      intacto. Añadir columnas se permite. Una opción lo baja a aviso.
 *
 * CSV se admite como salida sin esa garantía: no tiene dónde guardar los
 * metadatos (§7.4), y del anterior sólo se comparan los nombres de columna.
 */
const fs = require('fs');
const path = require('path');

const REMOTA = /^(s3|gs|gcs|r2|az|azure|abfss|https?):\/\//i;
const ESPERAS_MS = [100, 200, 400, 800, 1600, 2400];   // ~5,5 s en total

class ErrorDePublicacion extends Error {
    constructor(codigo, mensaje, extra = {}) {
        super(mensaje);
        this.codigo = codigo;
        Object.assign(this, extra);
    }
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const paraMotor = (r) => (REMOTA.test(r) ? r : String(r).split(path.sep).join('/'));

/**
 * Lo ya publicado en `destino`: su esquema (del propio archivo) y sus
 * metadatos. null si no hay nada todavía.
 */
async function anterior(q, destino, formato) {
    if (!REMOTA.test(destino) && !fs.existsSync(destino)) return null;
    const u = lit(paraMotor(destino));
    try {
        const lector = formato === 'csv' ? `read_csv(${u})` : `read_parquet(${u})`;
        const columnas = (await q(`DESCRIBE SELECT * FROM ${lector}`)).map(c => ({ nombre: c.column_name, tipo: c.column_type }));
        let meta = {};
        if (formato !== 'csv') {
            for (const f of await q(`SELECT decode(key) AS k, decode(value) AS v FROM parquet_kv_metadata(${u})`)) meta[f.k] = f.v;
        }
        return { columnas, meta };
    } catch (e) {
        // Remoto y todavía no existe: no hay anterior. Otro error, se dice.
        if (/No files found|HTTP 404|NoSuchKey|does not exist/i.test(String(e.message))) return null;
        throw e;
    }
}

/** Lo que rompe a quien ya lo lee: columnas que se van o cambian de tipo. */
function roturas(antes, ahora, { soloNombres = false } = {}) {
    const nuevo = new Map(ahora.map(c => [c.nombre, c.tipo]));
    const r = [];
    for (const c of antes) {
        if (!nuevo.has(c.nombre)) r.push({ columna: c.nombre, que: 'removed' });
        else if (!soloNombres && nuevo.get(c.nombre) !== c.tipo) r.push({ columna: c.nombre, que: `type ${c.tipo} → ${nuevo.get(c.nombre)}` });
    }
    return r;
}

/** Office deja `~$<nombre>` junto a lo que tiene abierto, con el usuario dentro. */
function quienLoTiene(destino) {
    const dir = path.dirname(destino);
    const base = path.basename(destino);
    for (const n of [`~$${base}`, `~$${base.slice(2)}`]) {
        const p = path.join(dir, n);
        try {
            const b = fs.readFileSync(p);
            const largo = b[0];
            const quien = b.subarray(1, 1 + largo).toString('latin1').replace(/\0/g, '').trim();
            if (quien) return quien;
        } catch { /* no hay */ }
    }
    return null;
}

async function renombrarConReintentos(temporal, destino) {
    let ultimo = null;
    for (let i = 0; i <= ESPERAS_MS.length; i++) {
        try {
            fs.renameSync(temporal, destino);
            return i;      // cuántos reintentos hicieron falta
        } catch (e) {
            ultimo = e;
            if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i === ESPERAS_MS.length) break;
            await new Promise(r => setTimeout(r, ESPERAS_MS[i]));
        }
    }
    try { fs.rmSync(temporal, { force: true }); } catch { /* ya no está */ }
    const quien = quienLoTiene(destino);
    throw new ErrorDePublicacion('ocupado',
        `${path.basename(destino)} could not be replaced: ${quien ? `${quien} has it open` : 'another program has it open'}. ` +
        'Close it and run the process again; the published file was left as it was.',
        { causa: ultimo?.code });
}

/**
 * Publica `consulta` (un SELECT) en `destino`.
 * @returns {{ ruta, filas, columnas, avisos, reintentos }}
 */
async function publicar(db, { consulta, destino, formato = 'parquet', metadatos = {}, esquemaRoto = 'detener' }) {
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
    if (!['parquet', 'csv'].includes(formato)) throw new ErrorDePublicacion('formato', `Publishing writes Parquet (or CSV without the schema guarantee), not ${formato}.`);

    const columnas = (await q(`DESCRIBE ${consulta}`)).map(c => ({ nombre: c.column_name, tipo: c.column_type }));
    const filas = Number((await q(`SELECT count(*) AS n FROM (${consulta})`))?.[0]?.n || 0);

    // 6.3 — antes de escribir nada: ¿rompe a quien ya lo lee? Si otro programa
    // tiene el destino abierto en exclusiva, ni siquiera se puede leer: se
    // reintenta como el renombrado y, si sigue, se dice quién lo tiene.
    const avisos = [];
    let antes = null;
    for (let i = 0; ; i++) {
        try {
            antes = await anterior(q, destino, formato);
            break;
        } catch (e) {
            const bloqueado = /being used by another process|EBUSY|resource busy|locked/i.test(String(e.message));
            if (!bloqueado) throw e;
            if (i === ESPERAS_MS.length) {
                const quien = quienLoTiene(destino);
                throw new ErrorDePublicacion('ocupado',
                    `${path.basename(destino)} could not be replaced: ${quien ? `${quien} has it open` : 'another program has it open'}. ` +
                    'Close it and run the process again; the published file was left as it was.');
            }
            await new Promise(r => setTimeout(r, ESPERAS_MS[i]));
        }
    }
    if (antes) {
        const rotas = roturas(antes.columnas, columnas, { soloNombres: formato === 'csv' });
        if (rotas.length) {
            const texto = rotas.map(r => `${r.columna} (${r.que})`).join(', ');
            if (esquemaRoto !== 'avisar') {
                throw new ErrorDePublicacion('esquema',
                    `The schema changed in a way that breaks whoever reads it: ${texto}. Nothing was published; the previous file is intact. ` +
                    'If the change is intended, set the node to warn instead of stop.',
                    { rotas });
            }
            avisos.push(`Schema changed: ${texto}`);
        }
    }

    const meta = {
        'amoxsql.publicado': new Date().toISOString(),
        'amoxsql.filas': String(filas),
        'amoxsql.esquema': JSON.stringify(columnas),
        ...Object.fromEntries(Object.entries(metadatos).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [`amoxsql.${k}`, String(v)])),
    };
    const kv = `{${Object.entries(meta).map(([k, v]) => `${lit(k)}: ${lit(v)}`).join(', ')}}`;
    const opciones = formato === 'csv' ? 'FORMAT csv, HEADER' : `FORMAT parquet, KV_METADATA ${kv}`;

    if (REMOTA.test(destino)) {
        // En un bucket cada objeto se sustituye de una vez: no hay medio archivo
        // que leer, y no hay renombrado que hacer.
        await q(`COPY (${consulta}) TO ${lit(destino)} (${opciones})`);
        return { ruta: destino, filas, columnas, avisos, reintentos: 0 };
    }

    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const temporal = path.join(path.dirname(destino), `.${path.basename(destino)}.amoxtmp`);
    try {
        await q(`COPY (${consulta}) TO ${lit(paraMotor(temporal))} (${opciones})`);
    } catch (e) {
        try { fs.rmSync(temporal, { force: true }); } catch { /* no llegó a existir */ }
        throw e;
    }
    const reintentos = await renombrarConReintentos(temporal, destino);
    return { ruta: destino, filas, columnas, avisos, reintentos };
}

/** Lo que lleva dentro un archivo publicado (6.5): fecha, proceso, workspace, filas, esquema. */
async function leerPublicacion(db, ruta) {
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
    const meta = {};
    for (const f of await q(`SELECT decode(key) AS k, decode(value) AS v FROM parquet_kv_metadata(${lit(paraMotor(ruta))})`)) {
        if (String(f.k).startsWith('amoxsql.')) meta[f.k.slice(8)] = f.v;
    }
    if (!Object.keys(meta).length) return null;
    try { meta.esquema = JSON.parse(meta.esquema); } catch { /* texto */ }
    if (meta.filas !== undefined) meta.filas = Number(meta.filas);
    return meta;
}

module.exports = { ErrorDePublicacion, publicar, leerPublicacion, roturas, quienLoTiene, ESPERAS_MS };
