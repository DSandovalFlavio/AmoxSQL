/**
 * Destinos de entrega (D6), fase 4 del plan de la 5.11.
 *
 *     node scripts/probarDestinos.mjs
 *
 *   - Fechas en los nombres: {fecha}, {fecha:AAAA-MM}, {hora}; la de la
 *     ejecución o la de la ocurrencia prevista.
 *   - Un destino del workspace: la definición en su carpeta (y en el
 *     .amoxworkspace), la carpeta de esta máquina en la base de AmoxSQL.
 *   - Un destino del proyecto dentro de su carpeta: relativo, sin registrar.
 *   - Los nodos Excel, Export File y Publish entregan en un destino; la
 *     subcarpeta con fecha se crea; el resumen de la ejecución dice dónde quedó.
 *   - Lo que falla se dice: sin carpeta aquí, carpeta que no se alcanza, un
 *     nombre con carpetas, un destino que no existe.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-destinos-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const destinos = require(path.join(RAIZ, 'server/destinos.js'));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

try {
    console.log('\nfechas en los nombres');
    const d = new Date(2026, 8, 30, 7, 5);
    comprobar('{fecha}, {fecha:AAAA-MM}, {hora}', destinos.ponerFechas('cierre_{fecha}_{fecha:AAAA-MM}_{hora}.xlsx', d) === 'cierre_2026-09-30_2026-09_0705.xlsx', destinos.ponerFechas('cierre_{fecha}_{fecha:AAAA-MM}_{hora}.xlsx', d));
    comprobar('y con formato a la inglesa (YYYY, DD)', destinos.ponerFechas('{fecha:YYYYMMDD}', d) === '20260930');
    comprobar('lo que no es una fecha se queda', destinos.ponerFechas('${tienda}_{otro}.csv', d) === '${tienda}_{otro}.csv');

    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (p, b) => fetch(`http://localhost:${port}${p}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
        .then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT'), del = pedir('DELETE');

    const PR = path.join(TMP, 'Tiendas del Norte');
    const COMPARTIDA = path.join(TMP, 'G', 'Clientes', 'Norte', 'Reportes');
    fs.mkdirSync(PR, { recursive: true });
    fs.mkdirSync(COMPARTIDA, { recursive: true });
    const w = await post('/api/workspaces', { nombre: 'Norte' });
    await post('/api/project/open', { path: PR });
    await put('/api/project/workspace', { workspaceId: w.id });

    console.log('\nun destino del workspace');
    let r = await post('/api/destinos', { workspaceId: w.id, definicion: { nombre: 'entrega-cliente', descripcion: 'La carpeta del cliente', subcarpeta: '{fecha:AAAA}' }, ubicacionAqui: COMPARTIDA });
    comprobar('se crea', r.status === 200 && r.destino?.nombre === 'entrega-cliente', JSON.stringify(r));
    const archivoDef = path.join(HOME, 'workspaces', w.id, 'destinos', 'entrega-cliente.json');
    const def = JSON.parse(fs.readFileSync(archivoDef, 'utf8'));
    comprobar('la definición viaja sin la carpeta de esta máquina', def.subcarpeta === '{fecha:AAAA}' && !JSON.stringify(def).includes('Reportes'), JSON.stringify(def));
    r = await get('/api/destinos');
    const visto = r.destinos?.find(x => x.nombre === 'entrega-cliente');
    comprobar('el proyecto lo ve, listo, con su carpeta aquí', visto?.origen === 'workspace' && visto.estado === 'listo' && visto.ubicacionAqui === COMPARTIDA, JSON.stringify(r));

    console.log('\nentregar desde un proceso');
    const ventas = `SELECT * FROM (VALUES ('norte', 10.5), ('sur', 20.0)) v(tienda, importe)`;
    const proceso = (nodo) => ({
        version: '1.0', name: 'cierre', config: { base: 'memoria' }, variables: { tienda: 'norte' },
        parametros: [{ nombre: 'tienda', tipo: 'lista', opciones: ['norte', 'sur'] }],
        nodes: [{ id: 'v', type: 'sql_inline', label: 'Ventas', config: { query: ventas } }, { id: 'x', label: 'Salida', ...nodo }],
        edges: [{ id: 'e', source: 'v', target: 'x' }],
    });
    const anio = String(new Date().getFullYear());
    const mes = `${anio}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    r = await post('/api/chains/run', { chainDefinition: proceso({ type: 'excel', config: { modo: 'libro', destino: 'entrega-cliente', outputPath: 'cierre_{fecha:AAAA-MM}_${tienda}.xlsx' } }), chainFile: 'cierre.sqlchain', deFuera: { tienda: 'sur' } });
    const esperado = path.join(COMPARTIDA, anio, `cierre_${mes}_sur.xlsx`);
    comprobar('el Excel queda en la carpeta del destino, con su subcarpeta y su fecha', r.status === 'completed' && fs.existsSync(esperado), `${JSON.stringify(r).slice(0, 200)} · ${esperado}`);
    const res = await get(`/api/chains/run/${r.runId}/resumen`);
    comprobar('y el resumen dice dónde quedó', res.guardados?.[0]?.ruta === esperado, JSON.stringify(res.guardados));
    r = await post('/api/chains/run', { chainDefinition: proceso({ type: 'export_file', config: { format: 'csv', destino: 'entrega-cliente', outputPath: 'ventas_{fecha}.csv' } }), chainFile: 'cierre.sqlchain' });
    const hoy = new Date();
    const csv = path.join(COMPARTIDA, anio, `ventas_${anio}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}.csv`);
    comprobar('Export File también', r.status === 'completed' && fs.existsSync(csv), `${JSON.stringify(r).slice(0, 200)} · ${csv}`);
    r = await post('/api/chains/run', { chainDefinition: proceso({ type: 'publicar', config: { fuente: 'ventas-limpias', destino: 'entrega-cliente', formato: 'parquet' } }), chainFile: 'cierre.sqlchain' });
    comprobar('y Publish', r.status === 'completed' && fs.existsSync(path.join(COMPARTIDA, anio, 'ventas-limpias.parquet')), JSON.stringify(r).slice(0, 300));

    const { ChainExecutor } = (() => { try { return { ChainExecutor: require(path.join(RAIZ, 'server/ChainExecutor.js')) }; } catch { return {}; } })();
    const ruta = await ChainExecutor.rutaDeSalida({ destino: 'entrega-cliente', outputPath: 'cierre_{fecha:AAAA-MM}.xlsx' }, PR, { fechaReferencia: '2025-12-31T07:00:00' });
    comprobar('una ejecución programada usa la fecha que tocaba', ruta === path.join(COMPARTIDA, '2025', 'cierre_2025-12.xlsx'), ruta);

    console.log('\nlo que falla, con nombre');
    r = await post('/api/chains/run', { chainDefinition: proceso({ type: 'excel', config: { destino: 'entrega-cliente', outputPath: 'sub/carpeta.xlsx' } }), chainFile: 'cierre.sqlchain' });
    comprobar('un nombre con carpetas', r.status === 'failed' && /is a file name, without folders/.test(r.error || ''), r.error);
    r = await post('/api/chains/run', { chainDefinition: proceso({ type: 'excel', config: { destino: 'no-existe', outputPath: 'x.xlsx' } }), chainFile: 'cierre.sqlchain' });
    comprobar('un destino que no existe', r.status === 'failed' && /no destination named "no-existe"/.test(r.error || ''), r.error);
    await put('/api/destinos/entrega-cliente/ubicacion', { ubicacion: null });
    r = await get('/api/destinos');
    comprobar('sin carpeta en esta máquina: el panel lo dice', r.destinos?.find(x => x.nombre === 'entrega-cliente')?.estado === 'sin_ubicar');
    r = await post('/api/chains/run', { chainDefinition: proceso({ type: 'excel', config: { destino: 'entrega-cliente', outputPath: 'x.xlsx' } }), chainFile: 'cierre.sqlchain' });
    comprobar('y el proceso, al correr', r.status === 'failed' && /has no folder on this machine/.test(r.error || ''), r.error);
    const DESCONECTADA = path.join(TMP, 'unidad-que-no-esta');
    await put('/api/destinos/entrega-cliente/ubicacion', { ubicacion: DESCONECTADA });
    r = await post('/api/chains/run', { chainDefinition: proceso({ type: 'excel', config: { destino: 'entrega-cliente', outputPath: 'x.xlsx' } }), chainFile: 'cierre.sqlchain' });
    comprobar('una carpeta que no se alcanza (unidad desconectada): no la inventa', r.status === 'failed' && /not reachable/.test(r.error || '') && !fs.existsSync(DESCONECTADA), r.error);
    comprobar('y el panel la marca', (await get('/api/destinos')).destinos?.find(x => x.nombre === 'entrega-cliente')?.estado === 'no_se_llega');

    console.log('\nun destino del proyecto, dentro de su carpeta');
    r = await post('/api/destinos', { definicion: { nombre: 'salidas' }, ubicacionAqui: path.join(PR, 'salidas') });
    const defP = JSON.parse(fs.readFileSync(path.join(PR, '.amoxsql', 'destinos', 'salidas.json'), 'utf8'));
    comprobar('va relativo en la definición: vale en todas las máquinas', defP.ubicacion === 'salidas', JSON.stringify(defP));
    fs.mkdirSync(path.join(PR, 'salidas'), { recursive: true });
    r = await post('/api/chains/run', { chainDefinition: proceso({ type: 'export_file', config: { format: 'csv', destino: 'salidas', outputPath: 'v.csv' } }), chainFile: 'cierre.sqlchain' });
    comprobar('y se entrega ahí', r.status === 'completed' && fs.existsSync(path.join(PR, 'salidas', 'v.csv')), JSON.stringify(r).slice(0, 200));
    const e = await post('/api/destinos', { definicion: { nombre: 'Mal Nombre' } });
    comprobar('un nombre que no vale', e.status === 400 && /lowercase letters, digits and hyphens/.test(e.error || ''), e.error);

    console.log('\nviaja con el workspace');
    const exp = await get(`/api/workspaces/${w.id}/exportar`);
    const contexto = exp.contexto || exp.archivo?.contexto || {};
    comprobar('el .amoxworkspace lleva la definición, no la carpeta', 'destinos/entrega-cliente.json' in contexto && !JSON.stringify(exp).includes('unidad-que-no-esta'), Object.keys(contexto).join(', '));
    r = await del(`/api/destinos/entrega-cliente`);
    comprobar('borrarlo desde el proyecto borra el del workspace', r.ok && !fs.existsSync(archivoDef));
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
