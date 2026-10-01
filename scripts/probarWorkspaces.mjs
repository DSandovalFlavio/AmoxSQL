/**
 * Workspaces (B1) y la palabra (B8), fase 6 del plan de la 5.9.
 *
 *     node scripts/probarWorkspaces.mjs
 *
 * Por el servidor HTTP de verdad, con un AMOXSQL_HOME temporal. La «segunda
 * máquina» es este mismo script lanzado como proceso hijo con OTRO home
 * temporal, que abre la carpeta que la primera dejó enlazada.
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
const TMP = SEGUNDA ? process.argv[4] : fs.mkdtempSync(path.join(os.tmpdir(), 'amox-ws-'));
const HOME = path.join(TMP, SEGUNDA ? 'home-2' : 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;                 // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const workspaces = require(path.join(RAIZ, 'server/workspaces.js'));

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const { port } = await startServer(0);
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (metodo) => (p, b) => fetch(u(p), {
    method: metodo, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined,
}).then(async r => ({ status: r.status, ...(await r.json()) }));
const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await dormir(100);
const leerPj = (raiz) => JSON.parse(fs.readFileSync(path.join(raiz, '.amoxsql', 'project.json'), 'utf8'));

// ── La segunda máquina: abre la carpeta y dice lo que ve ───────────────────
if (SEGUNDA) {
    const carpeta = process.argv[3];
    const salida = {};
    await post('/api/project/open', { path: carpeta });
    salida.alAbrir = await get('/api/project/workspace');
    const w = salida.alAbrir.enArchivo;
    salida.creado = await post('/api/workspaces', { id: w.id, nombre: w.nombre });
    salida.despues = await get('/api/project/workspace');
    await baseCentral.cerrar();
    process.stdout.write('\nRESULTADO ' + JSON.stringify(salida) + '\n');
    process.exit(0);
}

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

const A = path.join(TMP, 'ventas-q4');
const OTRO = path.join(TMP, 'otro');
for (const d of [path.join(A, '.amoxsql'), OTRO]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(A, '.amoxsql', 'project.json'),
    JSON.stringify({ name: 'ventas-q4', defaultDb: 'main.duckdb', requiere: { extensiones: ['spatial'] }, clavePropia: 'no-se-toca' }, null, 2));

try {
    console.log('\nla palabra (B8)');
    let e = await get('/api/preferencias/etiqueta');
    comprobar('sin elegir: por defecto «workspaces», y lo dice', e.clave === 'workspaces' && e.elegida === false && e.opciones.length === 5, JSON.stringify(e));
    comprobar('una instalación nueva no es una actualización', e.actualizacion === false);
    comprobar('una palabra que no está en la lista se rechaza', (await put('/api/preferencias/etiqueta', { clave: 'tribus' })).status === 400);
    e = await put('/api/preferencias/etiqueta', { clave: 'clients' });
    comprobar('elegir «clients» se queda', e.clave === 'clients' && (await get('/api/preferencias/etiqueta')).elegida === true);

    console.log('\nsin ningún workspace no se pregunta');
    await post('/api/project/open', { path: OTRO });
    let est = await get('/api/project/workspace');
    comprobar('una carpeta sin enlace, y nadie a quien enlazarla', est.estado === 'sin_enlazar' && est.preguntar === false, JSON.stringify(est));

    console.log('\ncrear (B1)');
    comprobar('sin nombre no se crea', (await post('/api/workspaces', { nombre: '  ' })).status === 400);
    const w = await post('/api/workspaces', { nombre: 'Tiendas del Norte', etiqueta: 'Retail', color: '#34d399' });
    comprobar('se crea, con su color y su etiqueta', w.id && w.nombre === 'Tiendas del Norte' && w.color === '#34d399' && w.etiqueta === 'Retail', JSON.stringify(w));
    comprobar('y su carpeta en el home, con el esqueleto de contexto',
        fs.existsSync(path.join(HOME, 'workspaces', w.id, 'contexto')) && fs.existsSync(path.join(HOME, 'workspaces', w.id, 'skills')));
    comprobar('un color que no es un color no se guarda', (await post('/api/workspaces', { nombre: 'X', color: 'red;' })).color === null);

    console.log('\nabrir una carpeta y enlazarla');
    await post('/api/project/open', { path: A });
    est = await get('/api/project/workspace');
    comprobar('sin enlace, y ahora sí se pregunta', est.estado === 'sin_enlazar' && est.preguntar === true, JSON.stringify(est));
    est = await put('/api/project/workspace', { workspaceId: w.id });
    comprobar('enlazar la deja enlazada', est.estado === 'enlazado' && est.workspace?.id === w.id, JSON.stringify(est));
    let pj = leerPj(A);
    comprobar('project.json guarda id y nombre del workspace, y nada más de él', JSON.stringify(pj.workspace) === JSON.stringify({ id: w.id, nombre: 'Tiendas del Norte' }), JSON.stringify(pj.workspace));
    comprobar('y el id del proyecto, para reconocerlo si se mueve', pj.id === est.proyecto.id, `${pj.id} / ${est.proyecto.id}`);
    comprobar('las demás claves de project.json, intactas', pj.clavePropia === 'no-se-toca' && pj.defaultDb === 'main.duckdb' && pj.requiere?.extensiones?.[0] === 'spatial');
    const lista = (await get('/api/workspaces')).workspaces;
    comprobar('la lista cuenta sus proyectos', lista.find(x => x.id === w.id)?.proyectos === 1, JSON.stringify(lista));
    const suyos = (await get(`/api/workspaces/${w.id}/proyectos`)).proyectos;
    comprobar('y sabe cuáles son', suyos.length === 1 && suyos[0].nombre === 'ventas-q4' && suyos[0].existe === true, JSON.stringify(suyos));

    console.log('\nla IA usa la palabra del usuario');
    const g = await workspaces.grupoDelProyecto(A);
    comprobar('«client», con el nombre del workspace', g?.palabra === 'client' && g.plural === 'clients' && g.nombre === 'Tiendas del Norte', JSON.stringify(g));
    const { buildSystemPrompt } = require(path.join(RAIZ, 'server/ai/prompt/index.js'));
    comprobar('y el prompt lo dice', /belongs to the client "Tiendas del Norte"/.test(buildSystemPrompt({ grupo: g })));

    console.log('\ncambiarle el nombre');
    await put(`/api/workspaces/${w.id}`, { nombre: 'Tiendas del Norte SA' });
    est = await get('/api/project/workspace');
    comprobar('al volver a mirar la carpeta, su project.json se pone al día', leerPj(A).workspace.nombre === 'Tiendas del Norte SA' && est.workspace.nombre === 'Tiendas del Norte SA');

    console.log('\nmover la carpeta');
    await post('/api/project/open', { path: OTRO });          // soltarla, como al cambiar de proyecto
    await dormir(300);
    const MOVIDA = path.join(TMP, 'clientes', 'ventas-q4');
    fs.mkdirSync(path.dirname(MOVIDA), { recursive: true });
    fs.renameSync(A, MOVIDA);
    await post('/api/project/open', { path: MOVIDA });
    est = await get('/api/project/workspace');
    comprobar('sigue enlazada', est.estado === 'enlazado' && est.workspace.id === w.id, JSON.stringify(est));
    const filas = await baseCentral.query(`SELECT id, ruta FROM proyectos WHERE id = $1`, [pj.id]);
    comprobar('es el mismo proyecto, con la ruta nueva', filas.length === 1 && path.resolve(filas[0].ruta) === path.resolve(MOVIDA), JSON.stringify(filas));
    const [{ n }] = await baseCentral.query(`SELECT count(*)::INTEGER AS n FROM proyectos WHERE nombre = 'ventas-q4'`);
    comprobar('sin duplicarlo', n === 1, `${n} filas`);

    console.log('\nen una segunda máquina');
    const hijo = spawnSync(process.execPath, [ESTE, '--segunda', MOVIDA, TMP], { encoding: 'utf8', timeout: 60000 });
    const linea = (hijo.stdout || '').split('\n').find(l => l.startsWith('RESULTADO '));
    const otra = linea ? JSON.parse(linea.slice('RESULTADO '.length)) : null;
    comprobar('no conoce el workspace, pero sabe cuál es', otra?.alAbrir?.estado === 'desconocido' && otra.alAbrir.preguntar === true
        && otra.alAbrir.enArchivo?.id === w.id && otra.alAbrir.enArchivo?.nombre === 'Tiendas del Norte SA', JSON.stringify(otra?.alAbrir) || hijo.stderr?.slice(-400));
    comprobar('lo crea con el mismo id', otra?.creado?.id === w.id);
    comprobar('y la carpeta queda enlazada allí también', otra?.despues?.estado === 'enlazado');

    console.log('\ndesenlazar');
    est = await put('/api/project/workspace', { workspaceId: null, noPreguntar: true });
    comprobar('queda sin enlace y no vuelve a preguntar', est.estado === 'sin_enlazar' && est.preguntar === false, JSON.stringify(est));
    pj = leerPj(MOVIDA);
    comprobar('project.json ya no lo nombra, y conserva lo suyo', !pj.workspace && pj.clavePropia === 'no-se-toca' && pj.id);
    comprobar('la lista ya no lo cuenta', (await get('/api/workspaces')).workspaces.find(x => x.id === w.id)?.proyectos === 0);

    console.log('\narchivar');
    await post(`/api/workspaces/${w.id}/archivar`, {});
    comprobar('sale de la lista', !(await get('/api/workspaces')).workspaces.some(x => x.id === w.id));
    comprobar('y está en la de archivados', (await get('/api/workspaces?archivados=1')).workspaces.some(x => x.id === w.id));
    await post(`/api/workspaces/${w.id}/archivar`, { archivado: false });
    comprobar('y se puede recuperar', (await get('/api/workspaces')).workspaces.some(x => x.id === w.id));
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    await baseCentral.cerrar().catch(() => {});
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows suelta los archivos tarde */ }
console.log(`\n${pasadas} pasadas, ${fallos} fallos\n`);
process.exit(fallos ? 1 : 0);
