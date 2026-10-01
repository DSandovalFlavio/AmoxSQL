/**
 * La vista de workspaces y el workspace que viaja (B3 + B6), fase 8 del plan.
 *
 *     node scripts/probarExportarWorkspace.mjs
 *
 *   - Estado y entrega de un proyecto: en su project.json y en la base.
 *   - El resumen de la vista: tarjetas con estados y próxima entrega, proyectos
 *     sueltos, archivados y lo último que corrió, con su workspace.
 *   - Exportar: un .amoxworkspace con metadatos, marca, contexto y los NOMBRES
 *     de las credenciales; ningún valor (se buscan literalmente).
 *   - Importar en una «segunda máquina» (proceso hijo con otro home): el mismo
 *     id, sus archivos, y una carpeta enlazada lo reconoce.
 *   - Importar sobre uno que ya existe: archivo por archivo.
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
const TMP = SEGUNDA ? process.argv[3] : fs.mkdtempSync(path.join(os.tmpdir(), 'amox-exportar-'));
const HOME = path.join(TMP, SEGUNDA ? 'home-2' : 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

// Claves inconfundibles en el config.json de la primera máquina (la 5.8 las
// tenía en claro; el llavero de prueba las migra).
const SECRETOS = { id: 'AKIA-EXPORTAR-PRUEBA-77', clave: 's3-SECRETO-EXPORTAR-91a' };
if (!SEGUNDA) {
    fs.writeFileSync(path.join(HOME, 'config.json'), JSON.stringify({
        provider: 'ollama', s3Config: { accessKeyId: SECRETOS.id, secretKey: SECRETOS.clave, region: 'us-east-1' },
    }));
}

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const { port } = await startServer(0);
for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json()) }));
const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');

// ── La segunda máquina: importa el archivo y abre la carpeta ───────────────
if (SEGUNDA) {
    const [, , , , archivo, carpeta] = process.argv;
    const contenido = fs.readFileSync(archivo, 'utf8');
    const salida = {};
    salida.analisis = await post('/api/workspaces-importar/analizar', { contenido });
    salida.importado = await post('/api/workspaces-importar', { contenido, opciones: {} });
    await post('/api/project/open', { path: carpeta });
    salida.enlace = await get('/api/project/workspace');
    salida.reglas = fs.readFileSync(path.join(HOME, 'workspaces', salida.importado.workspace.id, 'RULES.md'), 'utf8');
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
const B = path.join(TMP, 'campana-roi');
const SUELTO = path.join(TMP, 'scratch');
for (const d of [A, B, SUELTO]) fs.mkdirSync(d, { recursive: true });
escribir(path.join(A, '.amoxsql', 'project.json'), JSON.stringify({ name: 'ventas-q4', requiere: { credenciales: [{ nombre: 'nube-s3', tipo: 's3' }], extensiones: ['spatial'] } }));
escribir(path.join(A, 'datos', 'ventas.csv'), 'region,importe\nnorte,10\nsur,20\n');
escribir(path.join(A, 'flujos', 'copia.sqlchain'), JSON.stringify({
    version: '1.0', name: 'copia', config: { base: 'auto' },
    nodes: [
        { id: 'a', type: 'import_file', label: 'Leer', config: { sourcePath: 'datos/ventas.csv', tableName: 'v' } },
        { id: 'b', type: 'export_file', label: 'A Parquet', config: { outputPath: 'salida/v.parquet', format: 'parquet' } },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b' }], variables: {},
}));

try {
    const logo = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>').toString('base64');
    const w = await post('/api/workspaces', {
        nombre: 'Tiendas del Norte', etiqueta: 'Retail', color: '#34d399',
        politicaIa: { proveedores: 'nube', datos: 'esquema' },
        marca: { paleta: ['#34d399', '#0ea5e9'], logo },
    });
    await put(`/api/workspaces/${w.id}/contexto/archivo`, { ruta: 'RULES.md', texto: 'Fiscal year starts in February.' });
    await put(`/api/workspaces/${w.id}/contexto/archivo`, { ruta: 'contexto/metrics.yml', texto: 'metrics:\n  - name: roas\n    sql: "SUM(r) / SUM(s)"\n' });
    await post('/api/workspaces', { nombre: 'Banco Andino' });
    const viejo = await post('/api/workspaces', { nombre: 'Cliente viejo' });
    await post(`/api/workspaces/${viejo.id}/archivar`, {});

    // Abrir las carpetas las registra; dos se enlazan, la otra queda suelta.
    await post('/api/project/open', { path: A });
    await put('/api/project/workspace', { workspaceId: w.id });
    await post('/api/project/open', { path: B });
    await put('/api/project/workspace', { workspaceId: w.id });
    await post('/api/project/open', { path: SUELTO });

    console.log('\nestado y entrega de un proyecto (8.2)');
    const lista = (await get('/api/proyectos')).proyectos;
    const pA = lista.find(p => p.nombre === 'ventas-q4');
    const pB = lista.find(p => p.nombre === 'campana-roi');
    let r = await put(`/api/proyectos/${pA.id}`, { estado: 'en_revision', entrega: '2099-03-01' });
    comprobar('se guarda', r.estado === 'en_revision' && r.entrega === '2099-03-01', JSON.stringify(r));
    const pj = JSON.parse(fs.readFileSync(path.join(A, '.amoxsql', 'project.json'), 'utf8'));
    comprobar('en el project.json de la carpeta, que viaja con ella', pj.estado === 'en_revision' && pj.entrega === '2099-03-01' && pj.requiere?.extensiones?.[0] === 'spatial');
    await put(`/api/proyectos/${pB.id}`, { estado: 'en_curso', entrega: '2098-12-24' });
    comprobar('un estado que no existe se rechaza', (await put(`/api/proyectos/${pA.id}`, { estado: 'volando' })).status === 400);
    comprobar('una fecha mal escrita, también', (await put(`/api/proyectos/${pA.id}`, { entrega: '1 de marzo' })).status === 400);

    console.log('\nel resumen de la vista (8.1)');
    await post('/api/project/open', { path: A });
    const run = await post('/api/chains/run', { chainDefinition: JSON.parse(fs.readFileSync(path.join(A, 'flujos', 'copia.sqlchain'), 'utf8')), chainFile: 'flujos/copia.sqlchain' });
    comprobar('[preparar] corre un proceso del proyecto enlazado', run.status === 'completed', JSON.stringify(run));
    const inicio = await get('/api/inicio');
    const t = inicio.workspaces.find(x => x.id === w.id);
    comprobar('una tarjeta por workspace activo', inicio.workspaces.length === 2 && !!t, inicio.workspaces.map(x => x.nombre).join());
    comprobar('con sus proyectos por estado', t.proyectos === 2 && t.porEstado.en_revision === 1 && t.porEstado.en_curso === 1, JSON.stringify(t.porEstado));
    comprobar('y su próxima entrega', t.proximaEntrega?.proyecto === 'campana-roi' && t.proximaEntrega.fecha === '2098-12-24', JSON.stringify(t.proximaEntrega));
    comprobar('y su política', t.politicaIa?.datos === 'esquema');
    comprobar('los proyectos sueltos, aparte', inicio.sinWorkspace.map(p => p.nombre).join() === 'scratch', inicio.sinWorkspace.map(p => p.nombre).join());
    comprobar('los archivados se cuentan', inicio.archivados.length === 1);
    comprobar('lo que corrió, con su workspace', inicio.ejecuciones[0]?.nombreProceso === 'copia' && inicio.ejecuciones[0].workspace === 'Tiendas del Norte' && inicio.ejecuciones[0].estado === 'ok', JSON.stringify(inicio.ejecuciones[0]));
    comprobar('buscar por nombre y por ruta', (await get('/api/proyectos?q=roi')).proyectos.map(p => p.nombre).join() === 'campana-roi'
        && (await get(`/api/proyectos?q=${encodeURIComponent(path.basename(TMP))}`)).proyectos.length === 3);
    const enlace = await put('/api/proyectos-enlace', { ruta: SUELTO, workspaceId: w.id });
    comprobar('enlazar una carpeta suelta sin abrirla', enlace.estado === 'enlazado' && (await get('/api/inicio')).sinWorkspace.length === 0, JSON.stringify(enlace).slice(0, 200));
    await put('/api/proyectos-enlace', { ruta: SUELTO, workspaceId: null });

    console.log('\nexportar (8.3)');
    const paquete = await get(`/api/workspaces/${w.id}/exportar`);
    const texto = JSON.stringify(paquete);
    comprobar('formato y versión', paquete.formato === 'amoxworkspace' && paquete.version === 1);
    comprobar('lleva los datos, la política y la marca con el logo', paquete.workspace.nombre === 'Tiendas del Norte' && paquete.workspace.politicaIa.datos === 'esquema' && paquete.workspace.marca.logo === logo);
    comprobar('lleva el contexto', paquete.contexto['RULES.md'] === 'Fiscal year starts in February.' && /roas/.test(paquete.contexto['contexto/metrics.yml']));
    comprobar('y los nombres de las credenciales que usan sus proyectos', paquete.requiere.credenciales.map(c => c.nombre).join() === 'nube-s3' && paquete.requiere.extensiones.join() === 'spatial');
    comprobar('NUNCA un valor de una credencial', !texto.includes(SECRETOS.id) && !texto.includes(SECRETOS.clave));
    const ARCHIVO = path.join(TMP, 'tiendas.amoxworkspace');
    fs.writeFileSync(ARCHIVO, JSON.stringify(paquete, null, 2));

    console.log('\nimportar en una segunda máquina');
    const hijo = spawnSync(process.execPath, [ESTE, '--segunda', TMP, ARCHIVO, A], { encoding: 'utf8', timeout: 90000 });
    const linea = (hijo.stdout || '').split('\n').find(l => l.startsWith('RESULTADO '));
    const otra = linea ? JSON.parse(linea.slice('RESULTADO '.length)) : null;
    comprobar('lo ve nuevo, con sus archivos y las credenciales que hará falta añadir',
        otra?.analisis?.existe === false && otra.analisis.archivos.length === 2 && otra.analisis.credenciales.join() === 'nube-s3', JSON.stringify(otra?.analisis) || hijo.stderr?.slice(-500));
    comprobar('lo crea con el mismo id', otra?.importado?.workspace?.id === w.id && otra.importado.workspace.politicaIa.datos === 'esquema');
    comprobar('con su contexto', otra?.reglas === 'Fiscal year starts in February.');
    comprobar('y la carpeta enlazada lo reconoce', otra?.enlace?.estado === 'enlazado' && otra.enlace.workspace.id === w.id, JSON.stringify(otra?.enlace));

    console.log('\nimportar sobre uno que ya existe: archivo por archivo');
    await put(`/api/workspaces/${w.id}/contexto/archivo`, { ruta: 'RULES.md', texto: 'Changed here.' });
    const otroPaquete = { ...paquete, contexto: { ...paquete.contexto, 'contexto/glossary.md': '- **Tienda**: a store.' } };
    const an = await post('/api/workspaces-importar/analizar', { contenido: JSON.stringify(otroPaquete) });
    const estado = Object.fromEntries(an.archivos.map(a => [a.ruta, a.estado]));
    comprobar('sabe que existe y qué cambia', an.existe && estado['RULES.md'] === 'distinto' && estado['contexto/metrics.yml'] === 'igual' && estado['contexto/glossary.md'] === 'nuevo', JSON.stringify(estado));
    let imp = await post('/api/workspaces-importar', { contenido: JSON.stringify(otroPaquete), opciones: {} });
    const rules = () => fs.readFileSync(path.join(HOME, 'workspaces', w.id, 'RULES.md'), 'utf8');
    comprobar('sin decir nada, lo distinto se queda como estaba y lo nuevo entra', rules() === 'Changed here.' && imp.escritos.join() === 'contexto/glossary.md', JSON.stringify(imp.escritos));
    imp = await post('/api/workspaces-importar', { contenido: JSON.stringify(otroPaquete), opciones: { sobrescribir: ['RULES.md'] } });
    comprobar('y se sobrescribe sólo lo que se elige', rules() === 'Fiscal year starts in February.' && imp.escritos.join() === 'RULES.md');
    imp = await post('/api/workspaces-importar', { contenido: JSON.stringify(otroPaquete), opciones: { comoNuevo: true } });
    comprobar('o se importa aparte, con otro id', imp.workspace.id !== w.id && imp.workspace.nombre === 'Tiendas del Norte');

    console.log('\nlo que no es un workspace no entra');
    comprobar('un JSON cualquiera se rechaza', (await post('/api/workspaces-importar/analizar', { contenido: '{"hola":1}' })).status === 400);
    const malicioso = { ...paquete, workspace: { ...paquete.workspace, id: 'ws-otro-01' }, contexto: { '../../config.json': 'x', 'RULES.md': 'ok' } };
    imp = await post('/api/workspaces-importar', { contenido: JSON.stringify(malicioso), opciones: {} });
    comprobar('un archivo fuera del contexto se ignora', imp.escritos.join() === 'RULES.md' && !fs.existsSync(path.join(HOME, 'config.json.x')), JSON.stringify(imp.escritos));
    comprobar('uno de una versión posterior pide actualizar', /newer AmoxSQL/.test((await post('/api/workspaces-importar/analizar', { contenido: JSON.stringify({ ...paquete, version: 9 }) })).error || ''));
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    await require(path.join(RAIZ, 'server/ejecucion/ContextoDeEjecucion.js')).soltarTrabajos().catch(() => {});
    await baseCentral.cerrar().catch(() => {});
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows suelta los archivos tarde */ }
console.log(`\n${pasadas} pasadas, ${fallos} fallos\n`);
process.exit(fallos ? 1 : 0);
