/**
 * Programar dbt y la línea de comandos (5.12, fase 7; I10, Dec-34).
 *
 *     node scripts/probarDbtProgramado.mjs
 *
 *   - una programación puede ser un comando de dbt (se valida al programarla);
 *   - el reloj la corre con el corredor, deja su fila con su programación y su hora
 *     prevista, y avisa: también si un test queda en warn y se pidió «sólo si falla»;
 *   - `AmoxSQL.exe dbt <acción> … --project <carpeta>`;
 *   - por el servidor: el diálogo Schedule… con el comando como proceso.
 * Con un dbt FALSO.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-dbtprog-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });

const require = createRequire(import.meta.url);
const { crearEntornoFalso } = require(path.join(RAIZ, 'scripts/ayudas/dbtFalso.cjs'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const programaciones = require(path.join(RAIZ, 'server/programacion/programaciones.js'));
const programador = require(path.join(RAIZ, 'server/programacion/programador.js'));
const ordenes = require(path.join(RAIZ, 'server/ejecucion/ordenes.js'));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const lanza = async (f) => { try { await f(); return null; } catch (e) { return e; } };

const P = path.join(TMP, 'tienda');
const esc = (rel, t) => { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
esc('dbt_project.yml', 'name: tienda\nprofile: tienda\n');
esc('profiles.yml', 'tienda:\n  target: prod\n  outputs:\n    prod: { type: duckdb, path: tienda.duckdb }\n');
// El dbt falso: «--select roto» falla; «--select aviso» deja un test en warn.
const FALSO = crearEntornoFalso(TMP, `
const fs = require('fs');
const sel = args[args.indexOf('--select') + 1];
fs.mkdirSync('target', { recursive: true });
const filas = sel === 'roto' ? [['model.tienda.roto', 'error']] : [['model.tienda.stg', 'success'], ['test.tienda.t1', sel === 'aviso' ? 'warn' : 'pass']];
fs.writeFileSync('target/run_results.json', JSON.stringify({ metadata: { generated_at: new Date().toISOString() }, results: filas.map(([id, status]) => ({ unique_id: id, status, execution_time: 0.2, message: status === 'error' ? 'Parser Error' : null, failures: status === 'warn' ? 3 : null })) }));
fs.writeFileSync('target/manifest.json', JSON.stringify({ nodes: { 'model.tienda.stg': { name: 'stg', resource_type: 'model' }, 'model.tienda.roto': { name: 'roto', resource_type: 'model' }, 'test.tienda.t1': { name: 't1', resource_type: 'test', attached_node: 'model.tienda.stg' } }, sources: {}, macros: {} }));
console.log('Running with dbt=1.12.6');
process.exit(sel === 'roto' ? 1 : 0);
`);
esc('.amoxsql/project.json', JSON.stringify({ dbt: { entorno: { tipo: 'python', ruta: FALSO.carpeta } } }));
const local = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);

try {
    await baseCentral.abrir();
    const avisos = [];
    programador.configurar({ dbManager: null, avisar: (a) => avisos.push(a), proximaCambio: () => {} });

    console.log('\nprogramar un comando de dbt');
    const p1 = await programaciones.crear({ proceso: 'dbt build --select stg+', proyecto: P, regla: { tipo: 'diaria', hora: '02:00' } }, { ahora: local(2026, 10, 1, 12) });
    comprobar('se guarda el comando como proceso, con su nombre', p1.proceso === 'dbt build --select stg+' && p1.nombre === 'dbt build stg+', JSON.stringify(p1).slice(0, 200));
    let e = await lanza(() => programaciones.crear({ proceso: 'dbt run && calc', proyecto: P, regla: { tipo: 'diaria', hora: '02:00' } }));
    comprobar('un comando con algo de shell no se programa', /only a shell would run/.test(e?.message || ''), e?.message);
    e = await lanza(() => programaciones.crear({ proceso: 'dbt build', proyecto: TMP, regla: { tipo: 'diaria', hora: '02:00' } }));
    comprobar('fuera de un proyecto dbt, tampoco', /not a dbt project/.test(e?.message || ''));

    console.log('\nel reloj lo corre');
    let r = await programador.tick(local(2026, 10, 2, 2, 1));
    const corrida = r.corridas.find(x => x.programacionId === p1.id);
    comprobar('a su hora, con el corredor', corrida?.estado === 'ok', JSON.stringify(r).slice(0, 300));
    const [fila] = await baseCentral.query('SELECT proceso, origen, estado, programacion_id, prevista, resumen FROM ejecuciones WHERE programacion_id = $1', [p1.id]);
    comprobar('su fila: el comando, programada, con su hora prevista y su resumen', fila?.origen === 'programada' && fila.proceso.startsWith('dbt build --select stg+') && !!fila.prevista && JSON.parse(fila.resumen).tipo === 'dbt', JSON.stringify(fila).slice(0, 300));
    comprobar('y avisa (siempre)', avisos.length === 1 && avisos[0].ok && /dbt build/.test(avisos[0].texto), JSON.stringify(avisos));
    r = await programador.tick(local(2026, 10, 2, 2, 30));
    comprobar('la misma ocurrencia no corre dos veces', !r.corridas.some(x => x.programacionId === p1.id));

    const p2 = await programaciones.crear({ proceso: 'dbt test --select aviso', proyecto: P, regla: { tipo: 'diaria', hora: '03:00' }, avisar: 'fallo' }, { ahora: local(2026, 10, 1, 12) });
    avisos.length = 0;
    await programador.tick(local(2026, 10, 2, 3, 1));
    comprobar('con «sólo si falla», un test en warn también avisa (Dec-34)', avisos.length === 1 && avisos[0].ok === false && /warnings/.test(avisos[0].titulo), JSON.stringify(avisos));
    const p3 = await programaciones.crear({ proceso: 'dbt run --select roto', proyecto: P, regla: { tipo: 'diaria', hora: '04:00' }, avisar: 'fallo' }, { ahora: local(2026, 10, 1, 12) });
    avisos.length = 0;
    r = await programador.tick(local(2026, 10, 2, 4, 1));
    comprobar('un modelo que falla: la corrida falla y avisa', r.corridas.find(x => x.programacionId === p3.id)?.estado === 'fallo' && avisos.length === 1 && avisos[0].ok === false, JSON.stringify(avisos));
    await programaciones.pausar(p2.id);

    console.log('\nla línea de comandos');
    let a = ordenes.leerArgumentos(['AmoxSQL.exe', 'dbt', 'build', '--select', 'stg+', '--project', P], { desde: 1 });
    comprobar('AmoxSQL.exe dbt build --select stg+ --project <carpeta>', a.orden === 'dbt' && a.proceso === 'dbt build --select stg+' && a.proyecto === P && !a.error, JSON.stringify(a));
    comprobar('sin --project, lo dice', /--project is required/.test(ordenes.leerArgumentos(['x', 'dbt', 'build'], { desde: 1 }).error || ''));
    comprobar('sin comando, lo dice', /Which dbt command/.test(ordenes.leerArgumentos(['x', 'dbt', '--project', P], { desde: 1 }).error || ''));
    comprobar('algo de shell, lo rechaza', /only a shell/.test(ordenes.leerArgumentos(['x', 'dbt', 'run', '&&', 'calc', '--project', P], { desde: 1 }).error || ''));
    comprobar('una carpeta sin dbt_project.yml', /is not a dbt project/.test(ordenes.comprobarQueExiste({ orden: 'dbt', proyecto: TMP }) || ''));
    const linea = require(path.join(RAIZ, 'server/ejecucion/lineaDeComandos.js'));
    let res = await linea.atender({ ...a, id: ordenes.nuevoId() }, { dbManager: null });
    comprobar('corre, sale con 0 y su texto es el resumen', res.codigo === 0 && /^AmoxSQL: dbt build · 1 model, 1 test/.test(ordenes.textoDelResultado(res)), ordenes.textoDelResultado(res));
    a = ordenes.leerArgumentos(['x', 'dbt', 'run', '--select', 'roto', '--project', P], { desde: 1 });
    res = await linea.atender({ ...a, id: ordenes.nuevoId() }, { dbManager: null });
    const texto = ordenes.textoDelResultado(res);
    comprobar('un fallo sale con 1 y dice qué modelo', res.codigo === 1 && /FAIL roto/.test(texto) && /Log: /.test(texto), texto);
    const [cli] = await baseCentral.query("SELECT origen FROM ejecuciones WHERE id = $1", [res.runId]);
    comprobar('  y queda en el historial como línea de comandos', cli?.origen === 'linea_de_comandos');

    console.log('\npor el servidor');
    await baseCentral.cerrar();
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(rr => setTimeout(rr, 100));
    const u = (q) => `http://localhost:${port}${q}`;
    const pedir = (m) => (q, b) => fetch(u(q), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    await pedir('POST')('/api/project/open', { path: P });
    let h = await pedir('POST')('/api/programaciones', { proceso: 'dbt source freshness', regla: { tipo: 'cada', horas: 2, desde: '08:00', hasta: '18:00' } });
    comprobar('el diálogo Schedule… con un comando de dbt', h.programacion?.proceso === 'dbt source freshness', JSON.stringify(h).slice(0, 200));
    h = await pedir('GET')(`/api/programaciones?proceso=${encodeURIComponent('dbt build')}`);
    comprobar('y la lista de ese diálogo enseña las de dbt del proyecto', (h.programaciones || []).filter(x => x.proceso.startsWith('dbt ')).length === 4, JSON.stringify((h.programaciones || []).map(x => x.proceso)));
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
