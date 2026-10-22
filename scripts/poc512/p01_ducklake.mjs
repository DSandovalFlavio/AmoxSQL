/**
 * Fase 0.5 de la 5.12: DuckLake en el motor de AmoxSQL (1.5.6).
 *
 *     node scripts/poc512/p01_ducklake.mjs
 *
 * Crear un lago con catálogo local (DuckDB y SQLite), escribir en tres versiones,
 * listarlas, consultar «como estaba» por versión y por fecha, compactar, expirar y
 * limpiar archivos; y qué dice cada función, para la interfaz (Dec-33).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { DuckDBInstance } = require(require.resolve('@duckdb/node-api', { paths: [RAIZ] }));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-poc512-lago-'));
const anota = (t, ok, d = '') => console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${d}` : ''}`);
const dato = (t, d) => console.log(`··  ${t}: ${d}`);
const fwd = (p) => p.replace(/\\/g, '/');
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const archivosDe = (d) => { let n = 0, b = 0; const rec = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const f = path.join(x, e.name); if (e.isDirectory()) rec(f); else { n++; b += fs.statSync(f).size; } } }; if (fs.existsSync(d)) rec(d); return { n, b }; };

const inst = await DuckDBInstance.create(':memory:');
const con = await inst.connect();
const q = async (sql) => (await con.run(sql)).getRowObjectsJson();
const intenta = async (t, sql) => { try { const r = await q(sql); anota(t, true, JSON.stringify(r).slice(0, 260)); return r; } catch (e) { anota(t, false, e.message.split('\n')[0]); return null; } };

try {
    await q('INSTALL ducklake; LOAD ducklake');
    dato('versión del motor', (await q('SELECT version() AS v'))[0].v);
    for (const [nombre, catalogo] of [['duckdb', `ducklake:${fwd(path.join(T, 'lago.ducklake'))}`], ['sqlite', `ducklake:sqlite:${fwd(path.join(T, 'lago_sqlite.db'))}`]]) {
        console.log(`\n— catálogo ${nombre}`);
        const datos = path.join(T, `datos_${nombre}`);
        if (nombre === 'sqlite') { try { await q('INSTALL sqlite; LOAD sqlite'); } catch (e) { anota('sqlite', false, e.message); continue; } }
        const r = await intenta(`crear el lago (${nombre})`, `ATTACH '${catalogo}' AS l_${nombre} (DATA_PATH '${fwd(datos)}/')`);
        if (!r) continue;
        const L = `l_${nombre}`;
        await q(`CREATE TABLE ${L}.ventas (id INTEGER, tienda VARCHAR, importe DOUBLE)`);
        await q(`INSERT INTO ${L}.ventas VALUES (1,'norte',10),(2,'sur',20)`);
        const t1 = new Date(); await espera(1200);
        await q(`INSERT INTO ${L}.ventas VALUES (3,'este',30)`);
        await espera(200);
        await q(`UPDATE ${L}.ventas SET importe = 99 WHERE id = 1`);
        for (let k = 0; k < 6; k++) await q(`INSERT INTO ${L}.ventas SELECT ${1000 * (k + 1)} + i, 'oeste', i FROM range(5000) t(i)`);
        const snaps = await intenta('listar versiones: <lago>.snapshots()', `SELECT snapshot_id, snapshot_time, changes FROM ${L}.snapshots() ORDER BY snapshot_id`);
        if (snaps) dato('columnas de snapshots()', Object.keys(snaps[0] || {}).join(', '));
        await intenta('listar versiones: ducklake_snapshots(\'lago\')', `SELECT count(*) AS n FROM ducklake_snapshots('${L}')`);
        const v2 = snaps?.find(s => /inserted_into_table|tables_inserted_into/.test(JSON.stringify(s.changes)))?.snapshot_id ?? 2;
        await intenta(`«como estaba» por versión: AT (VERSION => ${v2})`, `SELECT count(*) AS filas, max(importe) AS max FROM ${L}.ventas AT (VERSION => ${v2})`);
        await intenta('«como estaba» por fecha: AT (TIMESTAMP => …)', `SELECT count(*) AS filas FROM ${L}.ventas AT (TIMESTAMP => '${t1.toISOString()}'::TIMESTAMPTZ)`);
        await intenta('qué cambió entre dos versiones: table_changes', `SELECT change_type, count(*) AS n FROM ducklake_table_changes('${L}', 'main', 'ventas', 1, 4) GROUP BY ALL`);
        const antes = archivosDe(datos);
        dato('archivos de datos antes', `${antes.n} (${antes.b} bytes)`);
        await intenta('compactar: ducklake_merge_adjacent_files', `CALL ducklake_merge_adjacent_files('${L}')`);
        await intenta('expirar en seco: ducklake_expire_snapshots(dry_run)', `CALL ducklake_expire_snapshots('${L}', dry_run => true, older_than => now())`);
        await intenta('expirar versiones de verdad', `CALL ducklake_expire_snapshots('${L}', older_than => now())`);
        await intenta('limpiar en seco: ducklake_cleanup_old_files(dry_run)', `CALL ducklake_cleanup_old_files('${L}', dry_run => true, cleanup_all => true)`);
        await intenta('limpiar archivos de verdad', `CALL ducklake_cleanup_old_files('${L}', cleanup_all => true)`);
        const despues = archivosDe(datos);
        dato('archivos de datos después', `${despues.n} (${despues.b} bytes)`);
        try { await q(`SELECT count(*) FROM ${L}.ventas AT (VERSION => ${v2})`); anota('tras expirar, la versión vieja ya no se consulta', false, 'todavía se consulta'); }
        catch (e) { anota('tras expirar, la versión vieja ya no se consulta (el error que verá el usuario)', true, e.message.split('\n')[0]); }
        await intenta('los datos de hoy siguen', `SELECT count(*) AS filas FROM ${L}.ventas`);
        await intenta('ducklake_options / opciones del lago', `SELECT * FROM ducklake_options('${L}') LIMIT 3`);
        await q(`DETACH ${L}`);
    }
} catch (e) {
    anota('inesperado', false, e.stack || e.message);
} finally {
    con.closeSync(); inst.closeSync();
}
console.log(`\n${T}`);
