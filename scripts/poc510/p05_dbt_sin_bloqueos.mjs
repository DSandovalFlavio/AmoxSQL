/**
 * Prueba de concepto 0.5 de la 5.10 (fase 2b · I1, dbt sin bloqueos).
 *
 * dbt-duckdb abre la base con `duckdb.connect(ruta)` en escritura, en SU proceso
 * y con SU version del motor. Esta prueba hace de dbt con un proceso de Python
 * que usa el DuckDB del entorno de dbt, y contesta:
 *   - ¿que error da cuando AmoxSQL tiene la base adjunta (y si la tiene en solo lectura)?
 *   - ¿basta con DETACH (lo que ya hace DatabaseManager.close) o hay que soltar el motor?
 *   - ¿cuanto cuesta soltar y volver, y que sobrevive (catalogo `fuentes`, vistas
 *     temporales, extensiones cargadas)?
 *   - ¿el motor de dbt (otra version) abre una base escrita por el de AmoxSQL, y al reves?
 *   - ¿un DuckLake con catalogo SQLite deja escribir a los dos a la vez?
 *
 *   node scripts/poc510/p05_dbt_sin_bloqueos.mjs [--python <python.exe>]
 *
 * Por defecto busca el Python del entorno conda `dbt-duckdb`.
 */
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { DuckDBInstance } = require('@duckdb/node-api');

const ip = process.argv.indexOf('--python');
const python = ip > 0 ? process.argv[ip + 1]
    : path.join(os.homedir(), 'miniconda3', 'envs', 'dbt-duckdb', 'python.exe');
