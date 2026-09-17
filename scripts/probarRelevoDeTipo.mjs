/**
 * Ejecutar una celda DOS VECES, y cambiarle el tipo. Contra el motor de verdad.
 *
 * Esta prueba existe porque las otras no bastaron. `probarVistaDeCelda` mira el
 * SQL que se compone, y el SQL estaba bien escrito: el fallo era lo que el motor
 * hace con él. Seis pruebas contra DuckDB cubrían crear, tapar y cambiar de
 * tipo, y ninguna cubría **volver a ejecutar la misma celda** — que es lo que
 * pasa siempre.
 *
 * Lo que se aprendió: `DROP ... IF EXISTS` en DuckDB NO es inofensivo cuando el
 * nombre existe con OTRO tipo. El `IF EXISTS` perdona la ausencia, no el
 * desajuste:
 *
 *     DROP TABLE IF EXISTS x   con x = vista  ->  Catalog Error
 *
 * Por eso el relevo lo decide el servidor mirando el catálogo, y no el cliente
 * mandando un `DROP` a ciegas.
 *
 *   node scripts/probarRelevoDeTipo.mjs
 */
import { DuckDBInstance } from '@duckdb/node-api';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { componerCelda } from '../client/src/utils/vistaDeCelda.js';
import { analizarCelda } from '../client/src/utils/celdaSql.js';

let bien = 0;
let mal = 0;
function comprobar(titulo, real, esperado) {
    const a = JSON.stringify(real);
    const b = JSON.stringify(esperado);
    if (a === b) { bien++; return; }
    mal++;
    console.error(`FALLA  ${titulo}\n  esperado ${b}\n  real     ${a}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-relevo-'));
const inst = await DuckDBInstance.create(path.join(dir, 'p.duckdb'));
const con = await inst.connect();

/**
 * Lo mismo que hace `/api/cuaderno/celda`: mirar qué hay temporal con ese
 * nombre y relevarlo sólo si es del otro tipo.
 */
async function relevar(nombre, deja) {
    const seguro = String(nombre).replace(/'/g, "''");
    const r = await con.runAndReadAll(`
        SELECT 'vista' AS tipo FROM duckdb_views()
         WHERE temporary AND NOT internal AND lower(view_name) = lower('${seguro}')
        UNION ALL
        SELECT 'tabla' FROM duckdb_tables()
         WHERE temporary AND lower(table_name) = lower('${seguro}')
        LIMIT 1`);
    const filas = r.getRowsJS();
    if (!filas.length || filas[0][0] === deja) return;
    const id = `"${String(nombre).replace(/"/g, '""')}"`;
    await con.run(`DROP ${filas[0][0] === 'tabla' ? 'TABLE' : 'VIEW'} IF EXISTS temp.main.${id}`);
}

/** Ejecutar una celda de principio a fin, como lo hace el producto. */
async function ejecutar(sql, { nombre, materializar = false }) {
    const { preparacion, lector, vista, deja } = componerCelda({
        sql, analisis: analizarCelda(sql), nombre, descripcion: 'x', materializar,
    });
    if (vista && (deja === 'vista' || deja === 'tabla')) await relevar(vista, deja);
    if (preparacion) await con.run(preparacion);
    const r = await con.runAndReadAll(lector);
    return r.getRowsJS().length;
}

const intentar = async (titulo, fn, esperado = true) => {
    try {
        await fn();
        comprobar(titulo, true, esperado);
    } catch (e) {
        comprobar(`${titulo}  [${e.message.split('\n')[0]}]`, false, esperado);
    }
};

// Alguien tiene su propia vista «ventas» en el proyecto. No es nuestra.
await con.run(`CREATE TABLE pedidos AS SELECT 1 AS id, 100 AS importe`);
await con.run(`CREATE VIEW ventas AS SELECT 99 AS importe`);

const SQL = 'SELECT * FROM pedidos';

// ── el caso de todos los días ───────────────────────────────────────────────
await intentar('una celda normal se ejecuta', () => ejecutar(SQL, { nombre: 'inventario2' }));
await intentar('y se vuelve a ejecutar', () => ejecutar(SQL, { nombre: 'inventario2' }));
await intentar('y una tercera vez', () => ejecutar(SQL, { nombre: 'inventario2' }));

// ── «Materializar», ida y vuelta ────────────────────────────────────────────
await intentar('se pulsa Materializar', () => ejecutar(SQL, { nombre: 'inventario2', materializar: true }));
await intentar('otra vez materializada', () => ejecutar(SQL, { nombre: 'inventario2', materializar: true }));
await intentar('se quita Materializar', () => ejecutar(SQL, { nombre: 'inventario2' }));
await intentar('y se vuelve a poner', () => ejecutar(SQL, { nombre: 'inventario2', materializar: true }));

// ── sobre un nombre que ya existe de verdad ─────────────────────────────────
await intentar('una celda puede llamarse como una vista real', () => ejecutar(SQL, { nombre: 'ventas' }));
await intentar('y materializarse encima', () => ejecutar(SQL, { nombre: 'ventas', materializar: true }));

{
    const r = await con.runAndReadAll(`
        SELECT count(*)::INT AS n FROM duckdb_views()
         WHERE NOT temporary AND NOT internal AND view_name = 'ventas'`);
    comprobar('la vista PERMANENTE de quien abrió el proyecto sigue intacta', r.getRowsJS()[0][0], 1);
}
{
    const r = await con.runAndReadAll(`SELECT count(*)::INT AS n FROM pedidos`);
    comprobar('y su tabla también', r.getRowsJS()[0][0], 1);
}

// ── lo que se compone ya NO lleva un DROP a ciegas ──────────────────────────
{
    const { preparacion } = componerCelda({
        sql: SQL, analisis: analizarCelda(SQL), nombre: 'p', materializar: false,
    });
    comprobar('la preparación no manda ningún DROP', /\bDROP\b/i.test(preparacion), false);
}

con.closeSync();
inst.closeSync();
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n${bien} bien, ${mal} mal`);
if (mal) process.exitCode = 1;
