/**
 * El recorrido real de la 5.15 (fase 4): un Canvas de cliente de punta a punta,
 * por el servidor de AmoxSQL y con un home TEMPORAL.
 *
 *     node scripts/poc515/p01_recorrido_real.mjs
 *
 *   el Excel semanal del cliente, como fuente con nombre → un Canvas: la Source,
 *   una limpieza y dos ramas (por tienda y por día), un gráfico, una cifra y una
 *   nota dentro de un marco → Refresh en orden de dependencias, con su foto →
 *   llega el Excel de la semana siguiente y los números cambian → el marco sale a
 *   Report Flow con su gráfico autónomo → la rama «por tienda» sale a Data Flow,
 *   se le añade un Excel, se programa y corre sola → el lienzo, a cuaderno → se
 *   renombra una tarjeta y el diff legible lo dice.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { libro } from '../ayudas/libroMinimo.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-515real-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'cierre-norte');
fs.mkdirSync(path.join(P, 'entrada'), { recursive: true });

const require = createRequire(import.meta.url);
const imp = (rel) => import(pathToFileURL(path.join(RAIZ, rel)).href);
let si = 0, no = 0;
const anota = (t, ok, d = '') => { ok ? si++ : no++; console.log(`${ok ? 'SI ' : 'NO '} ${t}${!ok && d ? `  — ${String(d).slice(0, 400)}` : ''}`); };
const t0 = Date.now();

const XLSX = path.join(P, 'entrada', 'ventas.xlsx');
const semana = (factor) => Array.from({ length: 30 }, (_, i) => [
    1000 + i, ['norte', 'sur', 'este'][i % 3], Math.round((40 + i * 3) * factor * 100) / 100,
    new Date(Date.UTC(2026, 9, 1 + (i % 10))), i % 7 === 0 ? 'devuelto' : 'ok',
]);

try {
    const lf = await imp('client/src/utils/lienzoFile.js');
    const g = await imp('client/src/components/lienzo/grafoLienzo.js');
    const sal = await imp('client/src/components/lienzo/salidas.js');
    const cf = await imp('client/src/utils/cuadernoFile.js');
    const { analizarCelda } = await imp('client/src/utils/celdaSql.js');
    const { componerCelda } = await imp('client/src/utils/vistaDeCelda.js');

    const { startServer, arrancarProgramador } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const programador = require(path.join(RAIZ, 'server/programacion/programador.js'));
    const dp = require(path.join(RAIZ, 'server/diffDeProcesos.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
        .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST');
    arrancarProgramador({ reloj: false, avisar: () => {} });

    libro(XLSX, ['Folio', 'Tienda', 'Importe', 'Fecha', 'Estado'], semana(1));
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: ':memory:' });
    await post('/api/fuentes', { definicion: { nombre: 'ventas', tipo: 'archivo', ubicacion: 'entrada/ventas.xlsx', descripcion: 'Weekly sales from the client' } });

    // ── El lienzo, armado como lo haría la analista ──
    let l = { titulo: '¿Por qué cayó el Sur?', parametros: { estado: 'ok' }, tarjetas: [] };
    const anadir = (t) => { l = { ...l, tarjetas: [...l.tarjetas, t] }; return t; };
    const fuente = anadir({ id: g.nombreParaFuente(l, { tipo: 'fuente', nombre: 'ventas' }), tipo: 'source', origen: { tipo: 'fuente', nombre: 'ventas' }, x: 40, y: 80, w: 260, h: 170 });
    anadir({ id: 'limpias', tipo: 'query', x: 360, y: 60, w: 360, h: 260, sql: `SELECT * FROM ${fuente.id}\nWHERE Estado = '{{estado}}'` });
    const pt = g.consultaNueva(l, 'limpias', 'agrupar', { columna: 'Tienda' });
    anadir({ id: 'por_tienda', tipo: 'query', x: 800, y: 60, w: 340, h: 240, marco: 'tiendas', sql: 'SELECT Tienda, sum(Importe) AS venta, count(*) AS tickets\nFROM limpias\nGROUP BY Tienda\nORDER BY venta DESC' });
    anadir({ id: 'por_dia', tipo: 'query', x: 800, y: 520, w: 340, h: 220, sql: 'SELECT Fecha, Tienda, sum(Importe) AS venta\nFROM limpias\nGROUP BY ALL' });
    anadir({ id: 'barras', tipo: 'chart', x: 1180, y: 60, w: 380, h: 280, marco: 'tiendas', desde: 'por_tienda', grafico: { chartType: 'bar', xAxisKey: 'Tienda', yAxisKeys: ['venta'] } });
    anadir({ id: 'total', tipo: 'number', x: 1180, y: 360, w: 220, h: 150, marco: 'tiendas', desde: 'limpias', cifra: { columna: 'Importe', agregado: 'sum', etiqueta: 'Venta sin devoluciones' } });
    anadir({ id: 'nota_1', tipo: 'note', x: 1420, y: 360, w: 180, h: 110, marco: 'tiendas', texto: 'El Sur va por detrás: ¿devoluciones?' });
    anadir({ id: 'tiendas', tipo: 'frame', x: 770, y: 20, w: 860, h: 480, titulo: 'Por tienda' });
    anota('la consulta que propone «Group by…» ya lee a su padre', analizarCelda(pt.sql).lee.includes('limpias'), pt.sql);
    const archivo = path.join(P, 'octubre.amoxcanvas');
    fs.writeFileSync(archivo, lf.escribirLienzo(l));
    l = lf.leerLienzo(fs.readFileSync(archivo, 'utf8'));
    anota('el .amoxcanvas se escribe y se lee igual', lf.escribirLienzo(l) === fs.readFileSync(archivo, 'utf8'));
    const ar = g.aristas(l);
    anota('las flechas salen solas, con su etiqueta', ar.some(e => e.de === 'limpias' && e.a === 'por_tienda' && e.etiqueta === 'by Tienda') && ar.some(e => e.de === fuente.id && e.a === 'limpias' && /^where Estado/.test(e.etiqueta)) && ar.some(e => e.de === 'por_tienda' && e.a === 'barras'), JSON.stringify(ar));

    // Refresh all, como lo hace el editor.
    const sustituir = (sql) => sql.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, n) => l.parametros[n] ?? '');
    const refrescar = async () => {
        const fallos = [];
        const resultados = {};
        for (const id of g.ordenDeRefresco(l).orden) {
            const t = l.tarjetas.find(x => x.id === id);
            const sql = sustituir(g.sqlDeTarjeta(t));
            const r = await post('/api/cuaderno/celda', { ...componerCelda({ sql, analisis: analizarCelda(sql), nombre: t.id }), limit: 1000 });
            if (r.error) fallos.push(`${id}: ${r.error}`); else resultados[id] = r;
        }
        for (const t of l.tarjetas.filter(x => x.tipo === 'chart' || x.tipo === 'number')) {
            const r = await post('/api/cuaderno/celda', { preparacion: '', lector: g.sqlDeVisual(t), vista: null, deja: 'nada', limit: 10000 });
            if (r.error) fallos.push(`${t.id}: ${r.error}`); else resultados[t.id] = r;
        }
        return { fallos, resultados };
    };
    let rf = await refrescar();
    const total1 = Number(rf.resultados.total?.data?.[0]?.valor);
    anota('Refresh all: todas las tarjetas, en orden, sin fallos', rf.fallos.length === 0 && Object.keys(rf.resultados).length === 6, rf.fallos.join(' | '));
    anota('el parámetro {{estado}} deja fuera las devoluciones', total1 > 0 && Number(rf.resultados.limpias.rowCount) === 25, JSON.stringify(rf.resultados.limpias?.rowCount));
    anota('el gráfico tiene una barra por tienda', rf.resultados.barras?.data?.length === 3);

    // Llega el Excel de la semana siguiente: un 10 % más.
    libro(XLSX, ['Folio', 'Tienda', 'Importe', 'Fecha', 'Estado'], semana(1.1));
    rf = await refrescar();
    const total2 = Number(rf.resultados.total?.data?.[0]?.valor);
    anota('con el Excel nuevo, Refresh da los números nuevos (un 10 % más)', Math.abs(total2 / total1 - 1.1) < 0.001, `${total1} → ${total2}`);

    // ── El marco, a Report Flow ──
    const deck = sal.planDeDeck(l, 'octubre');
    anota('el marco sale como una lámina con su gráfico y su nota', deck.laminas.length === 1 && deck.laminas[0].layout === 'chart-full' && deck.laminas[0].prose.includes('¿devoluciones?'), JSON.stringify(deck.laminas));
    const vis = JSON.parse(deck.graficos[0].contenido);
    const consultaDeck = vis.query.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, n) => l.parametros[n]);
    let r = await post('/api/query', { query: consultaDeck });
    anota('y el gráfico del deck corre solo, sin las vistas del lienzo', r.data?.length === 3 && !r.error, JSON.stringify(r).slice(0, 200));

    // ── La rama, a Data Flow, programada ──
    const proc = sal.aDataFlow(l, 'por_tienda');
    proc.nodes.push({ id: 'excel', type: 'excel', label: 'Libro', position: { x: 1000, y: 120 }, config: { outputPath: 'salida/por_tienda.xlsx' } });
    proc.edges.push({ id: 'e_excel', source: proc.nodes[proc.nodes.length - 2].id, target: 'excel' });
    fs.writeFileSync(path.join(P, 'por_tienda.sqlchain'), JSON.stringify(proc, null, 2));
    anota('la rama son tres pasos, con el parámetro como variable', proc.nodes.length === 4 && proc.variables.estado === 'ok', JSON.stringify(proc.variables));
    const prog = await post('/api/programaciones', { proceso: 'por_tienda.sqlchain', regla: { tipo: 'diaria', hora: '06:00' }, avisar: 'fallo' });
    const progId = prog.programacion?.id;
    const t = await programador.tick(new Date(Date.now() + 26 * 3600 * 1000));
    const corrida = (t.corridas || []).find(c => c.programacionId === progId || c.programacion_id === progId) || t.corridas?.[0];
    anota('programada, corre sola y entrega su Excel', !!progId && corrida?.estado === 'ok' && fs.existsSync(path.join(P, 'salida', 'por_tienda.xlsx')), JSON.stringify(t).slice(0, 300));

    // ── El lienzo, a cuaderno ──
    const nb = sal.aCuaderno(l);
    fs.writeFileSync(path.join(P, 'octubre.sqlnb'), nb);
    const celdas = cf.leerCuaderno(nb).celdas.filter(c => c.tipo === 'sql').map(c => c.nombre);
    anota('a cuaderno: las consultas en orden de dependencias', celdas.join() === `${fuente.id},limpias,por_tienda,por_dia` || celdas.join() === `${fuente.id},limpias,por_dia,por_tienda`, celdas.join());

    // ── Renombrar y el diff legible ──
    const git = (...a) => execFileSync('git', ['-C', P, ...a], { stdio: 'pipe' });
    try {
        git('init', '-q'); git('config', 'user.email', 'ana@example.com'); git('config', 'user.name', 'Ana');
        git('add', 'octubre.amoxcanvas'); git('commit', '-q', '-m', 'canvas');
        const ren = g.renombrar(l, 'limpias', 'ventas_ok');
        fs.writeFileSync(archivo, lf.escribirLienzo(ren.lienzo));
        r = await get('/api/procesos/cambios?ruta=octubre.amoxcanvas');
        anota('renombrar reescribe a quien la lee, y What changed lo dice', ren.cambian.filter(c => c.que === 'sql').length === 2 && r.nodos?.anadidos?.some(n => n.id === 'ventas_ok') && r.nodos?.cambiados?.some(n => n.id === 'por_tienda'), JSON.stringify(r.lineas));
    } catch (e) {
        anota('git disponible para el diff', false, e.message);
    }

    await baseCentral.cerrar();
} catch (e) {
    no++;
    console.log('NO  inesperado:', e.stack || e.message);
}

console.log(`\n${si} sí, ${no} no · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(no ? 1 : 0);
