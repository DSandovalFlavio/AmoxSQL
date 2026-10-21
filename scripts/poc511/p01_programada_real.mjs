/**
 * Recorrido real de la 5.11 sobre una carpeta sincronizada (fase 8 del plan).
 *
 *     node scripts/poc511/p01_programada_real.mjs --carpeta "G:\My Drive"
 *
 * Con el servidor de AmoxSQL, el reloj REAL de cada minuto y un home TEMPORAL
 * (no toca la base del autor). Tarda unos cuatro minutos.
 *   1. Un proceso programado «cada día a las HH:MM» corre solo a su hora, con
 *      el parámetro «el día que tocaba», y deja el Excel en un destino de la
 *      carpeta sincronizada, en su subcarpeta del mes y con la fecha en el
 *      nombre. Avisa, su ficha dice lo que dejó, y el minuto siguiente no
 *      vuelve a correr.
 *   2. Un archivo que llega a la carpeta sincronizada en varias pasadas, y otro
 *      poco después, disparan UNA ejecución «al llegar», que lee el más nuevo.
 *   3. El panel de operación lo cuenta.
 *   4. Pasado un rato, ¿el sincronizador dejó copias de conflicto?
 * Crea `amox-prueba-<algo>` dentro de la carpeta dada y la borra al terminar.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..', '..');
const i = process.argv.indexOf('--carpeta');
if (i < 0) { console.error('Falta --carpeta <carpeta sincronizada>'); process.exit(2); }
const NUBE = fs.mkdtempSync(path.join(process.argv[i + 1], 'amox-prueba-'));
const ENTRADAS = path.join(NUBE, 'Entradas');
const ENTREGAS = path.join(NUBE, 'Entregas');
fs.mkdirSync(ENTRADAS); fs.mkdirSync(ENTREGAS);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-511real-'));
const PR = path.join(TMP, 'proyecto');
fs.mkdirSync(PR, { recursive: true });
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { startServer, arrancarProgramador } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const { DuckDBInstance } = require(require.resolve('@duckdb/node-api', { paths: [RAIZ] }));
const { port } = await startServer(0);
for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST');
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const dos = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
const diaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

let pasadas = 0, fallos = 0;
const anota = (t, ok, d = '') => { ok ? pasadas++ : fallos++; console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${d}` : ''}`); };
const t0 = Date.now();
const reloj = () => `${Math.round((Date.now() - t0) / 1000)} s`;

// Lo que la aplicación de verdad recibe: los avisos del sistema y la próxima hora.
const avisos = [], proximas = [];
arrancarProgramador({ avisar: (a) => avisos.push(a), proximaCambio: (p, activo) => proximas.push({ p, activo }) });

async function leerExcel(archivo) {
    const inst = await DuckDBInstance.create(':memory:');
    const con = await inst.connect();
    try {
        await con.run('LOAD excel');
        return await (await con.run(`SELECT * FROM read_xlsx('${archivo.replace(/\\/g, '/').replace(/'/g, "''")}')`)).getRowObjectsJson();
    } finally { con.closeSync(); inst.closeSync(); }
}
const ejecucionesDe = (id) => baseCentral.query(`SELECT id, origen, estado, prevista, parametros FROM ejecuciones WHERE programacion_id = $1 ORDER BY inicio`, [id]);
const listarEntregas = () => {
    const out = [];
    const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? rec(f) : out.push(path.relative(ENTREGAS, f)); } };
    rec(ENTREGAS);
    return out.sort();
};

try {
    // ── El proyecto: un destino en la nube, una fuente de carpeta en la nube, un proceso
    fs.writeFileSync(path.join(ENTRADAS, 'ventas_semana_41.csv'), 'tienda,importe\nnorte,120\nsur,80\nnorte,30\n');
    fs.writeFileSync(path.join(PR, 'cierre.sqlchain'), JSON.stringify({
        version: '1.0', name: 'Cierre diario', config: { base: 'memoria' },
        parametros: [{ nombre: 'dia', tipo: 'fecha', etiqueta: 'Day' }],
        variables: { dia: '2026-01-01' },
        nodes: [
            { id: 'leer', type: 'sql_inline', label: 'Ventas por tienda', position: { x: 0, y: 0 },
                config: { query: `SELECT '\${dia}'::DATE AS dia, tienda, sum(importe)::DECIMAL(12,2) AS importe, count(*)::INTEGER AS ventas FROM fuentes."ventas-entrantes" GROUP BY tienda ORDER BY tienda` } },
            { id: 'libro', type: 'excel', label: 'Libro', position: { x: 300, y: 0 },
                config: { modo: 'libro', destino: 'entregas-cliente', outputPath: 'cierre_{fecha}_{hora}.xlsx', hojas: [{ desde: 'leer', nombre: 'Resumen', formatos: { importe: 'moneda' } }] } },
        ],
        edges: [{ id: 'e1', source: 'leer', target: 'libro' }],
    }, null, 2));
    await post('/api/project/open', { path: PR });
    await post('/api/db/connect', { path: 'proyecto.duckdb' });
    let r = await post('/api/destinos', { definicion: { nombre: 'entregas-cliente', descripcion: 'La carpeta del cliente', subcarpeta: '{fecha:AAAA-MM}' }, ubicacionAqui: ENTREGAS });
    anota('destino en la carpeta sincronizada', r.status === 200, r.error);
    r = await post('/api/fuentes', { definicion: { nombre: 'ventas-entrantes', tipo: 'carpeta', patron: 'ventas*.csv' }, ubicacionAqui: ENTRADAS });
    anota('fuente de carpeta en la carpeta sincronizada', r.status === 200, r.error);
    await get('/api/fuentes');

    // ── 1. A su hora, con el reloj de cada minuto
    console.log(`\n1. programada (${reloj()})`);
    const ahora = new Date();
    const hora = new Date(ahora.getTime() + (ahora.getSeconds() > 40 ? 3 : 2) * 60000);
    hora.setSeconds(0, 0);
    r = await post('/api/programaciones', { proceso: 'cierre.sqlchain', nombre: 'Cierre diario', regla: { tipo: 'diaria', hora: hhmm(hora) }, parametros: { dia: 'hoy' }, avisar: 'siempre' });
    const diaria = r.programacion;
    anota(`programada «cada día a las ${hhmm(hora)}»`, r.status === 200 && !!diaria?.id, r.error);
    let ej = [];
    for (let k = 0; k < 60 * 5 && !ej.length; k++) { await espera(1000); ej = await ejecucionesDe(diaria.id); }
    const tarde = Math.round((Date.now() - hora.getTime()) / 1000);
    anota('corrió sola a su hora (en el primer minuto, alineado)', ej.length === 1 && ej[0].estado === 'ok' && tarde <= 10, `${reloj()}, ${tarde} s después de las ${hhmm(hora)} · ${JSON.stringify(ej[0] || null)}`);
    anota('  con origen «programada» y su hora prevista', ej[0]?.origen === 'programada' && new Date(ej[0]?.prevista + (String(ej[0]?.prevista).endsWith('Z') ? '' : 'Z')).getTime() === hora.getTime(), `${ej[0]?.origen} · ${ej[0]?.prevista}`);
    anota('  «el día que tocaba» llegó como parámetro', JSON.parse(ej[0]?.parametros || '{}').dia === diaLocal(hora), ej[0]?.parametros);
    for (let k = 0; k < 20 && !listarEntregas().length; k++) await espera(500);
    const esperado = path.join(`${hora.getFullYear()}-${dos(hora.getMonth() + 1)}`, `cierre_${diaLocal(hora)}_${dos(hora.getHours())}${dos(hora.getMinutes())}.xlsx`);
    anota('el Excel en el destino, subcarpeta del mes y fecha en el nombre', listarEntregas().includes(esperado), `${listarEntregas().join(', ')} · esperado ${esperado}`);
    if (fs.existsSync(path.join(ENTREGAS, esperado))) {
        const filas = await leerExcel(path.join(ENTREGAS, esperado));
        anota('  y dentro, las ventas por tienda con el día', filas.length === 2 && String(filas[0].dia).startsWith(diaLocal(hora)) && Number(filas[0].importe) === 150, JSON.stringify(filas));
    }
    for (let k = 0; k < 10 && !avisos.length; k++) await espera(500);
    anota('el aviso del sistema', avisos.length === 1 && avisos[0].ok && avisos[0].runId === ej[0]?.id, JSON.stringify(avisos[0] || null));
    const ficha = await get(`/api/ejecuciones/${ej[0]?.id}`);
    const dejo = JSON.stringify(ficha.resumen?.guardados || []);
    anota('la ficha dice lo que dejó, y que sigue ahí', ficha.status === 200 && ficha.programacion?.nombre === 'Cierre diario' && /cierre_/.test(dejo) && !/"existe":false/.test(dejo), `${ficha.resumen?.linea} · ${dejo.slice(0, 220)}`);
    const manana = new Date(hora.getTime() + 86400000);
    anota('anuncia la próxima hora para la tarea del sistema (mañana)', proximas.some(x => new Date(x.p).getTime() === manana.getTime()), JSON.stringify(proximas.slice(-2)));
    console.log(`   esperando un minuto más, a ver si vuelve a correr (${reloj()})`);
    await espera(70000);
    anota('el minuto siguiente no vuelve a correr', (await ejecucionesDe(diaria.id)).length === 1);
    await post(`/api/programaciones/${diaria.id}/pausar`, {});

    // ── 2. Al llegar un archivo
    console.log(`\n2. al llegar (${reloj()})`);
    r = await post('/api/programaciones', { proceso: 'cierre.sqlchain', nombre: 'Al llegar las ventas', regla: { tipo: 'al_llegar', fuente: 'ventas-entrantes' }, parametros: { dia: 'hoy' }, avisar: 'siempre' });
    const llegada = r.programacion;
    anota('programada «al llegar un archivo»', r.status === 200 && !!llegada?.id, r.error);
    await espera(3000);
    // El sincronizador escribe en varias pasadas.
    const nuevo = path.join(ENTRADAS, 'ventas_semana_42.csv');
    fs.writeFileSync(nuevo, 'tienda,importe\n');
    await espera(1500); fs.appendFileSync(nuevo, 'oeste,500\n');
    await espera(1500); fs.appendFileSync(nuevo, 'oeste,25\nnorte,10\n');
    const primera = Date.now();
    await espera(20000);
    fs.writeFileSync(path.join(ENTRADAS, 'ventas_semana_43.csv'), 'tienda,importe\noeste,1\neste,7\n');
    console.log(`   dos archivos llegaron; la espera es de un minuto tras el último (${reloj()})`);
    let ll = [];
    for (let k = 0; k < 60 * 4 && !ll.length; k++) { await espera(1000); ll = await ejecucionesDe(llegada.id); }
    anota('corrió al llegar', ll.length >= 1 && ll[0].estado === 'ok' && ll[0].origen === 'al_llegar', `${reloj()}, ${Math.round((Date.now() - primera) / 1000)} s tras el primero · ${JSON.stringify(ll[0] || null)}`);
    await espera(75000);
    ll = await ejecucionesDe(llegada.id);
    anota('dos archivos casi juntos: una sola ejecución', ll.length === 1, `${ll.length} ejecuciones`);
    const ultimo = listarEntregas().filter(f => f !== esperado).pop();
    if (ultimo) {
        const filas = await leerExcel(path.join(ENTREGAS, ultimo));
        anota('leyó el más nuevo (semana 43)', filas.map(f => f.tienda).join() === 'este,oeste', `${ultimo}: ${JSON.stringify(filas)}`);
    } else anota('dejó su Excel', false, listarEntregas().join(', '));

    // ── 3. El panel de operación
    console.log(`\n3. operación (${reloj()})`);
    const op = await get('/api/operacion');
    const txt = JSON.stringify(op);
    anota('el panel cuenta las dos ejecuciones de hoy', op.status === 200 && (txt.match(/"estado":"completed"|"estado":"ok"/g) || []).length >= 2, txt.slice(0, 300));

    // ── 4. El sincronizador
    console.log(`\n4. el sincronizador (${reloj()})`);
    await espera(20000);
    const todo = [...fs.readdirSync(ENTRADAS), ...listarEntregas()];
    anota('sin copias de conflicto ni temporales', !todo.some(f => /\(\d+\)|conflict|\.amoxtmp|~\$/.test(f)), todo.join(', '));
    console.log(`   lo que quedó: ${todo.join(' · ')}`);
} catch (x) {
    fallos++;
    console.log('NO  inesperado:', x.stack || x.message);
} finally {
    await baseCentral.cerrar().catch(() => {});
    // El vigilante de la fuente de carpeta tiene abierta la carpeta (en Windows
    // eso impide borrarla): se suelta antes.
    require(path.join(RAIZ, 'server/llegadas.js')).parar();
    // La carpeta sincronizada suelta los archivos con retraso: se reintenta.
    for (let k = 0; k < 10 && fs.existsSync(NUBE); k++) {
        try { fs.rmSync(NUBE, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); } catch (e) { if (k === 9) console.log(`(no se pudo borrar ${NUBE}: ${e.message})`); await espera(3000); }
    }
}

console.log(`\n${pasadas}/${pasadas + fallos} como se esperaba (${reloj()})`);
process.exit(fallos ? 1 : 0);
