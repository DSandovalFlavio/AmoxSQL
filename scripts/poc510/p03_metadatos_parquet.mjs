/**
 * Prueba de concepto 0.3 de la 5.10 (Dec-12, fase 6 · C6).
 *
 * ¿Lo que se publica puede llevar dentro su esquema, su fecha y de donde salio?
 * `COPY … (FORMAT parquet, KV_METADATA {…})` y `parquet_kv_metadata()`.
 *
 *   node scripts/poc510/p03_metadatos_parquet.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { DuckDBInstance } = require('@duckdb/node-api');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-poc03-'));
const ruta = (n) => path.join(dir, n).split(path.sep).join('/');

const resultados = [];
const anota = (pregunta, ok, detalle = '') => {
    resultados.push({ pregunta, ok });
    console.log(`${ok ? 'SI ' : 'NO '} ${pregunta}${detalle ? `  — ${detalle}` : ''}`);
};

const inst = await DuckDBInstance.create(':memory:');
const c = await inst.connect();
const filas = async (sql) => (await c.runAndReadAll(sql)).getRowObjectsJson();
const intenta = async (sql) => {
    try { return { ok: true, filas: await filas(sql) }; }
    catch (e) { return { ok: false, error: String(e.message || e).split('\n')[0] }; }
};
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

await c.run(`CREATE TABLE ventas AS SELECT 'Norte' AS tienda, 10.5::DECIMAL(10,2) AS importe, DATE '2026-09-21' AS fecha`);
const esquema = await filas(`SELECT column_name AS nombre, column_type AS tipo FROM (DESCRIBE ventas)`);

const meta = {
    'amoxsql.fuente': 'ventas-semanales',
    'amoxsql.publicado': '2026-10-01T18:00:00Z',
    'amoxsql.proceso': 'semanal.sqlchain',
    'amoxsql.workspace': 'Cliente Ñandú & Cía',          // acentos, ñ, ampersand
    'amoxsql.esquema': JSON.stringify(esquema),          // JSON con comillas dobles
    'amoxsql.nota': "con 'comillas' simples",
};
const kv = '{' + Object.entries(meta).map(([k, v]) => `${lit(k)}: ${lit(v)}`).join(', ') + '}';

// --- Escribir y leer
{
    let r = await intenta(`COPY ventas TO '${ruta('ventas.parquet')}' (FORMAT parquet, KV_METADATA ${kv})`);
    anota('COPY con KV_METADATA escribe', r.ok, r.error);
    r = await intenta(`SELECT decode(key) AS k, decode(value) AS v FROM parquet_kv_metadata('${ruta('ventas.parquet')}')`);
    const leido = r.ok ? Object.fromEntries(r.filas.map(f => [f.k, f.v])) : {};
    anota('parquet_kv_metadata devuelve las claves', r.ok && Object.keys(meta).every(k => k in leido), r.error || Object.keys(leido).join(', '));
    anota('los valores vuelven identicos (acentos, ñ, comillas, JSON)', Object.keys(meta).every(k => leido[k] === meta[k]),
        Object.keys(meta).filter(k => leido[k] !== meta[k]).join(', '));
    anota('el esquema se reconstruye del JSON', JSON.stringify(JSON.parse(leido['amoxsql.esquema'] || '[]')) === JSON.stringify(esquema));

    // Leer los datos no se entera de los metadatos
    r = await intenta(`SELECT count(*)::INT AS n FROM '${ruta('ventas.parquet')}'`);
    anota('el archivo se lee normal', r.ok && r.filas[0].n === 1, r.error);

    // Leer solo los metadatos de un archivo no lee los datos: se mide con uno grande
    await c.run(`COPY (SELECT range AS id, md5(range::VARCHAR) AS h FROM range(3000000)) TO '${ruta('grande.parquet')}' (FORMAT parquet, KV_METADATA ${kv})`);
    const t0 = performance.now();
    r = await intenta(`SELECT count(*)::INT AS n FROM parquet_kv_metadata('${ruta('grande.parquet')}')`);
    const ms = performance.now() - t0;
    const mb = fs.statSync(ruta('grande.parquet').split('/').join(path.sep)).size / 1e6;
    anota('leer los metadatos de un archivo grande es inmediato', r.ok && ms < 200, `${ms.toFixed(1)} ms sobre ${mb.toFixed(0)} MB`);
}

// --- Tamaño: un esquema ancho (400 columnas) y un valor de 1 MB
{
    const cols = Array.from({ length: 400 }, (_, i) => ({ nombre: `columna_con_nombre_largo_${i}`, tipo: 'DECIMAL(18,4)' }));
    const grande = JSON.stringify(cols);
    let r = await intenta(`COPY ventas TO '${ruta('ancho.parquet')}' (FORMAT parquet, KV_METADATA {'amoxsql.esquema': ${lit(grande)}})`);
    r = r.ok ? await intenta(`SELECT octet_length(value)::INT AS n FROM parquet_kv_metadata('${ruta('ancho.parquet')}') WHERE decode(key) = 'amoxsql.esquema'`) : r;
    anota('un esquema de 400 columnas cabe', r.ok && r.filas[0].n === Buffer.byteLength(grande), r.ok ? `${r.filas[0].n} bytes` : r.error);

    const mega = 'x'.repeat(1024 * 1024);
    r = await intenta(`COPY ventas TO '${ruta('mega.parquet')}' (FORMAT parquet, KV_METADATA {'amoxsql.nota': ${lit(mega)}})`);
    r = r.ok ? await intenta(`SELECT octet_length(value)::INT AS n FROM parquet_kv_metadata('${ruta('mega.parquet')}')`) : r;
    anota('un valor de 1 MB cabe (no se necesita, pero no hay un limite cercano)', r.ok && r.filas[0].n === mega.length, r.ok ? `${r.filas[0].n} bytes` : r.error);
}

// --- Un Parquet sin metadatos y uno de varios archivos (glob)
{
    await c.run(`COPY ventas TO '${ruta('sin.parquet')}' (FORMAT parquet)`);
    let r = await intenta(`SELECT count(*)::INT AS n FROM parquet_kv_metadata('${ruta('sin.parquet')}') WHERE decode(key) LIKE 'amoxsql.%'`);
    anota('un Parquet ajeno no trae claves amoxsql (se distingue)', r.ok && r.filas[0].n === 0, r.error);
    r = await intenta(`SELECT file_name, decode(value) AS v FROM parquet_kv_metadata('${ruta('*.parquet')}') WHERE decode(key) = 'amoxsql.fuente'`);
    anota('con un patron, cada archivo dice sus metadatos (file_name)', r.ok && r.filas.length >= 2, r.ok ? `${r.filas.length} archivos con fuente` : r.error);
}

// --- CSV: no tiene donde guardarlos (por eso la garantia es solo Parquet, Dec-12 / §7.4)
{
    const r = await intenta(`COPY ventas TO '${ruta('ventas.csv')}' (FORMAT csv, KV_METADATA {'a': 'b'})`);
    anota('CSV no admite KV_METADATA (la garantia de esquema es solo Parquet)', !r.ok, r.error);
}

fs.rmSync(dir, { recursive: true, force: true });
const fallos = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} como se esperaba`);
process.exit(fallos ? 1 : 0);
