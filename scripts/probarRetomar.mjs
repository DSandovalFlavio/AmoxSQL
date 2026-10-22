/**
 * Donde lo dejaste (5.14, fase 1; F5, Dec-46).
 *
 *     node scripts/probarRetomar.mjs
 *
 * Por el servidor, con un home temporal:
 *   - un proyecto recién abierto por primera vez no tiene nada que contar;
 *   - al volver a abrirlo: su estado y su entrega, lo que falló sin nadie delante
 *     (sólo de ESTE proyecto), la última ejecución de cada proceso, lo que corrió
 *     desde la última vez, lo que cambió en git (commits nuevos, archivos sin
 *     guardar) y las fuentes que aquí no se leen.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-retomar-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const A = path.join(TMP, 'cierre');
const B = path.join(TMP, 'otro');
fs.mkdirSync(A, { recursive: true });
fs.mkdirSync(B, { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 400) : ''}`); }
};
const git = (...args) => execFileSync('git', ['-C', A, ...args], { stdio: 'pipe' }).toString();

try {
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { ejecutarProceso } = require(path.join(RAIZ, 'server/ejecucion/ejecutarProceso.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
    const abrir = async (p) => { await post('/api/project/open', { path: p }); await post('/api/db/connect', { path: ':memory:' }); };

    console.log('\nla primera vez');
    await abrir(A);
    let r = await get('/api/proyecto/retomar');
    comprobar('un proyecto nuevo no tiene nada que contar', r.hayAlgo === false && r.proyecto?.ultimaVez === null, JSON.stringify(r));

    // Lo que pasa mientras tanto: un proceso que va bien, uno programado que falla,
    // un fallo en OTRO proyecto, una fuente sin archivo, git con cambios.
    const bien = { name: 'Bien', config: { base: 'memoria' }, edges: [], nodes: [{ id: 'q', type: 'sql_inline', label: 'Algo', config: { query: 'SELECT 1' } }] };
    const mal = { name: 'Cierre', config: { base: 'memoria' }, edges: [], nodes: [{ id: 'q', type: 'sql_inline', label: 'Roto', config: { query: 'SELECT * FROM no_existe' } }] };
    fs.writeFileSync(path.join(A, 'bien.sqlchain'), JSON.stringify(bien));
    fs.writeFileSync(path.join(A, 'cierre.sqlchain'), JSON.stringify(mal));
    await ejecutarProceso({ dbManager, chainDef: bien, proyecto: A, chainFile: 'bien.sqlchain', origen: 'interfaz' });
    const fallo = await ejecutarProceso({ dbManager, chainDef: mal, proyecto: A, chainFile: 'cierre.sqlchain', origen: 'programada' });
    await ejecutarProceso({ dbManager, chainDef: mal, proyecto: B, chainFile: 'cierre.sqlchain', origen: 'programada' });
    fs.mkdirSync(path.join(A, '.amoxsql', 'fuentes'), { recursive: true });
    fs.writeFileSync(path.join(A, '.amoxsql', 'fuentes', 'ventas.json'), JSON.stringify({ nombre: 'ventas', tipo: 'archivo', ubicacion: 'datos/ventas.xlsx' }));
    let hayGit = true;
    try {
        git('init', '-q'); git('config', 'user.email', 'ana@example.com'); git('config', 'user.name', 'Ana');
        fs.writeFileSync(path.join(A, 'a.sql'), 'SELECT 1;');
        git('add', 'a.sql'); git('commit', '-q', '-m', 'primera');
        fs.writeFileSync(path.join(A, 'a.sql'), 'SELECT 2;');
    } catch { hayGit = false; }
    const [fila] = (await baseCentral.query('SELECT id, ruta FROM proyectos')).filter(p => path.resolve(p.ruta).toLowerCase() === path.resolve(A).toLowerCase());
    await put(`/api/proyectos/${fila.id}`, { estado: 'en_curso', entrega: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) });
    // «La última vez» fue ayer.
    await baseCentral.query(`UPDATE proyectos SET ultimo_abierto = CAST($2 AS TIMESTAMP) WHERE id = $1`, [fila.id, new Date(Date.now() - 86400000).toISOString().replace('T', ' ').replace('Z', '')]);

    console.log('\nal volver');
    await abrir(B);
    await abrir(A);
    r = await get('/api/proyecto/retomar');
    comprobar('hay algo que contar', r.hayAlgo === true);
    comprobar('cuándo se abrió por última vez (ayer)', r.proyecto?.ultimaVez && Math.abs(Date.now() - 86400000 - new Date(r.proyecto.ultimaVez).getTime()) < 120000, r.proyecto?.ultimaVez);
    comprobar('su estado y su entrega', r.proyecto?.estado === 'en_curso' && /^\d{4}-\d{2}-\d{2}$/.test(r.proyecto?.entrega || ''), JSON.stringify(r.proyecto));
    comprobar('lo que falló sin nadie delante, sólo de este proyecto', r.atencion?.length === 1 && r.atencion[0].id === fallo.runId, JSON.stringify(r.atencion?.map(x => x.proyectoNombre)));
    comprobar('la última ejecución de cada proceso', r.procesos?.length === 2 && r.procesos.some(p => p.nombre === 'Cierre' && p.estado === 'fallo') && r.procesos.some(p => p.nombre === 'Bien' && p.estado === 'ok'), JSON.stringify(r.procesos));
    comprobar('lo que corrió desde la última vez', r.desdeLaUltimaVez?.ejecuciones === 2 && r.desdeLaUltimaVez.fallidas === 1, JSON.stringify(r.desdeLaUltimaVez));
    if (hayGit) {
        comprobar('git: un commit nuevo (de Ana) y archivos sin guardar', r.git?.commitsDesde === 1 && r.git.autores?.includes('Ana') && r.git.sinGuardar >= 1, JSON.stringify(r.git));
    } else {
        console.log('  --    git no está en esta máquina: sin comprobar');
    }
    comprobar('las fuentes que aquí no se leen', r.fuentes?.some(f => f.nombre === 'ventas' && /not found/.test(f.problema)), JSON.stringify(r.fuentes));
    await post('/api/operacion/atencion/vista', { ids: [fallo.runId] });
    r = await get('/api/proyecto/retomar');
    comprobar('lo ya visto no vuelve a salir', r.atencion?.length === 0);

    console.log('\nel otro proyecto');
    await abrir(B);
    r = await get('/api/proyecto/retomar');
    comprobar('cada proyecto, lo suyo', r.atencion?.length === 1 && r.atencion[0].proyectoNombre === 'otro' && r.procesos?.length === 1, JSON.stringify(r.atencion?.map(x => x.proyectoNombre)));

    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
