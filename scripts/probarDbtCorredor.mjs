/**
 * El corredor de dbt (5.12, fase 1): Dec-26, Dec-27, Dec-34 y Dec-36.
 *
 *     node scripts/probarDbtCorredor.mjs
 *
 * Con un dbt FALSO (un script de Node que escribe lo que escribiría dbt), así corre
 * en cualquier máquina; el dbt de verdad está en scripts/poc512/p00_dbt.mjs.
 *   - analizar el texto de la interfaz a argumentos, y rechazar lo que es de shell;
 *   - lanzar sin shell, con --profiles-dir, las variables de las fuentes, el código
 *     de salida y la cancelación;
 *   - leer run_results.json (y no tomar por suyos unos resultados viejos), resumir
 *     (un test en warn es «aviso»), y la fila en `ejecuciones`;
 *   - el entorno del proyecto, la ficha y «Run again», y «Set up dbt…» (sin red).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-dbtcorredor-'));
const HOME = path.join(TMP, 'home');
const PR = path.join(TMP, 'proyecto dbt');            // con espacio, a propósito
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(PR, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const corredor = require(path.join(RAIZ, 'server/dbt/correr.js'));
const resultados = require(path.join(RAIZ, 'server/dbt/resultados.js'));
const { ejecutarDbt } = require(path.join(RAIZ, 'server/dbt/ejecutar.js'));
const entorno = require(path.join(RAIZ, 'server/dbt/entorno.js'));
const dbtFuentes = require(path.join(RAIZ, 'server/dbt/fuentes.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const lanza = (f) => { try { f(); return null; } catch (e) { return e; } };

// ── El dbt falso ─────────────────────────────────────────────────────────────
const FALSO = path.join(TMP, 'dbt_falso.cjs');
fs.writeFileSync(FALSO, `
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const accion = args[0];
const valor = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
console.log('Running with dbt=1.12.6');
console.log('ARGS ' + JSON.stringify(args));
console.log('ENV ' + (process.env.AMOXSQL_FUENTE_VENTAS || '-'));
if (valor('--select') === 'dormir') { setTimeout(() => process.exit(0), 30000); return; }
if (valor('--select') === 'roto') { console.error('Compilation Error in model roto'); writeResults([['model.p.roto', 'error', 'Parser Error']]); process.exit(1); }
const avisa = valor('--select') === 'con_aviso';
writeResults([
  ['seed.p.ventas', 'success'], ['model.p.stg_ventas', 'success'], ['model.p.fct', 'success'],
  ['test.p.unique_stg_ventas_id.abc', 'pass'], ['test.p.accepted_values_tienda.def', avisa ? 'warn' : 'pass', null, avisa ? 2 : 0],
]);
console.log('Completed successfully');
function writeResults(filas) {
  fs.mkdirSync('target', { recursive: true });
  fs.writeFileSync(path.join('target', 'run_results.json'), JSON.stringify({ metadata: { generated_at: new Date().toISOString() }, elapsed_time: 1.5,
    results: filas.map(([id, status, message, failures]) => ({ unique_id: id, status, execution_time: 0.25, message: message || null, failures: failures ?? null, adapter_response: { _message: 'OK' } })) }));
  const nodos = {};
  for (const [id] of filas) { const n = id.split('.'); nodos[id] = { name: n[2], resource_type: n[0], relation_name: n[0] === 'model' ? '"poc"."main"."' + n[2] + '"' : null, original_file_path: 'models/' + n[2] + '.sql', depends_on: { nodes: n[0] === 'test' ? ['model.p.stg_ventas'] : [] } }; }
  fs.writeFileSync(path.join('target', 'manifest.json'), JSON.stringify({ nodes: nodos, sources: {}, macros: {} }));
}
`);
const FALSO_ENTORNO = { tipo: 'directo', exe: process.execPath, pre: [FALSO] };
// Para lo que pasa por project.json (sólo entornos de verdad): una carpeta de entorno
// cuyo dbt es una copia de Node que corre el mismo script (scripts/ayudas/dbtFalso.cjs).
const { crearEntornoFalso } = require(path.join(RAIZ, 'scripts/ayudas/dbtFalso.cjs'));
const COMO_PYTHON = crearEntornoFalso(TMP, `process.argv = [process.argv[0], ${JSON.stringify(FALSO)}, ...args]; require(${JSON.stringify(FALSO)});`);
const ENTORNO_PROYECTO = { tipo: 'python', ruta: COMO_PYTHON.carpeta };
fs.writeFileSync(path.join(PR, 'dbt_project.yml'), "name: p\nprofile: p\n");
fs.writeFileSync(path.join(PR, 'profiles.yml'), "p:\n  target: prod\n  outputs:\n    prod: { type: duckdb, path: poc.duckdb }\n");

try {
    console.log('\nel texto de la interfaz → argumentos (Dec-26)');
    const a = corredor.analizarComando(`dbt build --select "stg_ventas+" --vars '{"dia": "2026-10-01"}' --target prod`);
    comprobar('una orden normal, con comillas de los dos tipos', a.accion === 'build' && JSON.stringify(a.args) === JSON.stringify(['build', '--select', 'stg_ventas+', '--vars', '{"dia": "2026-10-01"}', '--target', 'prod']), JSON.stringify(a));
    comprobar('`source freshness` y `docs generate`', corredor.analizarComando('dbt source freshness').accion === 'source freshness' && corredor.analizarComando('dbt docs generate').accion === 'docs generate');
    for (const malo of ['dbt run && del /q *', 'dbt run | more', 'dbt run; calc', 'dbt run > salida.txt', 'dbt run --select $(whoami)', 'dbt run `x`', 'dbt run --select "sin cerrar']) {
        comprobar(`rechaza «${malo}»`, lanza(() => corredor.analizarComando(malo)) instanceof corredor.ErrorDeDbt);
    }
    comprobar('rechaza lo que no es dbt', /start with «dbt»/.test(lanza(() => corredor.analizarComando('python -c 1'))?.message || ''));
    comprobar('rechaza `docs serve` e `init`', !!lanza(() => corredor.analizarComando('dbt docs serve')) && !!lanza(() => corredor.analizarComando('dbt init x')));
    comprobar('qué acciones escriben (Dec-29)', corredor.escribe('build') && corredor.escribe('seed') && !corredor.escribe('compile') && !corredor.escribe('test') && !corredor.escribe('source freshness'));
    const t = corredor.textoDe(['run', '--profiles-dir', 'C:\\Mis proyectos\\x', '--vars', '{"a": 1}']);
    comprobar('el texto vuelve a dar los mismos argumentos', JSON.stringify(corredor.analizarComando(t).args) === JSON.stringify(['run', '--profiles-dir', 'C:\\Mis proyectos\\x', '--vars', '{"a": 1}']), t);

    console.log('\nlanzar dbt sin shell');
    let lineas = [];
    let r = await corredor.correr({ raiz: PR, args: ['build', '--select', 'stg_ventas+'], entorno: FALSO_ENTORNO, env: { AMOXSQL_FUENTE_VENTAS: '(SELECT 1)' }, alLinea: (l) => lineas.push(l) });
    const argsVistos = JSON.parse((lineas.find(l => l.texto.startsWith('ARGS ')) || { texto: 'ARGS []' }).texto.slice(5));
    comprobar('corre y sale con 0', r.codigo === 0 && !r.cancelado, JSON.stringify(r).slice(0, 200));
    comprobar('añade --profiles-dir del proyecto (con su espacio, sin comillas que lo rompan)', argsVistos.at(-2) === '--profiles-dir' && argsVistos.at(-1) === PR, JSON.stringify(argsVistos));
    comprobar('le llegan las variables de las fuentes', lineas.some(l => l.texto === 'ENV (SELECT 1)'));
    comprobar('el comando completo, para el historial', r.comando.startsWith("dbt build --select stg_ventas+ --profiles-dir '"), r.comando);
    r = await corredor.correr({ raiz: PR, args: ['run', '--select', 'roto'], entorno: FALSO_ENTORNO });
    comprobar('un fallo de dbt sale con su código', r.codigo === 1);
    const corte = new AbortController();
    const t0 = Date.now();
    setTimeout(() => corte.abort(), 600);
    r = await corredor.correr({ raiz: PR, args: ['run', '--select', 'dormir'], entorno: FALSO_ENTORNO, senal: corte.signal });
    comprobar('cancelar termina el proceso enseguida', r.cancelado && Date.now() - t0 < 10000, `${Date.now() - t0} ms`);
    let e = await corredor.correr({ raiz: TMP, args: ['run'], entorno: FALSO_ENTORNO }).catch(x => x);
    comprobar('una carpeta sin dbt_project.yml', /not a dbt project/.test(e?.message || ''));
    r = await corredor.correr({ raiz: PR, args: ['run'], entorno: { tipo: 'directo', exe: path.join(TMP, 'no-existe.exe') }, alLinea: (l) => lineas.push(l) });
    comprobar('un dbt que no está lo dice', r.codigo !== 0 && /dbt was not found/.test(r.error || ''), r.error);

    console.log('\nlos resultados (Dec-34)');
    await corredor.correr({ raiz: PR, args: ['build', '--select', 'con_aviso'], entorno: FALSO_ENTORNO });
    const leidos = resultados.leer(PR);
    comprobar('lee run_results con el manifiesto', leidos.nodos.length === 5 && leidos.nodos.find(n => n.nombre === 'stg_ventas')?.relacion === '"poc"."main"."stg_ventas"', JSON.stringify(leidos.nodos[1]));
    comprobar('un test sabe de qué modelo es', leidos.nodos.find(n => n.tipo === 'test')?.de === 'stg_ventas');
    comprobar('no toma por suyos unos resultados viejos', resultados.leer(PR, { desde: new Date(Date.now() + 60000) }) === null);
    const res = resultados.resumir({ comando: 'dbt build --select con_aviso', codigo: 0, ms: 4200, resultados: leidos });
    comprobar('un test en warn con dbt saliendo en 0 es «aviso»', res.estado === 'aviso' && res.tests.warn === 1 && res.fallidos[0]?.fallos === 2, JSON.stringify(res.tests));
    comprobar('su línea', res.linea === 'dbt build · 2 models, 2 tests (1 warning), 1 seed · 4.2 s', res.linea);

    console.log('\nla fila en `ejecuciones`');
    await baseCentral.abrir();
    let x = await ejecutarDbt({ base: baseCentral, raiz: PR, args: ['build'], entorno: FALSO_ENTORNO, origen: 'interfaz' });
    let [fila] = await baseCentral.query('SELECT * FROM ejecuciones WHERE id = $1', [x.runId]);
    comprobar('queda con su comando, su estado y su resumen', fila?.estado === 'ok' && fila.proceso.startsWith('dbt build') && JSON.parse(fila.resumen).linea.startsWith('dbt build ·'), JSON.stringify(fila).slice(0, 300));
    x = await ejecutarDbt({ base: baseCentral, raiz: PR, args: ['run', '--select', 'roto'], entorno: FALSO_ENTORNO });
    [fila] = await baseCentral.query('SELECT * FROM ejecuciones WHERE id = $1', [x.runId]);
    comprobar('un fallo queda como fallo, con qué modelo falló', fila?.estado === 'fallo' && /roto: Parser Error/.test(fila.error || ''), fila?.error);
    x = await ejecutarDbt({ base: baseCentral, raiz: PR, args: ['run'], entorno: { tipo: 'amoxsql', version: '0.0.0-no-esta' } });
    [fila] = await baseCentral.query('SELECT * FROM ejecuciones WHERE id = $1', [x.runId]);
    comprobar('sin el entorno de AmoxSQL creado: falla diciendo qué hacer', fila?.estado === 'fallo' && /Set up dbt/.test(fila.error || ''), fila?.error);

    console.log('\nel entorno (Dec-27, Dec-36)');
    comprobar('sin entorno guardado, el del sistema', corredor.comandoDeEntorno(null).descripcion === 'dbt on the PATH');
    const CONDA = path.join(TMP, 'envs', 'dbt-duckdb');
    fs.mkdirSync(path.join(CONDA, process.platform === 'win32' ? 'Scripts' : 'bin'), { recursive: true });
    fs.writeFileSync(path.join(CONDA, process.platform === 'win32' ? 'Scripts/dbt.exe' : 'bin/dbt'), '');
    const c = corredor.comandoDeEntorno({ tipo: 'conda', nombre: 'dbt-duckdb', ruta: CONDA });
    comprobar('un conda con su carpeta: su dbt directamente, con el PATH de conda', c.exe.startsWith(CONDA) && c.env.PATH.startsWith(CONDA) && c.pre.length === 0, JSON.stringify(c).slice(0, 200));
    comprobar('un conda sin carpeta y con un .bat que no tiene conda.exe al lado', /only available as a script/.test(lanza(() => corredor.comandoDeEntorno({ tipo: 'conda', nombre: 'x', conda: path.join(TMP, 'condabin', 'conda.bat') }))?.message || ''));
    comprobar('un nombre de conda raro se rechaza', !!lanza(() => corredor.comandoDeEntorno({ tipo: 'conda', nombre: 'x & calc' })));
    fs.mkdirSync(path.join(PR, '.amoxsql'), { recursive: true });
    fs.writeFileSync(path.join(PR, '.amoxsql', 'project.json'), JSON.stringify({ dbt: { entorno: { tipo: 'directo', exe: process.execPath, pre: [FALSO] } } }));
    comprobar('project.json viaja con el proyecto: un ejecutable cualquiera («directo») se ignora', corredor.entornoDelProyecto(PR) === null);
    fs.writeFileSync(path.join(PR, '.amoxsql', 'project.json'), JSON.stringify({ dbt: { entorno: ENTORNO_PROYECTO } }));
    lineas = [];
    r = await corredor.correr({ raiz: PR, args: ['run'], alLinea: (l) => lineas.push(l) });
    comprobar('sin entorno en la llamada, el del proyecto', r.codigo === 0 && lineas.some(l => l.texto.startsWith('ARGS ')));
    comprobar('el de AmoxSQL vive en <home>/entornos/dbt-<motor>', corredor.carpetaDelEntornoPropio('1.5.6') === path.join(HOME, 'entornos', 'dbt-1.5.6'));
    const v = entorno.versionesFijas();
    comprobar('con el MISMO motor que AmoxSQL', v.duckdb === require(path.join(RAIZ, 'node_modules/@duckdb/node-api/package.json')).version.replace(/-.*$/, '') && !!v['dbt-core'] && !!v['dbt-duckdb'], JSON.stringify(v));
    comprobar('Python 3.10–3.13 sí; 3.14 y 3.9 no', entorno.admitida([3, 13]) && entorno.admitida([3, 10]) && !entorno.admitida([3, 14]) && !entorno.admitida([3, 9]));
    comprobar('sin crear: «no existe»', entorno.estado().existe === false);
    e = await entorno.crear({ python: path.join(TMP, 'no-hay-python.exe') }).catch(x => x);
    comprobar('crear con un Python que no corre lo dice', /does not run/.test(e?.message || ''), e?.message);

    console.log('\nlas fuentes como variables (I7, Dec-31)');
    comprobar('el nombre de la variable', dbtFuentes.nombreDeVariable('ventas-semanales') === 'AMOXSQL_FUENTE_VENTAS_SEMANALES' && dbtFuentes.nombreDeVariable('Ventas 2026') === 'AMOXSQL_FUENTE_VENTAS_2026');
    fs.mkdirSync(path.join(PR, 'datos'), { recursive: true });
    fs.writeFileSync(path.join(PR, 'datos', 'ventas.csv'), 'tienda,importe\nnorte,1\n');
    fs.mkdirSync(path.join(PR, '.amoxsql', 'fuentes'), { recursive: true });
    fs.writeFileSync(path.join(PR, '.amoxsql', 'fuentes', 'ventas-semanales.json'), JSON.stringify({ nombre: 'ventas-semanales', tipo: 'archivo', ubicacion: 'datos/ventas.csv' }));
    const vars = await dbtFuentes.variables(PR);
    comprobar('una fuente del proyecto: su lectura entre paréntesis y su archivo', /^\(SELECT \* FROM read_csv\(/.test(vars.AMOXSQL_FUENTE_VENTAS_SEMANALES || '') && vars.AMOXSQL_FUENTE_VENTAS_SEMANALES_ARCHIVO?.endsWith('datos/ventas.csv'), JSON.stringify(vars));

    console.log('\npor el servidor');
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const { port } = await startServer(0);
    const u = (p) => `http://localhost:${port}${p}`;
    const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
        .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
    await post('/api/project/open', { path: PR });
    let h = await post('/api/dbt/execute', { command: 'dbt run && calc' });
    comprobar('/api/dbt/execute rechaza lo que es de shell, sin lanzar nada', h.status === 400 && /only a shell would run/.test(h.error || ''), JSON.stringify(h));
    const sse = await fetch(u('/api/dbt/execute'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'dbt build --select con_aviso' }) }).then(r => r.text());
    const eventos = sse.split('\n\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6)));
    const fin = eventos.find(x => x.type === 'resumen');
    comprobar('corre con el entorno del proyecto y termina con su resumen', eventos.some(x => x.type === 'stdout' && x.text === 'Completed successfully') && fin?.resumen?.estado === 'aviso' && eventos.at(-1)?.type === 'exit', JSON.stringify(eventos.slice(-2)).slice(0, 300));
    const ficha = await get(`/api/ejecuciones/${fin?.resumen?.runId}`);
    comprobar('la ficha de una ejecución de dbt: sus modelos y tests como pasos', ficha.dbt === true && ficha.pasos?.length === 5 && ficha.pasos.find(p => p.nodo === 'accepted_values_tienda')?.error === 'warn', JSON.stringify(ficha.pasos?.slice(-1)));
    const otra = await post(`/api/ejecuciones/${fin?.resumen?.runId}/repetir`);
    const [rep] = otra.runId ? await baseCentral.query('SELECT proceso, origen FROM ejecuciones WHERE id = $1', [otra.runId]) : [];
    comprobar('«Run again» repite el mismo comando', otra.estado === 'ok' && rep?.proceso?.startsWith('dbt build --select con_aviso'), JSON.stringify(otra));
    h = await put('/api/dbt/proyecto', { target: 'prod', produccion: ['prod'] });
    comprobar('guardar target y producción no pisa el entorno', h.dbt?.target === 'prod' && h.dbt?.produccion?.[0] === 'prod' && h.dbt?.entorno?.tipo === 'python', JSON.stringify(h.dbt));
    h = await put('/api/dbt/proyecto', { entorno: { tipo: 'conda', nombre: 'x; calc' } });
    comprobar('un entorno con un nombre raro se rechaza', h.status === 400);
    h = await put('/api/dbt/proyecto', { entorno: { tipo: 'amoxsql' } });
    const g = await get('/api/dbt/proyecto');
    comprobar('elegir el de AmoxSQL; GET dice si está creado', g.dbt?.entorno?.tipo === 'amoxsql' && g.entornoPropio?.existe === false && g.entornoPropio?.versiones?.duckdb, JSON.stringify(g).slice(0, 200));
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
