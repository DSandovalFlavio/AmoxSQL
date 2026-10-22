/**
 * El recorrido real de la 5.13 (fase 5): un proceso programado de un cliente, de
 * punta a punta, por el servidor de AmoxSQL y con un home TEMPORAL.
 *
 *     node scripts/poc513/p04_recorrido_real.mjs
 *
 *   una fuente Excel con su contrato («Take today's columns») → una medida del
 *   workspace → un proceso que lee la fuente, descarga las metas de un servidor
 *   que a esa hora está reiniciándose y deja un Excel → programado a las 6:00 →
 *   el lunes corre bien: límites (AmoxSQL abierto), reintentos, la fecha de los
 *   datos en el Excel y en el aviso → el martes el cliente manda «Monto» en vez de
 *   «Importe»: se para, el aviso dice el cambio de nombre y sale en «Needs
 *   attention» → se arregla el archivo, «Run again» y queda resuelto.
 */
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { libro } from '../ayudas/libroMinimo.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-513real-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'cierre-norte');
fs.mkdirSync(path.join(P, 'entrada'), { recursive: true });

const require = createRequire(import.meta.url);
const anota = (t, ok, d = '') => console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${String(d).slice(0, 300)}` : ''}`);
const t0 = Date.now();

// El servidor de metas del cliente: a las 6:00 se está reiniciando (503 seis veces).
let peticiones = 0;
const servidor = http.createServer((req, res) => {
    if (++peticiones <= 6) { res.writeHead(503); return res.end('restarting'); }
    const csv = 'Tienda,Meta\nnorte,250\nsur,100\n';
    res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Length': Buffer.byteLength(csv) });
    res.end(req.method === 'HEAD' ? undefined : csv);
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const URL_METAS = `http://127.0.0.1:${servidor.address().port}/metas.csv`;

const XLSX = path.join(P, 'entrada', 'ventas.xlsx');
const LUNES_ARCHIVO = new Date(2026, 9, 25, 21, 40);
const filas = (n) => Array.from({ length: n }, (_, i) => [1000 + i, ['norte', 'sur'][i % 2], 10 + i, new Date(Date.UTC(2026, 9, 1 + (i % 25)))]);
const escribir = (enc, f, cuando) => { libro(XLSX, enc, f); fs.utimesSync(XLSX, cuando, cuando); };
// La primera celda de Importe, vacía: con tipos, la columna sería texto.
escribir(['Folio', 'Tienda', 'Importe', 'Fecha'], [[999, 'norte', null, new Date(Date.UTC(2026, 9, 1))], ...filas(40)], LUNES_ARCHIVO);

try {
    const { startServer, arrancarProgramador } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const programador = require(path.join(RAIZ, 'server/programacion/programador.js'));
    const zip = require(path.join(RAIZ, 'server/zip.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const u = (q) => `http://localhost:${port}${q}`;
    const pedir = (m) => (q, b) => fetch(u(q), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
    const avisos = [];
    arrancarProgramador({ reloj: true, cadaMs: 3600000, avisar: (a) => avisos.push(a) });

    // El workspace del cliente, con su medida compartida.
    const ws = await post('/api/workspaces', { nombre: 'Cliente Norte' });
    const wsId = ws.id || ws.workspace?.id;
    const ctxWs = path.join(process.env.AMOXSQL_HOME, 'workspaces', wsId, 'contexto');
    fs.mkdirSync(ctxWs, { recursive: true });
    fs.writeFileSync(path.join(ctxWs, 'metrics.yml'), 'metrics:\n  - name: venta_total\n    sql: "SUM(Importe)"\n    description: Total sales, the same in every project of the client\n');
    await post('/api/project/open', { path: P });
    await put('/api/proyectos-enlace', { ruta: P, workspaceId: wsId });
    await post('/api/db/connect', { path: ':memory:' });

    // La fuente y su contrato, tomado de lo que trae hoy.
    await post('/api/fuentes', { definicion: { nombre: 'ventas', tipo: 'archivo', ubicacion: 'entrada/ventas.xlsx' } });
    let h = await post('/api/fuentes/ventas/contrato/de-hoy', {});
    const contrato = { ...h.contrato, reglas: [{ tipo: 'rango', columna: 'Importe', min: 0 }] };
    await post('/api/fuentes', { anterior: 'ventas', definicion: { nombre: 'ventas', tipo: 'archivo', ubicacion: 'entrada/ventas.xlsx', contrato } });
    anota('el contrato de la fuente, tomado de lo de hoy (Importe número aunque su primera celda esté vacía)', contrato.columnas.find(c => c.nombre === 'Importe')?.tipo === 'numero' && contrato.columnas.find(c => c.nombre === 'Fecha')?.tipo === 'fecha', JSON.stringify(contrato.columnas));
    const m = (await get('/api/medidas')).medidas || [];
    anota('la medida del workspace, montada como función', m.some(x => x.nombre === 'venta_total' && x.llamada === 'venta_total(Importe)'), JSON.stringify(m.map(x => x.llamada)));

    // El proceso: ventas por tienda con la medida, contra la meta descargada → Excel.
    const SALIDA = path.join(P, 'salida', 'cierre.xlsx');
    const proceso = {
        name: 'Cierre semanal', config: { base: 'memoria' },
        nodes: [
            { id: 'f', type: 'fuente', label: 'Ventas', config: { fuente: 'ventas' } },
            { id: 'h', type: 'http_fetch', label: 'Metas', config: { url: URL_METAS, tableName: 'metas', format: 'csv', reintentos: { veces: 2, esperaSegundos: 1 } } },
            { id: 'q', type: 'sql_inline', label: 'Por tienda', config: { query: 'SELECT v.Tienda, venta_total(v.Importe) AS venta, any_value(m.Meta) AS meta FROM fuentes."ventas" v JOIN metas m USING (Tienda) GROUP BY ALL ORDER BY 1' } },
            { id: 'x', type: 'excel', label: 'Excel', config: { outputPath: SALIDA, lineaDeFecha: true } },
        ],
        edges: [{ id: 'a', source: 'f', target: 'q' }, { id: 'b', source: 'h', target: 'q' }, { id: 'c', source: 'q', target: 'x' }],
    };
    fs.writeFileSync(path.join(P, 'cierre.sqlchain'), JSON.stringify(proceso, null, 2));
    const prog = await post('/api/programaciones', { proceso: 'cierre.sqlchain', regla: { tipo: 'diaria', hora: '06:00' }, avisar: 'siempre' });
    const progId = prog.programacion?.id;
    anota('programado a las 6:00, avisar siempre', !!progId, JSON.stringify(prog).slice(0, 200));

    // El lunes a las 6:01.
    const lunes = new Date(2026, 9, 26, 6, 1);
    let t = await programador.tick(lunes);
    let c = t.corridas.find(x => x.programacionId === progId);
    let ficha = c?.runId ? await get(`/api/ejecuciones/${c.runId}`) : {};
    anota('el lunes corre bien', c?.estado === 'ok', JSON.stringify(c).slice(0, 300));
    const metas = (ficha.pasos || []).find(p => p.tipo === 'http_fetch');
    anota('  el servidor de metas se reiniciaba: el paso reintentó y siguió', metas?.reintentos >= 1 && metas.estado === 'success', JSON.stringify(metas));
    anota('  con AmoxSQL abierto, corrió con límites (lo dice la ficha)', ficha.limites?.aplicados === true, JSON.stringify(ficha.limites));
    const aviso = avisos.at(-1);
    anota('  el aviso dice de cuándo son los datos', /data as of 25 Oct 2026/.test(aviso?.texto || ''), JSON.stringify(aviso));
    const z = zip.abrir(SALIDA);
    const hoja = z.leer('xl/worksheets/sheet1.xml').toString('utf8');
    const custom = z.leer('docProps/custom.xml')?.toString('utf8') || '';
    z.cerrar();
    anota('  el Excel: la medida calculada, la meta, y «Data as of 25 Oct 2026» bajo la tabla y en sus propiedades', /Data as of 25 Oct 2026/.test(hoja) && /Data as of/.test(custom) && /<v>250<\/v>/.test(hoja), hoja.slice(0, 300));

    // El martes, el cliente cambió la columna.
    escribir(['Folio', 'Tienda', 'Monto', 'Fecha'], filas(40), new Date(2026, 9, 26, 22, 10));
    const martes = new Date(2026, 9, 27, 6, 1);
    t = await programador.tick(martes);
    c = t.corridas.find(x => x.programacionId === progId);
    anota('el martes se para', c?.estado === 'fallo', JSON.stringify(c).slice(0, 300));
    const avisoMal = avisos.at(-1);
    anota('  el aviso dice el cambio de nombre', /Cierre semanal failed/.test(avisoMal?.titulo || '') && /"Importe" is missing — "Monto" is new: was it renamed\?/.test(avisoMal?.texto || ''), JSON.stringify(avisoMal));
    let a = await get('/api/operacion/atencion');
    let fila = a.atencion?.find(x => x.id === c.runId);
    anota('  y sale en «Needs attention», con la razón', !!fila && /was it renamed/.test(fila.razon), JSON.stringify(a.atencion).slice(0, 300));
    a = await get(`/api/operacion/atencion?workspace=${wsId}`);
    anota('  también en la ficha de «Cliente Norte»', a.atencion?.some(x => x.id === c.runId));

    // Se arregla el archivo y «Run again».
    escribir(['Folio', 'Tienda', 'Importe', 'Fecha'], filas(40), new Date(2026, 9, 27, 8, 30));
    const r = await post(`/api/ejecuciones/${c.runId}/repetir`, {});
    anota('arreglado el archivo, «Run again» termina', r.estado === 'ok', JSON.stringify(r).slice(0, 300));
    a = await get('/api/operacion/atencion');
    anota('  y «Needs attention» queda vacío', !a.atencion?.length, JSON.stringify(a.atencion).slice(0, 200));
    await baseCentral.cerrar();
} catch (e) {
    anota('inesperado', false, e.stack || e.message);
} finally {
    servidor.close();
}
console.log(`\n${Math.round((Date.now() - t0) / 1000)} s · ${TMP}`);
process.exit(0);
