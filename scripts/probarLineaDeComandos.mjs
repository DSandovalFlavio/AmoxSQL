/**
 * La línea de comandos (A3), fase 4 del plan de la 5.9.
 *
 *     node scripts/probarLineaDeComandos.mjs            (el ejecutable de desarrollo)
 *     node scripts/probarLineaDeComandos.mjs <AmoxSQL.exe>   (uno empaquetado)
 *
 * Lanza AmoxSQL de verdad, con un AMOXSQL_HOME temporal: con él, la carpeta de
 * datos de Electron también es otra, así que esta prueba es OTRO AmoxSQL y no
 * entrega nada a la aplicación que el autor tenga abierta.
 *
 *   - Con la aplicación cerrada: sale 0, deja la salida, su registro, y la
 *     ejecución en la base de AmoxSQL; no deja el archivo de resultado.
 *   - Un proceso que falla: sale 1 y deja su registro.
 *   - Falta una credencial: sale 3.
 *   - Argumentos malos: sale 2. Proyecto o proceso que no existen: sale 5.
 *   - Con la aplicación abierta: se le entrega, sale 0 y ella sigue abierta.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const EMPAQUETADO = process.argv[2] ? path.resolve(process.argv[2]) : null;
const ELECTRON = EMPAQUETADO || require('electron');            // la ruta del ejecutable
const PREVIOS = EMPAQUETADO ? [] : ['.'];

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-cli-'));
const HOME = path.join(TMP, 'home');
const PROYECTO = path.join(TMP, 'Ventas 2026');
for (const d of [HOME, path.join(PROYECTO, 'datos'), path.join(PROYECTO, 'flujos')]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(PROYECTO, 'datos', 'ventas.csv'),
    'id,region,importe\n1,norte,10\n2,sur,20\n3,norte,30\n4,este,40\n5,norte,50\n');

const nodo = (id, type, label, config) => ({ id, type, label, config, position: { x: 0, y: 0 } });
const arista = (a, b) => ({ id: `${a}-${b}`, source: a, target: b });
const cadena = (nombre, nodes, edges, variables = {}) =>
    fs.writeFileSync(path.join(PROYECTO, 'flujos', nombre), JSON.stringify({ version: '1.0', name: nombre, config: { base: 'auto' }, nodes, edges, variables }, null, 2));

// Variables de cadena: `${region}` se cambia con --param.
cadena('norte.sqlchain', [
    nodo('leer', 'import_file', 'Leer ventas', { sourcePath: 'datos/ventas.csv', tableName: 'ventas' }),
    nodo('filtrar', 'filter', 'Una region', { conditions: [{ column: 'region', operator: '=', value: '${region}' }] }),
    nodo('guardar', 'export_file', 'A Parquet', { outputPath: 'salida/${region}.parquet', format: 'parquet' }),
], [arista('leer', 'filtrar'), arista('filtrar', 'guardar')], { region: 'norte' });
cadena('falla.sqlchain', [
    nodo('leer', 'import_file', 'Leer ventas', { sourcePath: 'datos/ventas.csv', tableName: 'ventas' }),
    nodo('comprobar', 'assert', 'Hay miles', { assertType: 'row_count_gt', threshold: 1000 }),
], [arista('leer', 'comprobar')]);
cadena('nube.sqlchain', [
    nodo('leer', 'bucket_read', 'Del bucket', { uri: 's3://un-bucket/ventas.parquet', provider: 's3', tableName: 'nube' }),
], []);

const ENV = { ...process.env, AMOXSQL_HOME: HOME, ELECTRON_ENABLE_LOGGING: '' };
delete ENV.ELECTRON_RUN_AS_NODE;

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

/** Lanza `AmoxSQL run …` y espera a que salga. */
function correr(args, { cwd = PROYECTO, timeout = 120000 } = {}) {
    const r = spawnSync(ELECTRON, [...PREVIOS, 'run', ...args], { cwd: EMPAQUETADO ? cwd : RAIZ, env: ENV, encoding: 'utf8', timeout, windowsHide: true });
    return { codigo: r.status, salida: (r.stdout || '') + (r.stderr || ''), error: r.error };
}
const resumen = (r) => `código ${r.codigo}: ${r.salida.split('\n').filter(l => l && !l.startsWith('[')).slice(0, 6).join(' | ')}`;

async function leerCentral(sql) {
    const { DuckDBInstance } = require('@duckdb/node-api');
    const inst = await DuckDBInstance.create(path.join(HOME, 'amoxsql.duckdb'), { access_mode: 'READ_ONLY' });
    const con = await inst.connect();
    try { return await (await con.run(sql)).getRowObjectsJson(); }
    finally { con.closeSync(); inst.closeSync(); }
}

