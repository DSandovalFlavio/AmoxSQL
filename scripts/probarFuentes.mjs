/**
 * Las fuentes con nombre (C1), fase 1 del plan de la 5.10.
 *
 *     node scripts/probarFuentes.mjs
 *
 *   - Definir en un workspace y en un proyecto; con el mismo nombre gana el proyecto.
 *   - Ubicar en esta máquina y consultar por nombre: desde el editor, desde un
 *     nodo Source de Data Flow en contexto aislado y desde la línea de comandos.
 *   - Un archivo dentro del proyecto va relativo en la definición, sin registro.
 *   - Excel con rango (las reglas de la prueba 0.2).
 *   - Una fuente sin ubicar falla con su mensaje; la línea de comandos sale con 3.
 *   - La base del proyecto no recibe nada; el explorador no las mezcla con sus tablas.
 *   - El manifiesto anota las fuentes que se usan.
 *   - Exportar el workspace lleva la definición y no la ubicación; una «segunda
 *     máquina» (otro home) la importa, la ubica en otro sitio y lee lo mismo.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const SEGUNDA = process.argv[2] === '--segunda';
const TMP = SEGUNDA ? process.argv[3] : fs.mkdtempSync(path.join(os.tmpdir(), 'amox-fuentes-'));
const HOME = path.join(TMP, SEGUNDA ? 'home-2' : 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { startServer, atenderOrden } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const { port } = await startServer(0);
for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT'), del = pedir('DELETE');
const consulta = async (sql) => {
    await get('/api/fuentes');              // espera a que el catálogo esté montado
    return post('/api/query', { query: sql });
};

// ── La segunda máquina: importa el workspace, abre la copia del proyecto y ubica
if (SEGUNDA) {
    const [, , , , archivo, carpeta, otraUbicacion] = process.argv;
    const salida = {};
    await post('/api/workspaces-importar', { contenido: fs.readFileSync(archivo, 'utf8'), opciones: {} });
    await post('/api/project/open', { path: carpeta });
    salida.antes = (await get('/api/fuentes')).fuentes.map(f => ({ nombre: f.nombre, estado: f.estado, origen: f.origen }));
    salida.sinUbicar = await consulta(`SELECT count(*) AS n FROM fuentes."ventas-semanales"`);
    salida.requisitos = await get('/api/project/requisitos');
    salida.ubicar = await put('/api/fuentes/ventas-semanales/ubicacion', { ubicacion: otraUbicacion, workspaceId: salida.antes.find(f => f.nombre === 'ventas-semanales') ? (await get('/api/fuentes')).workspaceId : null });
    salida.despues = await consulta(`SELECT sum(importe)::INTEGER AS total FROM fuentes."ventas-semanales"`);
    salida.metas = await consulta(`SELECT count(*)::INTEGER AS n FROM fuentes."metas"`);
    await baseCentral.cerrar();
    process.stdout.write('\nRESULTADO ' + JSON.stringify(salida) + '\n');
    process.exit(0);
}

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const escribir = (ruta, texto) => { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, texto); };

const A = path.join(TMP, 'ventas-q4');
const ENTRADA = path.join(TMP, 'carpeta-sincronizada', 'entrada');
const VENTAS = path.join(ENTRADA, 'ventas semana 39.csv');
escribir(VENTAS, 'tienda,importe\nnorte,10\nsur,20\ncentro,12\n');
escribir(path.join(A, 'datos', 'metas.csv'), 'tienda,meta\nnorte,15\nsur,15\n');
escribir(path.join(A, 'datos', 'ventas-local.csv'), 'tienda,importe\nsolo-del-proyecto,1\n');
escribir(path.join(A, 'flujos', 'semanal.sqlchain'), JSON.stringify({
    version: '1.0', name: 'semanal', config: { base: 'auto' },
    nodes: [
        { id: 'a', type: 'fuente', label: 'Ventas', config: { fuente: 'ventas-semanales' } },
        { id: 'b', type: 'export_file', label: 'A Parquet', config: { outputPath: 'salida/ventas.parquet', format: 'parquet' } },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b' }], variables: {},
}));
const CLIENTE = path.join(RAIZ, 'scripts', 'fixtures', 'excel', 'cliente.xlsx');

try {
    const w = await post('/api/workspaces', { nombre: 'Tiendas del Norte' });
    await post('/api/project/open', { path: A });
    await put('/api/project/workspace', { workspaceId: w.id });
    const conectado = await post('/api/db/connect', { path: 'proyecto.duckdb' });
    comprobar('[preparar] proyecto enlazado y con base', w.id && conectado.success, JSON.stringify(conectado));

    console.log('\ndefinir y ubicar');
    let r = await post('/api/fuentes', {
        workspaceId: w.id,
        definicion: { nombre: 'ventas-semanales', descripcion: 'Ventas por tienda, llegan cada lunes' },
        ubicacionAqui: VENTAS,
    });
    comprobar('una fuente del workspace se crea', r.status === 200 && r.fuente?.nombre === 'ventas-semanales', JSON.stringify(r));
    const defW = path.join(HOME, 'workspaces', w.id, 'fuentes', 'ventas-semanales.json');
    const textoDefW = fs.existsSync(defW) ? fs.readFileSync(defW, 'utf8') : '';
    comprobar('su definición es texto del workspace', !!textoDefW && JSON.parse(textoDefW).descripcion === 'Ventas por tienda, llegan cada lunes');
    comprobar('y NO lleva la ruta de esta máquina', !textoDefW.includes('carpeta-sincronizada'), textoDefW);
    const locales = await baseCentral.query(`SELECT * FROM fuentes_locales`);
    comprobar('la ruta va a la base de AmoxSQL, por el id del workspace', locales.length === 1 && locales[0].ambito === `w:${w.id}` && locales[0].ubicacion === VENTAS, JSON.stringify(locales));

    r = await post('/api/fuentes', { definicion: { nombre: 'metas' }, ubicacionAqui: path.join(A, 'datos', 'metas.csv') });
    const defP = path.join(A, '.amoxsql', 'fuentes', 'metas.json');
    const jsonP = fs.existsSync(defP) ? JSON.parse(fs.readFileSync(defP, 'utf8')) : {};
    comprobar('un archivo dentro del proyecto va relativo en la definición', jsonP.ubicacion === 'datos/metas.csv', JSON.stringify(jsonP));
    comprobar('y no se registra en la base', (await baseCentral.query(`SELECT count(*)::INTEGER AS n FROM fuentes_locales WHERE nombre = 'metas'`))[0].n === 0);

    r = await post('/api/fuentes', { definicion: { nombre: 'Ventas Semanales' } });
    comprobar('un nombre con mayúsculas o espacios se rechaza', r.status === 400 && /lowercase/.test(r.error || ''), JSON.stringify(r));

    console.log('\nconsultar por nombre');
    r = await consulta(`SELECT sum(importe)::INTEGER AS total FROM fuentes."ventas-semanales"`);
    comprobar('desde el editor: fuentes."ventas-semanales"', r.data?.[0]?.total === 42 || r.rows?.[0]?.total === 42, JSON.stringify(r).slice(0, 300));
    r = await consulta(`SELECT count(*)::INTEGER AS n FROM fuentes."metas"`);
    comprobar('la del proyecto, también', (r.data || r.rows)?.[0]?.n === 2, JSON.stringify(r).slice(0, 300));
    fs.appendFileSync(VENTAS, 'este,8\n');
    r = await consulta(`SELECT sum(importe)::INTEGER AS total FROM fuentes."ventas-semanales"`);
    comprobar('lee el archivo cada vez (sin rehacer nada)', (r.data || r.rows)?.[0]?.total === 50, JSON.stringify(r).slice(0, 300));
    const pj = JSON.parse(fs.readFileSync(path.join(A, '.amoxsql', 'project.json'), 'utf8'));
    comprobar('el manifiesto anota las fuentes que se usan', JSON.stringify(pj.requiere?.fuentes) === JSON.stringify(['metas', 'ventas-semanales']), JSON.stringify(pj.requiere));

    console.log('\nla base del proyecto y el explorador');
    r = await consulta(`SELECT count(*)::INTEGER AS n FROM duckdb_views() WHERE database_name = 'user_db' AND NOT internal`);
    comprobar('la base del proyecto no recibe vistas', (r.data || r.rows)?.[0]?.n === 0, JSON.stringify(r).slice(0, 200));
    const esquemas = await fetch(u('/api/db/schemas')).then(x => x.json());
    const nombres = esquemas.flatMap(s => s.tables.map(t => `${s.schema}.${t.name}`));
    comprobar('el explorador no las mezcla con las tablas', !nombres.some(n => /ventas-semanales|metas/.test(n)), nombres.join(', '));
    const cols = (await get('/api/fuentes/columnas')).fuentes || [];
    const cv = cols.find(f => f.nombre === 'ventas-semanales');
    comprobar('y las enseña aparte, con sus columnas y su descripción', cv && cv.columnas.map(c => c.nombre).join() === 'tienda,importe' && cv.descripcion === 'Ventas por tienda, llegan cada lunes', JSON.stringify(cv));

    console.log('\nel proyecto gana con el mismo nombre');
    await post('/api/fuentes', { definicion: { nombre: 'ventas-semanales' }, ubicacionAqui: path.join(A, 'datos', 'ventas-local.csv') });
    let lista = await get('/api/fuentes');
    let v = lista.fuentes.find(f => f.nombre === 'ventas-semanales');
    comprobar('la lista dice que sobrescribe la del workspace', v?.origen === 'proyecto' && v.sobrescribe === 'workspace', JSON.stringify(v));
    r = await consulta(`SELECT tienda FROM fuentes."ventas-semanales"`);
    comprobar('y se lee la del proyecto', (r.data || r.rows)?.[0]?.tienda === 'solo-del-proyecto', JSON.stringify(r).slice(0, 200));
    await del('/api/fuentes/ventas-semanales');
    r = await consulta(`SELECT sum(importe)::INTEGER AS total FROM fuentes."ventas-semanales"`);
    comprobar('al quitarla, vuelve la del workspace', (r.data || r.rows)?.[0]?.total === 50, JSON.stringify(r).slice(0, 200));

    console.log('\nExcel con rango (prueba 0.2)');
    await post('/api/fuentes', {
        definicion: { nombre: 'reporte-cliente', excel: { hoja: 'Ventas', rango: 'A4:E' } },
        ubicacionAqui: CLIENTE,
    });
    r = await consulta(`SELECT count(*)::INTEGER AS n, max(Notas) AS nota FROM fuentes."reporte-cliente"`);
    comprobar('A4:E lee de la fila 4 a la primera vacía, sin el pie', (r.data || r.rows)?.[0]?.n === 6, JSON.stringify(r).slice(0, 300));
    comprobar('y el texto de una columna vacía al principio no se pierde', (r.data || r.rows)?.[0]?.nota === 'Cierre anticipado', JSON.stringify(r).slice(0, 300));
    r = await post('/api/fuentes/probar', { definicion: { nombre: 'x', excel: { rango: 'A4:E10' } }, ubicacion: CLIENTE });
    comprobar('la vista previa lee sin guardar', r.columnas?.map(c => c.nombre).join() === 'Tienda,Fecha,Importe,Unidades,Notas' && r.filas?.length === 6, JSON.stringify(r).slice(0, 300));

    console.log('\nsin ubicar');
    await post('/api/fuentes', { workspaceId: w.id, definicion: { nombre: 'inventario' } });
    r = await consulta(`SELECT * FROM fuentes."inventario"`);
    comprobar('una fuente sin ubicación falla diciendo qué hacer', r.status >= 400 && /no location on this machine/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 300));
    lista = await get('/api/fuentes');
    comprobar('y la lista la marca', lista.fuentes.find(f => f.nombre === 'inventario')?.estado === 'sin_ubicar');
    await put('/api/fuentes/inventario/ubicacion', { ubicacion: path.join(TMP, 'no-existe.csv'), workspaceId: w.id });
    lista = await get('/api/fuentes');
    comprobar('una ubicación que no existe se marca como no encontrada', lista.fuentes.find(f => f.nombre === 'inventario')?.estado === 'no_encontrada');

    console.log('\nData Flow');
    const cadena = JSON.parse(fs.readFileSync(path.join(A, 'flujos', 'semanal.sqlchain'), 'utf8'));
    const run = await post('/api/chains/run', { chainDefinition: cadena, chainFile: 'flujos/semanal.sqlchain' });
    comprobar('un nodo Source corre en un contexto aislado', run.status === 'completed' && run.base === 'trabajo', JSON.stringify(run).slice(0, 300));
    r = await consulta(`SELECT sum(importe)::INTEGER AS total FROM read_parquet('${path.join(A, 'salida', 'ventas.parquet').split(path.sep).join('/')}')`);
    comprobar('y lo que escribe sale de la fuente', (r.data || r.rows)?.[0]?.total === 50, JSON.stringify(r).slice(0, 200));

    console.log('\nla línea de comandos');
    let res = await atenderOrden({ id: 'cli-ok', proceso: path.join(A, 'flujos', 'semanal.sqlchain'), proyecto: A, parametros: {} });
    comprobar('con la fuente ubicada, sale con 0', res.codigo === 0, JSON.stringify(res).slice(0, 300));
    escribir(path.join(A, 'flujos', 'inventario.sqlchain'), JSON.stringify({
        version: '1.0', name: 'inventario', config: { base: 'memoria' },
        nodes: [
            { id: 'a', type: 'sql_inline', label: 'Leer', config: { query: 'SELECT * FROM fuentes."reporte-cliente" JOIN fuentes."inventario" USING (Tienda)' } },
        ],
        edges: [], variables: {},
    }));
    await put('/api/fuentes/inventario/ubicacion', { ubicacion: null, workspaceId: w.id });
    res = await atenderOrden({ id: 'cli-falta', proceso: path.join(A, 'flujos', 'inventario.sqlchain'), proyecto: A, parametros: {} });
    comprobar('con una sin ubicar, sale con 3 antes de empezar', res.codigo === 3 && /inventario/.test(res.mensaje || ''), JSON.stringify(res).slice(0, 300));

    console.log('\nrenombrar conserva la ubicación');
    await post('/api/fuentes', { workspaceId: w.id, definicion: { nombre: 'ventas-tiendas', descripcion: 'Ventas por tienda' }, anterior: 'ventas-semanales' });
    r = await consulta(`SELECT sum(importe)::INTEGER AS total FROM fuentes."ventas-tiendas"`);
    comprobar('con el nombre nuevo lee lo mismo', (r.data || r.rows)?.[0]?.total === 50, JSON.stringify(r).slice(0, 200));
    r = await consulta(`SELECT * FROM fuentes."ventas-semanales"`);
    comprobar('y el viejo ya no existe', r.status >= 400);
    await post('/api/fuentes', { workspaceId: w.id, definicion: { nombre: 'ventas-semanales', descripcion: 'Ventas por tienda, llegan cada lunes' }, anterior: 'ventas-tiendas' });

    console.log('\nun esquema que se llama como el catálogo');
    await post('/api/query', { query: 'CREATE SCHEMA fuentes' });
    await post('/api/fuentes', { definicion: { nombre: 'metas' }, ubicacionAqui: path.join(A, 'datos', 'metas.csv') });
    lista = await get('/api/fuentes');
    comprobar('la lista lo avisa', lista.esquemaHomonimo === true);
    r = await consulta(`SELECT count(*)::INTEGER AS n FROM fuentes.main."metas"`);
    comprobar('fuentes.main."x" sigue funcionando', (r.data || r.rows)?.[0]?.n === 2, JSON.stringify(r).slice(0, 200));
    await post('/api/query', { query: 'DROP SCHEMA fuentes' });

    console.log('\nviajan: exportar e importar en otra máquina');
    const paquete = await get(`/api/workspaces/${w.id}/exportar`);
    const texto = JSON.stringify(paquete);
    comprobar('el .amoxworkspace lleva las definiciones', !!paquete.contexto?.['fuentes/ventas-semanales.json'] && !!paquete.contexto?.['fuentes/inventario.json'], Object.keys(paquete.contexto || {}).join(', '));
    comprobar('y ninguna ruta de esta máquina', !texto.includes('carpeta-sincronizada'));
    const archivo = path.join(TMP, 'tiendas.amoxworkspace');
    fs.writeFileSync(archivo, texto);
    // La otra máquina tiene la carpeta del proyecto (sincronizada) y el archivo en otro sitio.
    const COPIA = path.join(TMP, 'otra-maquina', 'ventas-q4');
    fs.cpSync(A, COPIA, { recursive: true, filter: (f) => !/\.duckdb(\.wal)?$/.test(f) && !f.includes(`${path.sep}trabajo${path.sep}`) });
    const OTRA = path.join(TMP, 'otra-maquina', 'Nube', 'entrada', 'ventas.csv');
    fs.mkdirSync(path.dirname(OTRA), { recursive: true });
    fs.copyFileSync(VENTAS, OTRA);
    await baseCentral.cerrar();
    const hijo = spawnSync(process.execPath, [ESTE, '--segunda', TMP, archivo, COPIA, OTRA], { encoding: 'utf8', timeout: 120000 });
    await baseCentral.abrir();
    const linea = (hijo.stdout || '').split('\n').find(l => l.startsWith('RESULTADO '));
    const s = linea ? JSON.parse(linea.slice('RESULTADO '.length)) : null;
    comprobar('[segunda] corrió', !!s, (hijo.stderr || '').slice(-600));
    if (s) {
        const vs = s.antes.find(f => f.nombre === 'ventas-semanales');
        comprobar('ve la fuente del workspace, sin ubicar', vs?.origen === 'workspace' && vs.estado === 'sin_ubicar', JSON.stringify(s.antes));
        comprobar('consultarla dice que falta ubicarla', s.sinUbicar.status >= 400 && /no location on this machine/.test(JSON.stringify(s.sinUbicar)), JSON.stringify(s.sinUbicar).slice(0, 200));
        comprobar('el aviso al abrir lo dice', (s.requisitos.faltan?.fuentes || []).some(f => f.nombre === 'ventas-semanales' && f.motivo === 'sin_ubicar'), JSON.stringify(s.requisitos.faltan));
        comprobar('ubicada en OTRO sitio, lee lo mismo', (s.despues.data || s.despues.rows)?.[0]?.total === 50, JSON.stringify(s.despues).slice(0, 200));
        comprobar('la del proyecto, relativa, funciona sin hacer nada', (s.metas.data || s.metas.rows)?.[0]?.n === 2, JSON.stringify(s.metas).slice(0, 200));
    }

    console.log('\nborrar');
    r = await del(`/api/fuentes/inventario?workspaceId=${w.id}`);
    comprobar('quita la definición', r.status === 200 && !fs.existsSync(path.join(HOME, 'workspaces', w.id, 'fuentes', 'inventario.json')));
    r = await consulta(`SELECT * FROM fuentes."inventario"`);
    comprobar('y su vista', r.status >= 400 && /does not exist/i.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 200));
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
