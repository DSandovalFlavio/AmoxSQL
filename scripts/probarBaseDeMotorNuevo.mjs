/**
 * El motor de AmoxSQL y el de dbt, cada uno de su versión.
 *
 *     node scripts/probarBaseDeMotorNuevo.mjs
 *
 * Hasta la 5.x AmoxSQL corría DuckDB 1.5 y lo que había que explicar era una base
 * de DuckDB 2 (formato 69) que no abría. En la 6.0 AmoxSQL ES DuckDB 2:
 * 1. Una base que DuckDB 2 creó desde cero se abre y se lee.
 * 2. dbt con DuckDB 1.x (un entorno de antes, o dbt 2.0 con su DuckDB incluido,
 *    que es 1.5): avisa aunque el perfil no tenga lago, porque lo que cree AmoxSQL
 *    no lo abrirá ese dbt. dbt con un motor más nuevo que AmoxSQL: el aviso de
 *    siempre. Con la misma versión, nada.
 *
 * La base de fixtures/motor la creó DuckDB 2.0.0 (`create table t as select 42 x`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-motor2-'));
const HOME = path.join(TMP, 'home');
const PROYECTO = path.join(TMP, 'proyecto');
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(PROYECTO, { recursive: true });
process.env.AMOXSQL_HOME = HOME;                 // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

fs.copyFileSync(path.join(RAIZ, 'scripts/fixtures/motor/creada_con_duckdb_2.duckdb'), path.join(PROYECTO, 'de_dbt.duckdb'));

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
const dbtConvivir = require(path.join(RAIZ, 'server/dbtConvivir.js'));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

try {
    await startServer(0);
    for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));

    console.log('\nabrir una base de DuckDB 2');
    const { version } = require('@duckdb/node-api');
    const AMOX = version();
    comprobar('el motor de AmoxSQL es DuckDB 2', /^v2\./.test(AMOX), AMOX);
    let error = null;
    try { await dbManager.connect('de_dbt.duckdb', PROYECTO); } catch (e) { error = e; }
    comprobar('la abre', !error, error?.message);
    const r = await dbManager.query('SELECT x FROM t').catch(e => ({ e: e.message }));
    comprobar('y se lee', r?.[0]?.x === 42, JSON.stringify(r));
    await dbManager.connect('propia.duckdb', PROYECTO);
    comprobar('y abre después una base nueva', /propia\.duckdb$/.test(dbManager.attachedPath || ''), dbManager.attachedPath);

    console.log('\ndbt con DuckDB 2');
    const sinLago = 'p:\n  target: dev\n  outputs:\n    dev:\n      type: duckdb\n      path: tienda.duckdb\n';
    const conLago = 'p:\n  target: dev\n  outputs:\n    dev:\n      type: duckdb\n      path: "ducklake:lago.ducklake"\n';
    // Un «python» falso delante en el PATH dice la versión del motor de dbt.
    // Sin conda ('none'); la versión se recuerda por entorno, así que cada
    // llamada lleva un condaPath distinto.
    const avisoSinConda = async (version, perfil) => {
        const raiz = fs.mkdtempSync(path.join(TMP, 'dbt-'));
        const bin = path.join(raiz, 'bin');
        fs.mkdirSync(bin);
        fs.writeFileSync(path.join(bin, 'python.cmd'), `@echo ${version}\r\n`);
        fs.writeFileSync(path.join(bin, 'python'), `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
        fs.writeFileSync(path.join(raiz, 'profiles.yml'), perfil);
        const antes = process.env.PATH;
        process.env.PATH = bin + path.delimiter + antes;
        try { return await dbtConvivir.avisoDeVersion(raiz, 'dbt run', { condaEnv: 'none', condaPath: `fuera-${version}-${path.basename(raiz)}`, versionAmox: AMOX }); }
        finally { process.env.PATH = antes; }
    };
    const amox = AMOX.replace(/^v/, '');
    const a1 = await avisoSinConda('1.5.4', sinLago);
    comprobar('dbt con DuckDB 1.x, sin lago: avisa', new RegExp(`dbt runs DuckDB 1\\.5\\.4 and AmoxSQL ${amox.replace(/\./g, '\\.')}`).test(a1 || ''), a1);
    comprobar('  …de lo que crea AmoxSQL, y cómo arreglarlo', /A database that AmoxSQL created will not open in dbt/.test(a1 || '') && /Set up dbt/.test(a1 || ''), a1);
    const a2 = await avisoSinConda('1.5.4', conLago);
    comprobar('con lago, también nombra el lago', /or a DuckLake lake it wrote to/.test(a2 || ''), a2);
    const a5 = await avisoSinConda('3.0.0', sinLago);
    comprobar('dbt con un motor de otra versión mayor más nueva: el aviso de siempre', /one that dbt creates from scratch will not open/.test(a5 || ''), a5);
    const a3 = await avisoSinConda(amox, sinLago);
    comprobar('con la misma versión, nada', a3 === null, a3);
    const a4 = await avisoSinConda(amox, conLago);
    comprobar('con la misma versión y lago, nada', a4 === null, a4);
} catch (e) {
    fallos++;
    console.log('  FALLA inesperado:', e.stack || e.message);
} finally {
    await baseCentral.cerrar().catch(() => {});
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
