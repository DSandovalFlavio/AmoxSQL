/**
 * Parámetros con tipo, desde fuera y en lote (D4), fase 2 del plan de la 5.11.
 *
 *     node scripts/probarParametros.mjs
 *
 *   - Cada tipo se comprueba (número, fecha, lista, sí/no, texto) con un
 *     mensaje que dice qué se esperaba.
 *   - `${x}` según dónde está (Dec-19): con tipo, `getvariable`; entre comillas,
 *     con las comillas dobladas; en un nombre de archivo, sin carpetas.
 *   - Un valor de fuera no cuela SQL; lo del autor corre exactamente igual que
 *     antes (también los «trucos» con comillas).
 *   - El ejecutor fija los valores con su tipo; el nodo de archivo .sql también
 *     los recibe.
 *   - Línea de comandos: un `--param` mal escrito sale con código 2 antes de
 *     correr nada; `--batch` corre una vez por fila y resume.
 *   - «Run for each» de la interfaz (/api/chains/lote), por SSE.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-parametros-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const P = require(path.join(RAIZ, 'server/parametros.js'));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const falla = (f) => { try { f(); return null; } catch (e) { return e; } };

try {
    console.log('\ntipos');
    const def = (tipo, extra = {}) => ({ nombre: 'x', tipo, etiqueta: 'Store', requerido: true, ...extra });
    comprobar('número', P.validar(def('numero'), ' 12.5 ') === 12.5 && /is a number; "doce" is not/.test(falla(() => P.validar(def('numero'), 'doce'))?.message));
    comprobar('fecha AAAA-MM-DD, y «hoy»', P.validar(def('fecha'), '2026-10-05') === '2026-10-05' && /^\d{4}-\d{2}-\d{2}$/.test(P.validar(def('fecha'), 'hoy')));
    comprobar('una fecha que no existe', /YYYY-MM-DD/.test(falla(() => P.validar(def('fecha'), '2026-02-30'))?.message || ''));
    comprobar('lista: sólo sus opciones', P.validar(def('lista', { opciones: ['norte', 'sur'] }), 'sur') === 'sur' && /one of norte, sur/.test(falla(() => P.validar(def('lista', { opciones: ['norte', 'sur'] }), 'este'))?.message || ''));
    comprobar('sí/no', P.validar(def('logico'), 'sí') === true && P.validar(def('logico'), '0') === false);
    comprobar('obligatorio vacío', /"Store" needs a value/.test(falla(() => P.validar(def('texto'), ''))?.message || ''));
    const cadenaTipada = { parametros: [{ nombre: 'desde', tipo: 'fecha' }, { nombre: 'minimo', tipo: 'numero' }], variables: { desde: '2026-01-01', minimo: '0', tienda: 'norte' } };
    comprobar('un parámetro que el proceso no tiene', /has no parameter "tiendas"/.test(falla(() => P.resolver(cadenaTipada, { tiendas: 'x' }))?.message || ''));

    console.log('\n${x} según dónde está');
    const ctx = P.resolver(cadenaTipada, { tienda: 'sur' });
    let sql = P.reescribirSql(`SELECT * FROM v WHERE fecha >= \${desde} AND importe > \${minimo} AND tienda = '\${tienda}' -- \${tienda}`, ctx);
    comprobar('con tipo: getvariable; entre comillas: el texto', sql === `SELECT * FROM v WHERE fecha >= getvariable('desde') AND importe > getvariable('minimo') AND tienda = 'sur' -- sur`, sql);
    comprobar('SET VARIABLE con su tipo', P.sentenciasSet(ctx).join(' | ') === `SET VARIABLE desde = DATE '2026-01-01' | SET VARIABLE minimo = 0::BIGINT`, P.sentenciasSet(ctx).join(' | '));
    const malo = `x'; DROP TABLE ventas; --`;
    sql = P.reescribirSql(`SELECT * FROM v WHERE tienda = '\${tienda}'`, P.resolver(cadenaTipada, { tienda: malo }));
    comprobar('de fuera, entre comillas: las comillas se doblan (no cuela)', sql === `SELECT * FROM v WHERE tienda = 'x''; DROP TABLE ventas; --'`, sql);
    let e = falla(() => P.reescribirSql(`SELECT * FROM v WHERE tienda = \${tienda}`, P.resolver(cadenaTipada, { tienda: malo })));
    comprobar('de fuera, sin tipo y fuera de comillas: se para y pide el tipo', /Declare the parameter's type/.test(e?.message || ''), e?.message);
    sql = P.reescribirSql(`SELECT * FROM v LIMIT \${tienda}`, P.resolver(cadenaTipada, { tienda: '25' }));
    comprobar('de fuera, sin tipo: un número o una palabra sí pasan', sql === 'SELECT * FROM v LIMIT 25');
    sql = P.reescribirSql(`SELECT * FROM "\${tienda}"`, P.resolver(cadenaTipada, { tienda: 'a"b' }));
    comprobar('en un identificador: comillas dobladas', sql === `SELECT * FROM "a""b"`, sql);
    const autor = { variables: { lista: `a','b`, tabla: 'ventas' } };
    sql = P.reescribirSql(`SELECT * FROM \${tabla} WHERE x IN ('\${lista}')`, P.resolver(autor, {}));
    comprobar('lo del autor, igual que antes (también el truco de las comillas)', sql === `SELECT * FROM ventas WHERE x IN ('a','b')`, sql);
    comprobar('un ${x} que no es un parámetro se queda como está', P.reescribirSql(`SELECT '\${nada}'`, P.resolver(autor, {})) === `SELECT '\${nada}'`);
    e = falla(() => P.reescribirTexto('salidas/${tienda}.xlsx', P.resolver(cadenaTipada, { tienda: '../../Windows/x' }), { ruta: true, campo: 'outputPath' }));
    comprobar('de fuera, en un nombre de archivo: sin carpetas ni ..', /cannot contain folders/.test(e?.message || ''), e?.message);
    comprobar('del autor, en una ruta, como siempre', P.reescribirTexto('${tabla}/x.csv', P.resolver(autor, {}), { ruta: true }) === 'ventas/x.csv');
    const conf = P.aplicarAConfig({ query: `SELECT \${minimo}`, outputPath: 'out_${tienda}.csv', newColumns: [{ name: 'c', expression: `\${minimo} * 2` }] }, ctx);
    comprobar('la configuración de un paso: SQL, rutas y expresiones', conf.query === `SELECT getvariable('minimo')` && conf.outputPath === 'out_sur.csv' && conf.newColumns[0].expression === `getvariable('minimo') * 2`, JSON.stringify(conf));
    comprobar('un lote en CSV (con comillas y punto y coma)', JSON.stringify(P.leerCsv('tienda;nota\nnorte;"a; b"\nsur;"dice ""hola"""\n')) === JSON.stringify([{ tienda: 'norte', nota: 'a; b' }, { tienda: 'sur', nota: 'dice "hola"' }]));

    console.log('\ncorriendo procesos');
    const { startServer, atenderOrden } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
    const post = (p, b) => fetch(`http://localhost:${port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const PR = path.join(TMP, 'tiendas');
    fs.mkdirSync(path.join(PR, 'consultas'), { recursive: true });
    fs.writeFileSync(path.join(PR, 'ventas.csv'), 'tienda,importe,fecha\nnorte,10,2026-01-05\nsur,20,2026-02-10\nnorte,30,2026-03-15\nsur,40,2026-03-20\n');
    fs.writeFileSync(path.join(PR, 'consultas', 'por_tienda.sql'), `SELECT count(*)::INTEGER AS n FROM read_csv('ventas.csv') WHERE tienda = '\${tienda}' AND fecha >= \${desde}`);
    await post('/api/project/open', { path: PR });
    await post('/api/db/connect', { path: 'tiendas.duckdb' });
    await post('/api/query', { query: 'CREATE TABLE ventas AS SELECT * FROM read_csv(\'ventas.csv\')' });
    const proceso = {
        version: '1.0', name: 'semanal', config: { base: 'memoria' },
        parametros: [{ nombre: 'desde', tipo: 'fecha', etiqueta: 'From' }, { nombre: 'minimo', tipo: 'numero' }, { nombre: 'tienda', tipo: 'lista', opciones: ['norte', 'sur'] }],
        variables: { desde: '2026-01-01', minimo: '0', tienda: 'norte' },
        nodes: [
            { id: 'q', type: 'sql_inline', label: 'Filtrar', config: { query: `SELECT tienda, importe FROM read_csv('ventas.csv') WHERE tienda = \${tienda} AND fecha >= \${desde} AND importe > \${minimo}` } },
            { id: 'f', type: 'sql_file', label: 'Archivo', config: { filePath: 'consultas/por_tienda.sql' } },
            { id: 'x', type: 'export_file', label: 'Guardar', config: { format: 'csv', outputPath: 'salidas/${tienda}_${desde}.csv' } },
        ],
        edges: [{ id: 'e1', source: 'q', target: 'x' }], variables_: null,
    };
    fs.writeFileSync(path.join(PR, 'semanal.sqlchain'), JSON.stringify(proceso));
    let r = await post('/api/chains/run', { chainDefinition: proceso, chainFile: 'semanal.sqlchain', deFuera: { tienda: 'sur', desde: '2026-02-01', minimo: '25' } });
    const salida = path.join(PR, 'salidas', 'sur_2026-02-01.csv');
    comprobar('con tipo: compara fechas y números como tales', r.status === 'completed' && fs.existsSync(salida) && fs.readFileSync(salida, 'utf8').trim().split('\n').length === 2, JSON.stringify(r).slice(0, 300));
    comprobar('el nombre del archivo lleva los parámetros', fs.existsSync(salida));
    const res = await fetch(`http://localhost:${port}/api/chains/run/${r.runId}/resumen`).then(x => x.json());
    comprobar('el resumen de la ejecución dice qué dejó (para el formulario y el aviso)', res.estado === 'ok' && res.guardados?.[0]?.ruta === salida && res.guardados[0].existe && /semanal · 1 saved · /.test(res.linea), JSON.stringify(res).slice(0, 300));
    const fallida = await post('/api/chains/run', { chainDefinition: { ...proceso, nodes: [{ id: 'q', type: 'sql_inline', label: 'Filtrar', config: { query: 'SELECT * FROM no_existe' } }], edges: [] }, chainFile: 'semanal.sqlchain' });
    const resF = await fetch(`http://localhost:${port}/api/chains/run/${fallida.runId}/resumen`).then(x => x.json());
    comprobar('y si falló, en qué paso y por qué', resF.estado === 'fallo' && resF.fallo?.paso === 'Filtrar' && /semanal failed at "Filtrar": .*no_existe/.test(resF.linea), JSON.stringify(resF).slice(0, 300));
    r = await post('/api/chains/run', { chainDefinition: proceso, chainFile: 'semanal.sqlchain', deFuera: { tienda: 'este' } });
    comprobar('un valor que no es de la lista: 400 antes de correr', r.status === 400 && /one of norte, sur/.test(r.error || ''), JSON.stringify(r));
    const inyectado = { ...proceso, parametros: [], variables: { tienda: 'norte' }, nodes: [{ id: 'q', type: 'sql_inline', label: 'Filtrar', config: { query: `SELECT count(*) FROM ventas WHERE tienda = '\${tienda}'` } }], edges: [] };
    r = await post('/api/chains/run', { chainDefinition: inyectado, chainFile: 'x.sqlchain', deFuera: { tienda: `x'; DROP TABLE ventas; --` } });
    const sigue = await post('/api/query', { query: 'SELECT count(*)::INTEGER AS n FROM ventas' });
    comprobar('un valor de fuera con SQL dentro no borra nada', sigue.data?.[0]?.n === 4, JSON.stringify(sigue).slice(0, 200));
    const desnudo = { ...inyectado, nodes: [{ id: 'q', type: 'sql_inline', label: 'Filtrar', config: { query: `SELECT count(*) FROM ventas WHERE tienda = \${tienda}` } }] };
    r = await post('/api/chains/run', { chainDefinition: desnudo, chainFile: 'x.sqlchain', deFuera: { tienda: `'x' OR 1=1` } });
    comprobar('sin tipo y fuera de comillas: el paso falla y pide el tipo', r.status === 'failed' && /Declare the parameter's type/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 300));

    console.log('\nlínea de comandos');
    const orden = (extra) => ({ id: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`, proceso: path.join(PR, 'semanal.sqlchain'), proyecto: PR, parametros: {}, ...extra });
    r = await atenderOrden(orden({ parametros: { desde: '05/10/2026' } }));
    comprobar('un --param mal escrito: código 2, sin correr', r.codigo === 2 && /YYYY-MM-DD/.test(r.mensaje || '') && !r.runId, JSON.stringify(r).slice(0, 300));
    fs.writeFileSync(path.join(TMP, 'tiendas.csv'), 'tienda,desde\nnorte,2026-01-01\nsur,2026-01-01\n');
    r = await atenderOrden(orden({ lote: path.join(TMP, 'tiendas.csv') }));
    comprobar('--batch: una ejecución por fila', r.codigo === 0 && r.lote?.length === 2 && fs.existsSync(path.join(PR, 'salidas', 'norte_2026-01-01.csv')) && fs.existsSync(path.join(PR, 'salidas', 'sur_2026-01-01.csv')), JSON.stringify(r).slice(0, 400));
    const { textoDelResultado } = require(path.join(RAIZ, 'server/ejecucion/ordenes.js'));
    comprobar('y la consola lo resume', /2 of 2 runs finished/.test(textoDelResultado(r)), textoDelResultado(r));
    const filas = await baseCentral.query(`SELECT count(*)::INTEGER AS n FROM ejecuciones WHERE origen = 'lote'`);
    comprobar('cada una queda en la bitácora, como lote', filas[0].n === 2);
    fs.writeFileSync(path.join(TMP, 'mal.csv'), 'tienda\nnorte\noeste\n');
    r = await atenderOrden(orden({ lote: path.join(TMP, 'mal.csv') }));
    comprobar('un lote con una fila mala no corre ninguna', r.codigo === 2 && /In the batch: .*one of norte, sur/.test(r.mensaje || ''), r.mensaje);

    console.log('\nRun for each, desde la interfaz');
    const resp = await fetch(`http://localhost:${port}/api/chains/lote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chainDefinition: proceso, chainFile: 'semanal.sqlchain', lote: [{ tienda: 'norte' }, { tienda: 'sur' }] }) });
    const eventos = (await resp.text()).split('\n\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
    const resumen = eventos.find(x => x.tipo === 'resumen');
    comprobar('cuenta cada ejecución y el resumen', eventos.filter(x => x.tipo === 'fin').length === 2 && resumen?.bien === 2 && resumen.total === 2, JSON.stringify(eventos).slice(0, 300));
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
