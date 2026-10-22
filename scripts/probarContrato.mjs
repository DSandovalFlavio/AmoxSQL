/**
 * El contrato de una fuente y lo que falló sin nadie delante (5.13, fase 1; E2 + E3,
 * Dec-37 a Dec-40, Dec-45).
 *
 *     node scripts/probarContrato.mjs
 *
 * Por el servidor, con un home temporal y libros escritos celda a celda (como los
 * del cliente):
 *   - el contrato se normaliza; «Take today's columns» propone las familias de hoy;
 *   - con contrato, la fuente se lee como texto y llega convertida (sin falsos
 *     fallos por una celda vacía arriba o fechas como texto);
 *   - «Check» dice qué no cumple, en palabras: columna que falta (y si parece un
 *     cambio de nombre), un «N/A» entre números, vacíos, repetidos, rango, valores,
 *     filas mínimas, columnas de más si es estricto;
 *   - un proceso que lee la fuente (un nodo de fuente o SQL con fuentes."x") se para
 *     antes del primer paso, con «Source contract» en la ficha; con «avisar», corre y
 *     queda en aviso;
 *   - schema_validation y assert funcionan detrás de un nodo de fuente;
 *   - dbt no se lanza si una fuente de AmoxSQL que usa rompe su contrato;
 *   - «Needs attention»: lo programado que falló sale, con su razón, hasta que se ve
 *     o una ejecución posterior del mismo proceso termina bien.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { libro } from './ayudas/libroMinimo.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-contrato-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(path.join(P, 'datos'), { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 400) : ''}`); }
};

const contrato = require(path.join(RAIZ, 'server/contrato.js'));
const d = (i) => new Date(Date.UTC(2026, 9, 1 + (i % 28)));
const XLSX = path.join(P, 'datos', 'ventas.xlsx');
const escribir = (enc, filas) => libro(XLSX, enc, filas);
const ENC = ['Folio', 'Tienda', 'Importe', 'Fecha'];
const buenas = () => Array.from({ length: 20 }, (_, i) => [i + 1, ['norte', 'sur'][i % 2], 100 + i, d(i)]);

try {
    console.log('\nnormalizar');
    comprobar('un contrato vacío es null', contrato.normalizar({ columnas: [], reglas: [] }) === null);
    const n = contrato.normalizar({ columnas: [{ nombre: 'A', tipo: 'numero' }, { nombre: 'B', tipo: 'raro' }], reglas: [{ tipo: 'rango', columna: 'A', min: 0 }, { tipo: 'inventada' }] });
    comprobar('familia desconocida → texto; regla desconocida fuera; parar por defecto', n.columnas[1].tipo === 'texto' && n.reglas.length === 1 && n.alFallar === 'parar', JSON.stringify(n));
    let error = null;
    try { contrato.normalizar({ columnas: [{ nombre: 'A' }, { nombre: 'A' }] }); } catch (e) { error = e.message; }
    comprobar('una columna dos veces es un error', /twice/.test(error || ''));
    try { error = null; contrato.normalizar({ reglas: [{ tipo: 'rango', columna: 'A' }] }); } catch (e) { error = e.message; }
    comprobar('un rango sin mínimo ni máximo es un error', /minimum or a maximum/.test(error || ''));
    comprobar('fuentesQueLee: nodo de fuente y SQL con fuentes."x" / fuentes.y', JSON.stringify(contrato.fuentesQueLee([
        { type: 'fuente', config: { fuente: 'ventas' } },
        { type: 'sql_inline', config: { query: 'select * from fuentes."metas-2026" join FUENTES.tiendas using (id)' } },
        { type: 'fuente', config: { fuente: 'apagada' }, disabled: true },
    ]).sort()) === JSON.stringify(['metas-2026', 'tiendas', 'ventas']));

    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { ejecutarProceso } = require(path.join(RAIZ, 'server/ejecucion/ejecutarProceso.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST');
    const sql = (query) => post('/api/query', { query });
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: ':memory:' });

    // La primera celda de Importe vacía y la primera fecha vacía: con tipos, texto.
    escribir(ENC, [[1, 'norte', null, null], ...buenas().slice(1)]);
    const definicion = { nombre: 'ventas', tipo: 'archivo', ubicacion: 'datos/ventas.xlsx' };
    await post('/api/fuentes', { definicion });

    console.log('\ntomar el contrato de hoy');
    let h = await post('/api/fuentes/ventas/contrato/de-hoy', {});
    const familias = Object.fromEntries((h.contrato?.columnas || []).map(c => [c.nombre, c.tipo]));
    comprobar('las familias de hoy, aunque la primera celda esté vacía', familias.Folio === 'numero' && familias.Tienda === 'texto' && familias.Importe === 'numero' && familias.Fecha === 'fecha', JSON.stringify(h));
    let q = await sql('DESCRIBE fuentes."ventas"');
    comprobar('SIN contrato, el motor lee Importe y Fecha como texto (la trampa)', q.data?.find(c => c.column_name === 'Importe')?.column_type === 'VARCHAR', JSON.stringify(q.data?.map(c => c.column_type)));

    const deHoy = h.contrato;
    const conContrato = (extra = {}) => ({ ...definicion, contrato: { ...deHoy, ...extra } });
    await post('/api/fuentes', { definicion: conContrato(), anterior: 'ventas' });
    q = await sql('DESCRIBE fuentes."ventas"');
    const tipos = Object.fromEntries((q.data || []).map(c => [c.column_name, c.column_type]));
    comprobar('CON contrato, la fuente llega convertida: Importe DOUBLE, Fecha DATE', tipos.Importe === 'DOUBLE' && tipos.Fecha === 'DATE', JSON.stringify(tipos));
    q = await sql('SELECT sum("Importe") AS s, min("Fecha") AS f FROM fuentes."ventas"');
    comprobar('  y se suma y se compara como número y fecha', Number(q.data?.[0]?.s) === 2090 && String(q.data?.[0]?.f).startsWith('2026-10-02'), JSON.stringify(q.data));
    h = await post('/api/fuentes/ventas/comprobar', {});
    comprobar('Check: cumple', h.ok === true && h.filas === 20, JSON.stringify(h));

    console.log('\nlo que no cumple, en palabras');
    escribir(['Folio', 'Tienda', 'Monto', 'Fecha'], buenas());
    h = await post('/api/fuentes/ventas/comprobar', {});
    comprobar('columna renombrada: falta, con la sugerencia', !h.ok && /"Importe" is missing — "Monto" is new: was it renamed\?/.test(h.linea || ''), h.linea);
    q = await sql('SELECT count(*) FROM fuentes."ventas"');
    escribir(ENC, buenas().map((f, i) => (i === 7 ? [f[0], f[1], 'N/A', f[3]] : f)));
    h = await post('/api/fuentes/ventas/comprobar', {});
    comprobar('un «N/A» entre números: se cuenta y se nombra', !h.ok && /"Importe" has 1 value that is not a number: «N\/A»/.test(h.linea || ''), h.linea);
    escribir(ENC, buenas());
    await post('/api/fuentes', { anterior: 'ventas', definicion: conContrato({ reglas: [
        { tipo: 'no_nulos', columna: 'Tienda' }, { tipo: 'unico', columna: 'Folio' }, { tipo: 'rango', columna: 'Importe', min: 0, max: 110 },
        { tipo: 'valores', columna: 'Tienda', valores: ['norte'] }, { tipo: 'filas_minimas', filas: 50 },
    ] }) });
    escribir(ENC, [...buenas(), [1, null, 5, d(1)]]);
    h = await post('/api/fuentes/ventas/comprobar', {});
    const texto = h.linea || '';
    comprobar('vacíos', /"Tienda" has 1 empty value/.test(texto), texto);
    comprobar('repetidos, con el ejemplo', /"Folio" has 1 repeated value: «1»/.test(texto), texto);
    comprobar('fuera de rango, con los límites', /"Importe" has 9 values out of range \(min 0, max 110\)/.test(texto), texto);
    comprobar('valores no permitidos', /"Tienda" has 10 values that are not allowed: «sur»/.test(texto), texto);
    comprobar('filas mínimas', /it has 21 rows \(at least 50 expected\)/.test(texto), texto);
    await post('/api/fuentes', { anterior: 'ventas', definicion: conContrato({ estricto: true }) });
    escribir([...ENC, 'Notas'], buenas().map(f => [...f, 'x']));
    h = await post('/api/fuentes/ventas/comprobar', {});
    comprobar('estricto: una columna de más', /unexpected column "Notas"/.test(h.linea || ''), h.linea);

    console.log('\nun proceso que lee la fuente');
    await post('/api/fuentes', { anterior: 'ventas', definicion: conContrato() });
    escribir(['Folio', 'Tienda', 'Monto', 'Fecha'], buenas());
    const proceso = (nodos) => ({ name: 'Cierre', nodes: nodos, edges: nodos.slice(1).map((n, i) => ({ id: `e${i}`, source: nodos[i].id, target: n.id })), config: { base: 'memoria' } });
    const conFuente = proceso([
        { id: 'f', type: 'fuente', label: 'Ventas', config: { fuente: 'ventas' } },
        { id: 's', type: 'select_columns', label: 'Columnas', config: { columns: [{ name: 'Folio' }] } },
    ]);
    let r = await post('/api/chains/run', { chainDefinition: conFuente, chainFile: 'cierre.sqlchain' });
    comprobar('se para antes del primer paso', r.status === 'failed' && r.failedNodeId === '__contrato' && /"Importe" is missing/.test(r.error || ''), JSON.stringify(r));
    let res = await get(`/api/chains/run/${r.runId}/resumen`);
    comprobar('  la línea del resumen dice por qué', /failed at "Source contract": ventas: the column "Importe" is missing/.test(res.linea || ''), res.linea);
    const ficha = await get(`/api/ejecuciones/${r.runId}`);
    const pasos = ficha.pasos || ficha.nodeRuns || ficha.nodos || [];
    comprobar('  en la ficha, «Source contract» falló y los demás se saltaron', JSON.stringify(ficha).includes('Source contract') && JSON.stringify(ficha).includes('skipped'), JSON.stringify(pasos).slice(0, 300));
    r = await post('/api/chains/run', { chainDefinition: proceso([{ id: 'q', type: 'sql_inline', label: 'SQL', config: { query: 'select count(*) as n from fuentes."ventas"' } }]), chainFile: 'sql.sqlchain' });
    comprobar('también si sólo la nombra un SQL', r.status === 'failed' && r.failedNodeId === '__contrato', JSON.stringify(r));
    await post('/api/fuentes', { anterior: 'ventas', definicion: conContrato({ alFallar: 'avisar' }) });
    escribir(ENC, buenas().map((f, i) => (i === 3 ? [f[0], f[1], 'pendiente', f[3]] : f)));
    r = await post('/api/chains/run', { chainDefinition: conFuente, chainFile: 'cierre.sqlchain' });
    res = await get(`/api/chains/run/${r.runId}/resumen`);
    comprobar('con «avisar», corre y queda en aviso, con la razón', r.status === 'completed' && res.estado === 'aviso' && /finished with a warning: ventas: "Importe" has 1 value that is not a number: «pendiente»/.test(res.linea || ''), `${r.status} · ${res.estado} · ${res.linea}`);
    escribir(ENC, buenas());
    r = await post('/api/chains/run', { chainDefinition: conFuente, chainFile: 'cierre.sqlchain' });
    res = await get(`/api/chains/run/${r.runId}/resumen`);
    comprobar('cumpliendo, corre como siempre (con el paso del contrato en verde)', r.status === 'completed' && res.estado === 'ok', `${r.status} · ${res.estado}`);

    console.log('\nschema_validation y assert detrás de una fuente');
    r = await post('/api/chains/run', { chainFile: 'val.sqlchain', chainDefinition: proceso([
        { id: 'f', type: 'fuente', label: 'Ventas', config: { fuente: 'ventas' } },
        { id: 'v', type: 'schema_validation', label: 'Esquema', config: { expectedColumns: [{ name: 'Importe', type: 'DOUBLE' }] } },
    ]) });
    comprobar('schema_validation encuentra fuentes."ventas"', r.status === 'completed', JSON.stringify(r));
    r = await post('/api/chains/run', { chainFile: 'val.sqlchain', chainDefinition: proceso([
        { id: 'f', type: 'fuente', label: 'Ventas', config: { fuente: 'ventas' } },
        { id: 'a', type: 'assert', label: 'Sin vacíos', config: { assertType: 'no_nulls', column: 'Importe' } },
    ]) });
    comprobar('assert encuentra fuentes."ventas"', r.status === 'completed', JSON.stringify(r));

    console.log('\ndbt');
    const { contratosParaDbt } = require(path.join(RAIZ, 'server/dbt/ejecutar.js'));
    fs.writeFileSync(path.join(P, 'dbt_project.yml'), "name: tienda\nversion: '1.0'\nprofile: tienda\n");
    fs.mkdirSync(path.join(P, 'models', 'sources'), { recursive: true });
    fs.writeFileSync(path.join(P, 'models', 'sources', 'amoxsql.yml'), 'version: 2\nsources:\n  - name: amoxsql\n    tables:\n      - name: ventas\n        meta:\n          amoxsql_fuente: ventas\n');
    await post('/api/fuentes', { anterior: 'ventas', definicion: conContrato() });
    escribir(['Folio', 'Tienda', 'Monto', 'Fecha'], buenas());
    let c = await contratosParaDbt({ raiz: P, args: ['build'], dbManager });
    comprobar('dbt build: la fuente rompe su contrato → no se lanza', /ventas: the column "Importe" is missing/.test(c?.error || ''), JSON.stringify(c));
    c = await contratosParaDbt({ raiz: P, args: ['compile'], dbManager });
    comprobar('dbt compile no lee datos: no se comprueba', c === null);

    console.log('\nNeeds attention');
    const programado = async () => ejecutarProceso({ dbManager, chainDef: conFuente, proyecto: P, chainFile: 'cierre.sqlchain', origen: 'programada' });
    r = await programado();
    let a = await get('/api/operacion/atencion');
    let fila = a.atencion?.find(x => x.id === r.runId);
    comprobar('lo programado que falló sale, con la razón', !!fila && fila.estado === 'fallo' && /Source contract|"Importe" is missing/.test(fila.razon), JSON.stringify(a.atencion));
    const op = await get('/api/operacion?limite=1');
    comprobar('  y el botón de Operations lo cuenta', op.atencion >= 1, JSON.stringify(op.atencion));
    await post('/api/chains/run', { chainDefinition: conFuente, chainFile: 'cierre.sqlchain' });
    a = await get('/api/operacion/atencion');
    comprobar('lo lanzado desde la interfaz no cuenta (quien lo lanzó ya lo vio)', a.atencion.length === 1, JSON.stringify(a.atencion.map(x => x.origen)));
    await post('/api/operacion/atencion/vista', { ids: [r.runId] });
    a = await get('/api/operacion/atencion');
    comprobar('«Dismiss» (o abrir la ficha) la quita', !a.atencion.some(x => x.id === r.runId));
    r = await programado();
    a = await get('/api/operacion/atencion');
    comprobar('un fallo nuevo vuelve a salir', a.atencion.some(x => x.id === r.runId));
    escribir(ENC, buenas());
    await programado();
    a = await get('/api/operacion/atencion');
    comprobar('si la siguiente ejecución del proceso termina bien, ya está resuelto', !a.atencion.length, JSON.stringify(a.atencion));
    a = await get('/api/operacion/atencion?workspace=otro');
    comprobar('filtrar por workspace', Array.isArray(a.atencion) && a.atencion.length === 0);

    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
