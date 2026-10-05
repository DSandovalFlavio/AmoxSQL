/**
 * El panel de operación (D7) y disparar al llegar un archivo (D8), fase 7 del
 * plan de la 5.11.
 *
 *     node scripts/probarOperacion.mjs
 *
 *   - /api/operacion: lo de hoy (lo que corrió y lo que falta), lo de mañana,
 *     las programaciones de todos los workspaces y la bitácora; la pausa
 *     general marca lo que no va a correr.
 *   - «Al llegar»: varias llegadas seguidas son UNA ejecución; otra fuente no
 *     la dispara; pausada no corre; el tick no la toca.
 *   - De punta a punta: un archivo que llega de verdad a la carpeta de una
 *     fuente dispara su proceso.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-operacion-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const espera = (ms) => new Promise(r => setTimeout(r, ms));

try {
    const { startServer, arrancarProgramador } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const programaciones = require(path.join(RAIZ, 'server/programacion/programaciones.js'));
    const programador = require(path.join(RAIZ, 'server/programacion/programador.js'));
    const { port } = await startServer(0);
    for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await espera(100);
    arrancarProgramador({ reloj: false, avisar: () => {}, proximaCambio: () => {} });
    programador.configurar({ esperaLlegadaMs: 400 });
    const pedir = (m) => (p, b) => fetch(`http://localhost:${port}${p}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
        .then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');

    // Dos proyectos en dos workspaces.
    const proceso = (nombre) => JSON.stringify({
        version: '1.0', name: nombre, config: { base: 'memoria' }, variables: {},
        nodes: [{ id: 'q', type: 'sql_inline', label: 'Consulta', config: { query: 'SELECT 1 AS n' } }], edges: [],
    });
    const A = path.join(TMP, 'norte'), B = path.join(TMP, 'sur');
    for (const [p, n] of [[A, 'Cierre Norte'], [B, 'Cierre Sur']]) { fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'cierre.sqlchain'), proceso(n)); }
    const wA = await post('/api/workspaces', { nombre: 'Tiendas del Norte' });
    const wB = await post('/api/workspaces', { nombre: 'Tiendas del Sur' });
    for (const [p, w] of [[A, wA], [B, wB]]) { await post('/api/project/open', { path: p }); await put('/api/project/workspace', { workspaceId: w.id }); }

    console.log('\nel panel de operación');
    const ahora = new Date();
    const enUnRato = new Date(ahora.getTime() + 2 * 3600 * 1000);
    const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const hoyPasada = new Date(ahora.getTime() - 3600 * 1000);
    // Una que ya corrió hoy (la corremos a mano como su ocurrencia) y otra que falta.
    const pa = await programaciones.crear({ proceso: 'cierre.sqlchain', proyecto: A, regla: { tipo: 'diaria', hora: hhmm(hoyPasada) } }, { ahora: new Date(ahora.getTime() - 2 * 3600 * 1000) });
    const pb = await programaciones.crear({ proceso: 'cierre.sqlchain', proyecto: B, regla: { tipo: 'diaria', hora: hhmm(enUnRato) } });
    await programador.tick(ahora);
    const d = await get('/api/operacion');
    const mismoDia = enUnRato.getDate() === ahora.getDate() && hoyPasada.getDate() === ahora.getDate();
    comprobar('hoy: lo que ya corrió, con su workspace', d.hoy?.corridas?.some(x => x.programacionId === pa.id && x.estado === 'ok' && x.workspaceNombre === 'Tiendas del Norte') || !mismoDia, JSON.stringify(d.hoy?.corridas).slice(0, 300));
    comprobar('hoy: lo que falta', d.hoy?.pendientes?.some(x => x.programacionId === pb.id) || !mismoDia, JSON.stringify(d.hoy?.pendientes).slice(0, 300));
    comprobar('mañana: las dos', d.manana?.pendientes?.filter(x => [pa.id, pb.id].includes(x.programacionId)).length === 2, JSON.stringify(d.manana?.pendientes).slice(0, 300));
    comprobar('las programaciones de todos los workspaces, con su grupo y su proyecto', d.programaciones?.length === 2 && d.programaciones.some(p => p.workspaceNombre === 'Tiendas del Sur' && p.proyectoNombre === 'sur'), JSON.stringify(d.programaciones?.map(p => [p.nombre, p.workspaceNombre])));
    comprobar('la bitácora, con el nombre y una línea de resumen', d.bitacora?.[0]?.nombre === 'Cierre Norte' && /Cierre Norte/.test(d.bitacora[0].linea || ''), JSON.stringify(d.bitacora?.[0]));
    await put('/api/programaciones/pausa', { hasta: new Date(ahora.getTime() + 3 * 86400000).toISOString() });
    const dp = await get('/api/operacion');
    comprobar('pausar todo: el panel lo dice y marca lo que no va a correr', !!dp.pausaGeneral && dp.manana.pendientes.every(x => x.pausadaGeneral), JSON.stringify(dp.manana.pendientes).slice(0, 200));
    await put('/api/programaciones/pausa', { hasta: null });

    console.log('\nal llegar un archivo (D8)');
    const pl = await programaciones.crear({ proceso: 'cierre.sqlchain', proyecto: A, regla: { tipo: 'al_llegar', fuente: 'ventas-semanales' } });
    comprobar('la regla se dice en una frase y no tiene hora', pl.descripcion === 'When a new file arrives in the source "ventas-semanales"' && !pl.proxima, JSON.stringify(pl));
    const r = await programador.tick(new Date(ahora.getTime() + 86400000 * 2));
    comprobar('el tick no la toca', !r.corridas.some(x => x.programacionId === pl.id) && !r.saltadas.some(x => x.programacionId === pl.id));
    const cuantas = async () => (await baseCentral.query(`SELECT count(*)::INTEGER AS n FROM ejecuciones WHERE programacion_id = $1`, [pl.id]))[0].n;
    await programador.alLlegar(['ventas-semanales'], A);
    await espera(150);
    await programador.alLlegar(['ventas-semanales'], A);
    await espera(150);
    await programador.alLlegar(['ventas-semanales'], A);
    await espera(1200);
    comprobar('tres llegadas seguidas: una sola ejecución', await cuantas() === 1, `${await cuantas()}`);
    const [ej] = await baseCentral.query(`SELECT origen FROM ejecuciones WHERE programacion_id = $1`, [pl.id]);
    comprobar('con su origen', ej?.origen === 'al_llegar', JSON.stringify(ej));
    await programador.alLlegar(['otra-fuente'], A);
    await programador.alLlegar(['ventas-semanales'], B);
    await espera(800);
    comprobar('otra fuente u otro proyecto no la disparan', await cuantas() === 1);
    await programaciones.pausar(pl.id);
    await programador.alLlegar(['ventas-semanales'], A);
    await espera(800);
    comprobar('pausada, no corre', await cuantas() === 1);
    await programaciones.pausar(pl.id, { reanudar: true });

    console.log('\nde punta a punta: un archivo que llega a la carpeta');
    const ENTRADA = path.join(TMP, 'entrada');
    fs.mkdirSync(ENTRADA, { recursive: true });
    await post('/api/project/open', { path: A });
    await post('/api/db/connect', { path: 'norte.duckdb' });
    await post('/api/fuentes', { definicion: { nombre: 'ventas-semanales', tipo: 'carpeta', patron: 'ventas*.csv' }, ubicacionAqui: ENTRADA });
    await get('/api/fuentes');
    await espera(1500);
    fs.writeFileSync(path.join(ENTRADA, 'ventas_semana_40.csv'), 'tienda,importe\nnorte,10\n');
    let n = 1;
    for (let i = 0; i < 40 && n === 1; i++) { await espera(500); n = await cuantas(); }
    comprobar('el archivo, quieto, dispara el proceso', n === 2, `${n} ejecuciones`);
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