const cadenaDe = (n) => path.join('flujos', n);
let abierta = null;
try {
    console.log(`\n(${EMPAQUETADO ? `empaquetado: ${EMPAQUETADO}` : 'ejecutable de desarrollo'})`);

    console.log('\nargumentos malos y cosas que no existen');
    let r = correr([cadenaDe('norte.sqlchain')]);
    comprobar('sin --project sale 2 y explica el uso', r.codigo === 2 && /--project is required/.test(r.salida) && /Usage:/.test(r.salida), resumen(r));
    r = correr(['ventas.csv', '--project', PROYECTO]);
    comprobar('un proceso que no es .sqlchain sale 2', r.codigo === 2, resumen(r));
    r = correr([cadenaDe('norte.sqlchain'), '--project', PROYECTO, '--param', 'sin-igual']);
    comprobar('un --param sin nombre=valor sale 2', r.codigo === 2, resumen(r));
    r = correr([cadenaDe('norte.sqlchain'), '--project', path.join(TMP, 'no-existe')]);
    comprobar('un proyecto que no existe sale 5', r.codigo === 5 && /does not exist/.test(r.salida), resumen(r));
    r = correr([cadenaDe('no-esta.sqlchain'), '--project', PROYECTO]);
    comprobar('un proceso que no existe sale 5', r.codigo === 5, resumen(r));
    comprobar('nada de esto ha arrancado AmoxSQL', !fs.existsSync(path.join(HOME, 'amoxsql.duckdb')));

    console.log('\ncon la aplicación cerrada');
    r = correr([cadenaDe('norte.sqlchain'), '--project', PROYECTO]);
    comprobar('sale 0', r.codigo === 0, resumen(r));
    comprobar('y lo dice', /norte\.sqlchain finished/.test(r.salida) && !/run by the open/.test(r.salida), resumen(r));
    comprobar('deja su salida', fs.existsSync(path.join(PROYECTO, 'salida', 'norte.parquet')));
    const registros = fs.existsSync(path.join(HOME, 'registros')) ? fs.readdirSync(path.join(HOME, 'registros')) : [];
    const registro = registros.length ? fs.readFileSync(path.join(HOME, 'registros', registros[0]), 'utf8') : '';
    comprobar('y un registro legible, paso a paso', /AmoxSQL run .*norte\.sqlchain/.test(registro) && /A Parquet/.test(registro) && /exit code 0/.test(registro), registro.slice(0, 300));
    comprobar('el archivo de resultado no se queda', !fs.readdirSync(path.join(HOME, 'ejecuciones')).some(f => f.endsWith('.json')));

    console.log('\ncon un parámetro');
    r = correr([cadenaDe('norte.sqlchain'), '--project', PROYECTO, '--param', 'region=sur']);
    comprobar('--param cambia la variable de la cadena', r.codigo === 0 && fs.existsSync(path.join(PROYECTO, 'salida', 'sur.parquet')), resumen(r));

    console.log('\nun proceso que falla');
    r = correr([cadenaDe('falla.sqlchain'), '--project', PROYECTO]);
    comprobar('sale 1', r.codigo === 1, resumen(r));
    comprobar('dice qué paso y por qué', /Hay miles/.test(r.salida) && /Assertion failed/.test(r.salida), resumen(r));
    const regFallo = fs.readdirSync(path.join(HOME, 'registros')).map(f => fs.readFileSync(path.join(HOME, 'registros', f), 'utf8')).find(t => /falla\.sqlchain/.test(t)) || '';
    comprobar('y deja su registro', /✗ Hay miles/.test(regFallo) && /exit code 1/.test(regFallo), regFallo.slice(0, 300));

    console.log('\nfalta una credencial');
    r = correr([cadenaDe('nube.sqlchain'), '--project', PROYECTO]);
    comprobar('sale 3 y la nombra', r.codigo === 3 && /nube-s3/.test(r.salida), resumen(r));

    console.log('\nla base de AmoxSQL');
    const filas = await leerCentral(`SELECT origen, estado, proceso FROM ejecuciones ORDER BY inicio`);
    comprobar('anota las ejecuciones que corrieron, desde la línea de comandos',
        filas.length === 3 && filas.every(f => f.origen === 'linea_de_comandos') && filas.map(f => f.estado).join() === 'ok,ok,fallo', JSON.stringify(filas));
    comprobar('el proyecto no recibió base: era de archivo a archivo', !fs.readdirSync(PROYECTO).some(f => f.endsWith('.duckdb')));

    console.log('\ncon la aplicación abierta');
    abierta = spawn(ELECTRON, [...PREVIOS], { cwd: RAIZ, env: ENV, stdio: 'ignore', windowsHide: false });
    // Lista cuando su servidor ha abierto la base de AmoxSQL: su .wal aparece
    // o el archivo cambia. Se espera de sobra, que una ventana tarda.
    await dormir(9000);
    r = correr([cadenaDe('norte.sqlchain'), '--project', PROYECTO, '--param', 'region=este']);
    comprobar('se le entrega y sale 0', r.codigo === 0 && /run by the open AmoxSQL/.test(r.salida), resumen(r));
    comprobar('deja su salida', fs.existsSync(path.join(PROYECTO, 'salida', 'este.parquet')));
    comprobar('y la aplicación sigue abierta', abierta.exitCode === null);
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    if (abierta && abierta.exitCode === null) {
        // Árbol entero: la ventana, el servidor, la GPU.
        spawnSync('taskkill', ['/pid', String(abierta.pid), '/t', '/f'], { stdio: 'ignore' });
        await dormir(1500);
    }
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows suelta los archivos tarde */ }
console.log(`\n${pasadas} pasadas, ${fallos} fallos\n`);
process.exit(fallos ? 1 : 0);