if (!fs.existsSync(python)) { console.error(`No encuentro Python con duckdb: ${python}`); process.exit(2); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-poc05-'));
const fwd = (p) => p.split(path.sep).join('/');
const base = fwd(path.join(dir, 'proyecto.duckdb'));

const resultados = [];
const anota = (pregunta, ok, detalle = '') => {
    resultados.push({ pregunta, ok });
    console.log(`${ok ? 'SI ' : 'NO '} ${pregunta}${detalle ? `  — ${detalle}` : ''}`);
};

/** «dbt»: un proceso aparte que abre la base en escritura y materializa un modelo. */
const guion = path.join(dir, 'dbt_falso.py');
fs.writeFileSync(guion, [
    'import sys, time, duckdb',
    't0 = time.perf_counter()',
    'try:',
    '    con = duckdb.connect(sys.argv[1])',
    '    for s in sys.argv[2:]:',
    '        con.execute(s)',
    '    con.close()',
    "    print('OK', duckdb.__version__, round((time.perf_counter() - t0) * 1000))",
    'except Exception as e:',
    "    print('ERR', str(e).splitlines()[0])",
].join('\n'));
const dbt = (ruta, ...sql) => {
    const r = spawnSync(python, [guion, ruta, ...sql], { encoding: 'utf8' });
    const linea = (r.stdout || r.stderr || '').trim().split('\n').pop();
    return { ok: linea.startsWith('OK'), linea };
};
const MODELO = 'CREATE OR REPLACE TABLE main.modelo AS SELECT 42 AS respuesta';

const inst = await DuckDBInstance.create(':memory:');
const c = await inst.connect();
const filas = async (sql) => (await c.runAndReadAll(sql)).getRowObjectsJson();
const intenta = async (sql) => {
    try { return { ok: true, filas: await filas(sql) }; }
    catch (e) { return { ok: false, error: String(e.message || e).split('\n')[0] }; }
};

// La sesion de AmoxSQL: proyecto adjunto y en uso, catalogo de fuentes, una
// vista temporal de cuaderno y una extension cargada a mano.
await c.run(`ATTACH '${base}' AS user_db`);
await c.run('USE user_db');
await c.run('CREATE TABLE ventas AS SELECT 1 AS id');
await c.run(`ATTACH ':memory:' AS fuentes`);
await c.run(`CREATE VIEW fuentes."lista" AS SELECT 1 AS x`);
await c.run('CREATE TEMP VIEW celda_1 AS SELECT count(*) AS n FROM user_db.ventas');
await c.run('LOAD excel');

// --- 1. Con la base adjunta
{
    const r = dbt(base, MODELO);
    anota('con la base adjunta en AmoxSQL, «dbt» no puede escribir', !r.ok, r.linea);
}

// --- 2. ¿Y en solo lectura?
{
    await c.run('USE memory');
    await c.run('DETACH user_db');
    await c.run(`ATTACH '${base}' AS user_db (READ_ONLY)`);
    const r = dbt(base, MODELO);
    anota('en solo lectura tampoco: no hay modo que deje escribir a otro proceso', !r.ok, r.linea);
    await c.run('DETACH user_db');
    await c.run(`ATTACH '${base}' AS user_db`);
    await c.run('USE user_db');
}

// --- 3. Soltar con DETACH, sin tirar el motor (lo que hace DatabaseManager.close)
{
    const lista = await filas('PRAGMA database_list');
    const fuentes = lista.find(d => d.name === 'fuentes');
    anota('close() no soltaria `fuentes`: PRAGMA database_list le da archivo vacio', fuentes && !fuentes.file, JSON.stringify(fuentes));

    let t0 = performance.now();
    await c.run('USE memory');
    await c.run('DETACH user_db');
    const soltar = performance.now() - t0;

    const r = dbt(base, MODELO);
    anota('tras DETACH, «dbt» escribe', r.ok, r.linea);

    t0 = performance.now();
    await c.run(`ATTACH '${base}' AS user_db`);
    await c.run('USE user_db');
    const volver = performance.now() - t0;
    anota('soltar y volver a adjuntar es inmediato', soltar + volver < 200, `DETACH ${soltar.toFixed(1)} ms, ATTACH ${volver.toFixed(1)} ms`);

    let q = await intenta('SELECT respuesta FROM modelo');
    anota('al volver, AmoxSQL ve lo que escribio «dbt»', q.ok && q.filas[0].respuesta === 42, q.error);
    q = await intenta(`SELECT x FROM fuentes."lista"`);
    anota('el catalogo `fuentes` sobrevive', q.ok, q.error);
    q = await intenta('SELECT n FROM celda_1');
    anota('la vista temporal de un cuaderno sobrevive (y vuelve a resolver)', q.ok, q.error);
    q = await intenta(`SELECT loaded FROM duckdb_extensions() WHERE extension_name = 'excel'`);
    anota('la extension cargada sigue cargada', q.ok && q.filas[0].loaded === true, q.error);

    // Mientras esta suelta: lo que vera una consulta del usuario
    await c.run('USE memory');
    await c.run('DETACH user_db');
    q = await intenta('SELECT n FROM celda_1');
    anota('mientras dbt corre, una consulta al proyecto falla (2b.3: decirlo en vez de mostrar esto)', !q.ok, q.error);
    await c.run(`ATTACH '${base}' AS user_db`);
    await c.run('USE user_db');
}

// --- 4. Versiones: el motor de dbt y el de AmoxSQL
{
    const ver = (await filas('SELECT version() AS v'))[0].v;
    const nueva = fwd(path.join(dir, 'nueva.duckdb'));
    await c.run(`ATTACH '${nueva}' AS nueva`);
    await c.run('CREATE TABLE nueva.t AS SELECT 1 AS a');
    await c.run('DETACH nueva');
    const r = dbt(nueva, 'CREATE OR REPLACE TABLE t2 AS SELECT * FROM t');
    anota(`una base creada por AmoxSQL (${ver}) la abre y escribe el motor de dbt`, r.ok, r.linea);
    const q = await intenta(`ATTACH '${nueva}' AS nueva (READ_ONLY)`);
    const q2 = q.ok ? await intenta('SELECT count(*)::INT AS n FROM nueva.t2') : q;
    anota('...y AmoxSQL lee lo que escribio', q2.ok && q2.filas[0].n === 1, q2.error);
    if (q.ok) await c.run('DETACH nueva');
}

// --- 5. DuckLake con catalogo SQLite: ¿dos procesos escribiendo a la vez?
{
    const cat = fwd(path.join(dir, 'lago.sqlite'));
    const datos = fwd(path.join(dir, 'lago_datos')) + '/';
    let q = await intenta('INSTALL ducklake');
    q = q.ok ? await intenta('INSTALL sqlite') : q;
    q = q.ok ? await intenta(`ATTACH 'ducklake:sqlite:${cat}' AS lago (DATA_PATH '${datos}')`) : q;
    if (!q.ok) {
        anota('DuckLake con SQLite en AmoxSQL', false, q.error);
    } else {
        await c.run('CREATE TABLE lago.ventas AS SELECT 1 AS id');
        const r = dbt(':memory:',
            'INSTALL ducklake', 'INSTALL sqlite',
            `ATTACH 'ducklake:sqlite:${cat}' AS lago (DATA_PATH '${datos}')`,
            'CREATE OR REPLACE TABLE lago.modelo AS SELECT 7 AS v');
        // Con OTRA version del motor: el formato del lago no casa. Un lago creado
        // por AmoxSQL no lo abre un dbt con un motor mas viejo (dato para I8).
        anota('con otra version del motor, «dbt» no abre un lago creado por AmoxSQL (formato del lago)',
            !r.ok && /DuckLake versions/.test(r.linea), r.linea);

        // Con la MISMA version: un segundo proceso de Node hace de dbt
        const nodeGuion = path.join(dir, 'dbt_falso.cjs');
        fs.writeFileSync(nodeGuion, [
            `const { DuckDBInstance } = require(${JSON.stringify(require.resolve('@duckdb/node-api'))});`,
            '(async () => {',
            '  try {',
            "    const i = await DuckDBInstance.create(':memory:'); const c = await i.connect();",
            '    for (const s of process.argv.slice(2)) await c.run(s);',
            "    console.log('OK');",
            "  } catch (e) { console.log('ERR ' + String(e.message).split('\\n')[0]); }",
            '})();',
        ].join('\n'));
        const otro = (...sql) => {
            const x = spawnSync(process.execPath, [nodeGuion, ...sql], { encoding: 'utf8' });
            const linea = (x.stdout || x.stderr || '').trim().split('\n').pop();
            return { ok: linea.startsWith('OK'), linea };
        };
        const adjunta = `ATTACH 'ducklake:sqlite:${cat}' AS lago (DATA_PATH '${datos}')`;
        let r2 = otro('LOAD ducklake', 'LOAD sqlite', adjunta, 'CREATE OR REPLACE TABLE lago.modelo AS SELECT 7 AS v');
        anota('con la misma version y el lago adjunto en AmoxSQL, otro proceso escribe en el lago', r2.ok, r2.linea);
        q = await intenta('SELECT v FROM lago.modelo');
        anota('...y AmoxSQL ve el modelo sin volver a adjuntar', q.ok && q.filas[0]?.v === 7, q.error);
        q = await intenta('INSERT INTO lago.ventas VALUES (2)');
        anota('...y AmoxSQL sigue pudiendo escribir', q.ok, q.error);
        r2 = otro('LOAD ducklake', 'LOAD sqlite', adjunta, 'INSERT INTO lago.ventas VALUES (3)');
        q = await intenta('SELECT count(*)::INT AS n FROM lago.ventas');
        anota('los dos escriben en la misma tabla sin pisarse', r2.ok && q.ok && q.filas[0].n === 3, r2.linea + ' ' + (q.error || ''));
        await c.run('DETACH lago');

        // El catalogo en un archivo DuckDB en vez de SQLite: un solo proceso
        const catDuck = fwd(path.join(dir, 'lago2.ducklake'));
        await c.run(`ATTACH 'ducklake:${catDuck}' AS lago2 (DATA_PATH '${datos}2/')`);
        r2 = otro('LOAD ducklake', `ATTACH 'ducklake:${catDuck}' AS lago2 (DATA_PATH '${datos}2/')`, 'CREATE TABLE lago2.t AS SELECT 1 AS a');
        anota('con el catalogo en un archivo DuckDB (lo que crea AmoxSQL hoy), el otro proceso queda fuera', !r2.ok, r2.linea);
        await c.run('DETACH lago2');
    }
}

inst.closeSync?.();
fs.rmSync(dir, { recursive: true, force: true });
const fallos = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} como se esperaba`);
process.exit(fallos ? 1 : 0);
