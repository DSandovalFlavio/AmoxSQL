/**
 * El Canvas, fase 0 (5.15; Dec-54, Dec-55, Dec-57).
 *
 *     node scripts/probarLienzo.mjs
 *
 *   - El archivo `.amoxcanvas`: JSON estable (orden fijo, SQL en líneas), ida y
 *     vuelta idéntica, la foto con sus topes, Clear snapshots, lo desconocido se
 *     conserva, y un archivo roto lanza en vez de abrirse vacío.
 *   - El grafo: las flechas salen de lo que lee cada consulta (no de lo dibujado),
 *     las de un Chart o un Number de su `desde`; las etiquetas se deducen; el
 *     orden de Refresh y los ciclos; renombrar reescribe sólo lecturas.
 *   - Por el servidor (home temporal): las tarjetas, en ese orden, dejan sus
 *     vistas con `/api/cuaderno/celda` y la última lee a las de arriba.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-lienzo-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(P, { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 500) : ''}`); }
};
const imp = (rel) => import(pathToFileURL(path.join(RAIZ, rel)).href);

try {
    const lf = await imp('client/src/utils/lienzoFile.js');
    const g = await imp('client/src/components/lienzo/grafoLienzo.js');
    const { analizarCelda } = await imp('client/src/utils/celdaSql.js');
    const { componerCelda } = await imp('client/src/utils/vistaDeCelda.js');

    // ── el archivo ──
    console.log('\nel archivo .amoxcanvas');
    const lienzo = {
        titulo: 'Ventas de octubre',
        parametros: { hasta: '2026-10-31', desde: '2026-10-01' },
        tarjetas: [
            { id: 'ventas_limpias', tipo: 'query', x: 420.4, y: 80, w: 360, h: 260, marco: 'trafico', sql: "SELECT * FROM ventas_src\nWHERE estado <> 'devuelto'", modo: 'ambos' },
            { id: 'ventas_src', tipo: 'source', x: 40, y: 100, w: 240, h: 140, origen: { tipo: 'tabla', nombre: 'ventas' } },
            { id: 'por_tienda', tipo: 'query', x: 900, y: 80, w: 300, h: 220, sql: 'SELECT tienda, sum(importe) AS venta\nFROM ventas_limpias\nGROUP BY tienda',
                foto: { cuando: '2026-10-22T09:14:00Z', filas: 3, columnas: ['tienda', 'venta'], muestra: Array.from({ length: 80 }, (_, i) => [`t${i}`, i]) } },
            { id: 'barras', tipo: 'chart', x: 900, y: 360, w: 360, h: 260, desde: 'por_tienda', grafico: { tipo: 'bar', x: 'tienda', y: ['venta'] },
                foto: { cuando: '2026-10-22T09:14:00Z', puntos: Array.from({ length: 5000 }, (_, i) => [i, i]) } },
            { id: 'nota_1', tipo: 'note', x: 1300, y: 80, w: 180, h: 110, texto: 'El Sur cayó la semana 3' },
            { id: 'trafico', tipo: 'frame', x: 380, y: 40, w: 900, h: 600, titulo: 'Tráfico' },
            { id: 'futuro', tipo: 'transformacion_visual', x: 0, y: 0, pasos: [{ op: 'filtrar' }] },
        ],
        etiquetas: { 'ventas_src→ventas_limpias': 'sin devoluciones' },
        vista: { x: 10.6, y: -3.2, zoom: 0.8 },
    };
    const texto = lf.escribirLienzo(lienzo);
    const j = JSON.parse(texto);
    comprobar('es JSON con su formato y versión', j.formato === 'amoxcanvas' && j.version === 1);
    comprobar('las tarjetas en orden de id', j.tarjetas.map(t => t.id).join() === 'barras,futuro,nota_1,por_tienda,trafico,ventas_limpias,ventas_src', j.tarjetas.map(t => t.id).join());
    comprobar('las claves de una tarjeta en su orden', Object.keys(j.tarjetas.find(t => t.id === 'ventas_limpias')).join() === 'id,tipo,x,y,w,h,marco,modo,sql', Object.keys(j.tarjetas.find(t => t.id === 'ventas_limpias')).join());
    comprobar('el SQL va en líneas', JSON.stringify(j.tarjetas.find(t => t.id === 'ventas_limpias').sql) === JSON.stringify(['SELECT * FROM ventas_src', "WHERE estado <> 'devuelto'"]));
    comprobar('las posiciones, redondeadas', j.tarjetas.find(t => t.id === 'ventas_limpias').x === 420 && j.vista.x === 11);
    comprobar('los parámetros en orden', Object.keys(j.parametros).join() === 'desde,hasta');
    comprobar('la foto con sus topes (50 filas, 2.000 puntos)', j.tarjetas.find(t => t.id === 'por_tienda').foto.muestra.length === 50 && j.tarjetas.find(t => t.id === 'barras').foto.puntos.length === 2000);
    comprobar('la foto va en filas, una por línea', texto.includes('"columnas": ["tienda","venta"]') && texto.includes('          ["t0",0],'), texto.slice(texto.indexOf('"foto"'), texto.indexOf('"foto"') + 160));
    const leido = lf.leerLienzo(texto);
    comprobar('ida y vuelta: el mismo texto', lf.escribirLienzo(leido) === texto);
    comprobar('en memoria el SQL es texto', leido.tarjetas.find(t => t.id === 'por_tienda').sql === 'SELECT tienda, sum(importe) AS venta\nFROM ventas_limpias\nGROUP BY tienda');
    comprobar('un tipo desconocido se conserva entero', JSON.stringify(leido.tarjetas.find(t => t.id === 'futuro').pasos) === '[{"op":"filtrar"}]');
    const sinFoto = lf.escribirLienzo(lf.sinFotos(leido));
    comprobar('Clear snapshots quita todas las fotos', !sinFoto.includes('"foto"') && sinFoto.includes('"por_tienda"'));
    comprobar('un archivo vacío es un lienzo vacío', lf.leerLienzo('').tarjetas.length === 0);
    let e1 = null; try { lf.leerLienzo('{ "tarjetas": [ '); } catch (e) { e1 = e; }
    comprobar('uno roto lanza (y no se abre vacío)', e1 instanceof lf.ErrorDeLienzo && /not valid JSON/.test(e1.message), e1?.message);
    let e2 = null; try { lf.leerLienzo('{"formato":"amoxcanvas","version":9}'); } catch (e) { e2 = e; }
    comprobar('uno de una versión más nueva lo dice', /newer AmoxSQL/.test(e2?.message || ''), e2?.message);
    comprobar('dos tarjetas con el mismo nombre: manda la primera', lf.leerLienzo('{"tarjetas":[{"id":"a","tipo":"note","texto":"1"},{"id":"A","tipo":"note","texto":"2"}]}').tarjetas.length === 1);

    // ── el grafo ──
    console.log('\nel grafo');
    const ar = g.aristas(leido);
    const tiene = (de, a) => ar.find(e => e.de === de && e.a === a);
    comprobar('las flechas salen de lo que lee cada consulta', !!tiene('ventas_src', 'ventas_limpias') && !!tiene('ventas_limpias', 'por_tienda') && ar.filter(e => e.a !== 'barras').length === 2, JSON.stringify(ar));
    comprobar('la de un Chart, de su desde', !!tiene('por_tienda', 'barras'));
    comprobar('una tabla de verdad no es una tarjeta: no hay flecha', !ar.some(e => e.de === 'ventas'));
    comprobar('la etiqueta escrita a mano gana', tiene('ventas_src', 'ventas_limpias')?.etiqueta === 'sin devoluciones' && tiene('ventas_src', 'ventas_limpias').aMano);
    comprobar('la deducida: by tienda', tiene('ventas_limpias', 'por_tienda')?.etiqueta === 'by tienda', tiene('ventas_limpias', 'por_tienda')?.etiqueta);
    comprobar('etiqueta: where (con su literal)', g.etiquetaDeducida("SELECT * FROM v WHERE estado <> 'devuelto'", 'v') === "where estado <> 'devuelto'");
    comprobar('etiqueta: + metas por un JOIN', g.etiquetaDeducida('SELECT * FROM por_tienda p JOIN metas m USING (tienda)', 'metas') === '+ metas');
    comprobar('etiqueta: + rows of en una UNION', g.etiquetaDeducida('SELECT * FROM norte UNION ALL SELECT * FROM sur', 'sur') === '+ rows of sur');
    comprobar('etiqueta: nada que decir en un SELECT *', g.etiquetaDeducida('SELECT * FROM x', 'x') === null);
    comprobar('etiqueta: larga, recortada', g.etiquetaDeducida('SELECT 1 FROM x GROUP BY una_columna_larga, otra_columna_larga, y_otra', 'x').length <= 34);
    const lin = g.linaje(leido, 'ventas_limpias');
    comprobar('el linaje: lo de arriba y lo de abajo', [...lin.arriba].join() === 'ventas_src' && [...lin.abajo].sort().join() === 'barras,por_tienda', JSON.stringify([[...lin.arriba], [...lin.abajo]]));
    const ord = g.ordenDeRefresco(leido);
    comprobar('Refresh en orden de dependencias', ord.orden.join() === 'ventas_src,ventas_limpias,por_tienda' && ord.enCiclo.length === 0, JSON.stringify(ord));
    comprobar('Refresh de una rama: ella y lo que la lee', g.ordenDeRefresco(leido, { desde: 'ventas_limpias' }).orden.join() === 'ventas_limpias,por_tienda');
    const ciclo = { tarjetas: [{ id: 'a', tipo: 'query', sql: 'SELECT * FROM b' }, { id: 'b', tipo: 'query', sql: 'SELECT * FROM a' }] };
    comprobar('un ciclo se dice', g.ordenDeRefresco(ciclo).enCiclo.sort().join() === 'a,b');

    console.log('\nfuentes y problemas');
    comprobar('una fuente con nombre se lee de fuentes.', g.sqlDeTarjeta({ tipo: 'source', origen: { tipo: 'fuente', nombre: 'ventas' } }) === 'SELECT * FROM fuentes."ventas"');
    comprobar('una tabla de otro proyecto, calificada', g.sqlDeTarjeta({ tipo: 'source', origen: { tipo: 'tabla', nombre: '"cierre_norte".main.metas' } }) === 'SELECT * FROM "cierre_norte"."main"."metas"');
    comprobar('un archivo, con sus comillas', g.sqlDeTarjeta({ tipo: 'source', origen: { tipo: 'archivo', ruta: "datos/o'brien.csv" } }) === "SELECT * FROM 'datos/o''brien.csv'");
    comprobar('el nombre de una Source: la fuente tal cual; una tabla, con _src', g.nombreParaFuente(leido, { tipo: 'fuente', nombre: 'Ventas Norte' }) === 'ventas_norte' && g.nombreParaFuente(leido, { tipo: 'tabla', nombre: 'ventas' }) === 'ventas_src_2');
    comprobar('una tarjeta que se lee a sí misma no se ejecuta', /its own name/.test(g.problemaDeTarjeta({ id: 'ventas', tipo: 'source', origen: { tipo: 'tabla', nombre: 'ventas' } }) || ''));
    comprobar('una tarjeta que escribe, tampoco', /cannot change data/.test(g.problemaDeTarjeta({ id: 'x', tipo: 'query', sql: 'DELETE FROM ventas' }) || ''));
    comprobar('una sana, sin problema', g.problemaDeTarjeta(leido.tarjetas.find(t => t.id === 'por_tienda')) === null);

    console.log('\nrenombrar');
    const sqlR = `-- de ventas_limpias\nSELECT ventas_limpias.tienda, 'ventas_limpias' AS texto, v.ventas_limpias\nFROM ventas_limpias\nJOIN "ventas_limpias" v2 USING (tienda)`;
    const rr = g.reescribirLecturas(sqlR, 'ventas_limpias', 'limpias');
    comprobar('reescribe FROM, JOIN y el calificador', rr.sql.includes('FROM limpias') && rr.sql.includes('JOIN limpias v2') && rr.sql.includes('SELECT limpias.tienda') && rr.cambios === 3, rr.sql);
    comprobar('nunca un texto, un comentario ni una columna con el mismo nombre', rr.sql.includes("'ventas_limpias' AS texto") && rr.sql.includes('-- de ventas_limpias') && rr.sql.includes('v.ventas_limpias'), rr.sql);
    const ren = g.renombrar(leido, 'ventas_limpias', 'limpias');
    comprobar('renombrar: la tarjeta y las que la leen', ren.lienzo.tarjetas.some(t => t.id === 'limpias') && ren.lienzo.tarjetas.find(t => t.id === 'por_tienda').sql.includes('FROM limpias') && ren.cambian.some(c => c.id === 'por_tienda' && c.que === 'sql'), JSON.stringify(ren.cambian));
    comprobar('y las flechas siguen igual', g.aristas(ren.lienzo).some(e => e.de === 'limpias' && e.a === 'por_tienda') && g.aristas(ren.lienzo).some(e => e.de === 'ventas_src' && e.a === 'limpias' && e.etiqueta === 'sin devoluciones'));
    const renMarco = g.renombrar(leido, 'trafico', 'ventas_de_octubre');
    comprobar('renombrar un marco mueve a quien está dentro', renMarco.lienzo.tarjetas.find(t => t.id === 'ventas_limpias').marco === 'ventas_de_octubre');
    const renChart = g.renombrar(leido, 'por_tienda', 'tiendas');
    comprobar('y el desde de un gráfico', renChart.lienzo.tarjetas.find(t => t.id === 'barras').desde === 'tiendas');
    comprobar('un nombre ocupado no se acepta', /already the name/.test(g.renombrar(leido, 'por_tienda', 'Ventas_Src').error || ''));
    const lista = { tarjetas: [{ id: 'a', tipo: 'query', sql: 'SELECT 1' }, { id: 'b', tipo: 'query', sql: 'SELECT * FROM x, a' }] };
    comprobar('lo que no se reescribe solo (una lista FROM x, a) se dice', g.renombrar(lista, 'a', 'z').siguenLeyendo.join() === 'b');

    console.log('\nsoltar una conexión en un hueco');
    const nf = g.consultaNueva(leido, 'por_tienda', 'filtrar', { columna: 'tienda' });
    comprobar('Filter… escribe el SQL y un nombre libre', nf.id === 'paso_1' && nf.sql === 'SELECT *\nFROM por_tienda\nWHERE tienda = ');
    comprobar('Group by…', g.consultaNueva(leido, 'ventas_limpias', 'agrupar', { columna: 'tienda' }).sql.includes('GROUP BY tienda'));
    comprobar('Join with…', g.consultaNueva(leido, 'por_tienda', 'unir', { otra: 'metas', columna: 'tienda' }).sql.includes('JOIN metas AS b USING (tienda)'));
    comprobar('y la conexión sale sola', g.aristas({ tarjetas: [...leido.tarjetas, nf] }).some(e => e.de === 'por_tienda' && e.a === 'paso_1'));

    console.log('\nChart y Number (fase 2)');
    comprobar('un Chart lee las filas de su tarjeta', g.sqlDeVisual({ tipo: 'chart', desde: 'por_tienda' }) === 'SELECT * FROM "por_tienda"');
    comprobar('un Number: la cuenta de una columna', g.sqlDeVisual({ tipo: 'number', desde: 'v', cifra: { columna: 'importe', agregado: 'avg' } }) === 'SELECT avg("importe") AS valor FROM "v"');
    comprobar('sin columna, las filas', g.sqlDeVisual({ tipo: 'number', desde: 'v', cifra: { agregado: 'count' } }) === 'SELECT count(*) AS valor FROM "v"');
    comprobar('comparado con otra tarjeta: valor y base', g.sqlDeVisual({ tipo: 'number', desde: 'oct', cifra: { columna: 'importe', comparar: 'sep' } }) === 'SELECT (SELECT sum("importe") FROM "oct") AS valor, (SELECT sum("importe") FROM "sep") AS base');
    comprobar('sin tarjeta que enseñar, nada', g.sqlDeVisual({ tipo: 'chart' }) === '');
    comprobar('lo que lee: la suya y la de comparar', g.leeVisual({ tipo: 'number', desde: 'oct', cifra: { comparar: 'sep' } }).join() === 'oct,sep');

    console.log('\nlo que sale del lienzo (fase 3)');
    const sal = await imp('client/src/components/lienzo/salidas.js');
    const conMarcos = {
        ...leido,
        tarjetas: [...leido.tarjetas,
            { id: 'marco_b', tipo: 'frame', x: 380, y: 900, w: 600, h: 300, titulo: 'Segundo' },
            { id: 'cifra', tipo: 'number', x: 400, y: 950, w: 200, h: 120, marco: 'marco_b', desde: 'ventas_limpias', cifra: { columna: 'importe', etiqueta: 'Venta' }, foto: { cuando: 'x', valor: 175 } },
        ],
    };
    comprobar('los marcos, en orden de lectura', sal.marcosEnOrden(conMarcos).map(m => m.id).join() === 'trafico,marco_b');
    comprobar('lo que tiene dentro un marco', sal.tarjetasDeMarco(conMarcos, 'trafico').map(t => t.id).join() === 'ventas_limpias');
    comprobar('la rama hasta una tarjeta, en orden', sal.ramaHasta(leido, 'por_tienda').join() === 'ventas_src,ventas_limpias,por_tienda');
    const auto = sal.sqlAutonomo(leido, 'por_tienda');
    comprobar('el SQL autónomo lleva lo de arriba como CTE', auto.startsWith('WITH ventas_src AS (\nSELECT * FROM "ventas"\n),\nventas_limpias AS (') && auto.trim().endsWith('GROUP BY tienda'), auto);
    comprobar('el de un gráfico, su lectura al final', sal.sqlAutonomo(leido, 'barras').trim().endsWith('SELECT * FROM "por_tienda"'));
    comprobar('una nota no tiene SQL', sal.sqlAutonomo(leido, 'nota_1') === null);
    const nb = sal.aCuaderno(leido);
    const lc = await imp('client/src/utils/cuadernoFile.js');
    const celdasNb = lc.leerCuaderno(nb).celdas;
    const sqlNb = celdasNb.filter(c => c.tipo === 'sql').map(c => c.nombre);
    comprobar('al cuaderno: las consultas en orden de dependencias, con su nombre', sqlNb.join() === 'ventas_src,ventas_limpias,por_tienda', JSON.stringify(sqlNb));
    comprobar('y la nota como texto', celdasNb.some(c => c.tipo === 'texto' && c.contenido.includes('El Sur cayó la semana 3')));
    const df = sal.aDataFlow({ ...leido, parametros: { desde: '2026-10-01' }, tarjetas: leido.tarjetas.map(t => (t.id === 'ventas_limpias' ? { ...t, sql: "SELECT * FROM ventas_src WHERE fecha >= '{{desde}}'" } : t)) }, 'por_tienda');
    comprobar('a Data Flow: un paso por tarjeta, que deja su tabla', df.nodes.length === 3 && df.nodes[2].config.query.startsWith('CREATE OR REPLACE TABLE por_tienda AS') && df.edges.length === 2, JSON.stringify(df.nodes.map(n => n.config.query)));
    comprobar('los parámetros pasan a ${x}, con su valor', df.nodes[1].config.query.includes("'${desde}'") && df.variables.desde === '2026-10-01', JSON.stringify(df.variables));
    const deck = sal.planDeDeck(conMarcos, 'Ventas de octubre');
    comprobar('a Report Flow: una lámina por marco', deck.laminas.length === 2 && deck.laminas[0].prose.startsWith('## Tráfico') && deck.laminas[1].prose.includes('**175** — Venta'), JSON.stringify(deck.laminas));
    const conGrafico = { ...conMarcos, tarjetas: conMarcos.tarjetas.map(t => (t.id === 'barras' ? { ...t, marco: 'trafico' } : t)) };
    const deck2 = sal.planDeDeck(conGrafico, 'Ventas de octubre');
    comprobar('un gráfico del marco va con su .amoxvis autónomo', deck2.graficos.length === 1 && deck2.laminas[0].layout === 'chart-full' && JSON.parse(deck2.graficos[0].contenido).query.startsWith('WITH ventas_src AS'), JSON.stringify(deck2.graficos.map(x => x.archivo)));

    console.log('\nel diff legible de un .amoxcanvas');
    const dp = require(path.join(RAIZ, 'server/diffDeProcesos.js'));
    const movido = JSON.parse(texto);
    movido.tarjetas.forEach(t => { t.x += 40; if (t.foto) t.foto.cuando = 'otro'; t.modo = 'codigo'; });
    comprobar('mover tarjetas, la foto o el modo de ver no son cambios', dp.diferenciasDeLienzo(texto, JSON.stringify(movido)).igual === true);
    const v2 = JSON.parse(texto);
    v2.tarjetas.find(t => t.id === 'por_tienda').sql = ['SELECT tienda, avg(importe) AS venta', 'FROM ventas_limpias', 'GROUP BY tienda'];
    v2.tarjetas.push({ id: 'nueva', tipo: 'note', texto: 'hola' });
    v2.tarjetas = v2.tarjetas.filter(t => t.id !== 'futuro');
    v2.etiquetas = {};
    v2.parametros.hasta = '2026-11-30';
    const dl = dp.diferenciasDeLienzo(texto, JSON.stringify(v2));
    comprobar('una tarjeta añadida y una quitada', dl.nodos.anadidos.map(n => n.id).join() === 'nueva' && dl.nodos.quitados.map(n => n.id).join() === 'futuro', JSON.stringify(dl.nodos));
    comprobar('el SQL que cambió', dl.nodos.cambiados.find(n => n.id === 'por_tienda')?.campos.some(c => c.campo === 'sql'), JSON.stringify(dl.nodos.cambiados));
    comprobar('la etiqueta escrita a mano y el parámetro', dl.proceso.some(c => c.campo.startsWith('label ventas_src→ventas_limpias')) && dl.variables.cambiadas[0]?.nombre === 'hasta', JSON.stringify([dl.proceso, dl.variables]));
    comprobar('en líneas que se leen', dp.describir(dl).some(l => l.startsWith('por_tienda · sql:')), dp.describir(dl).join('\n'));

    // ── por el servidor ──
    console.log('\npor el motor');
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const post = (q, b) => fetch(`http://localhost:${port}${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: path.join(P, 'p.duckdb') });
    await post('/api/query', { query: "CREATE TABLE ventas AS SELECT * FROM (VALUES (1,'norte',100,'ok'), (2,'sur',80,'devuelto'), (3,'sur',55,'ok'), (4,'norte',20,'ok')) t(folio, tienda, importe, estado)" });
    const porId = Object.fromEntries(leido.tarjetas.map(t => [t.id, t]));
    let ultimo = null;
    let r;
    for (const id of g.ordenDeRefresco(leido).orden) {
        const t = porId[id];
        const sql = g.sqlDeTarjeta(t);
        const c = componerCelda({ sql, analisis: analizarCelda(sql), nombre: t.id });
        ultimo = await post('/api/cuaderno/celda', { ...c, limit: 100 });
        if (ultimo.error) break;
    }
    const filas = Object.fromEntries((ultimo?.data || []).map(f => [f.tienda, Number(f.venta)]));
    comprobar('las tarjetas dejan sus vistas en orden, y la última lee a las de arriba', !ultimo?.error && filas.norte === 120 && filas.sur === 55, JSON.stringify(ultimo));
    const vistas = await post('/api/query', { query: "SELECT view_name FROM duckdb_views() WHERE temporary AND view_name IN ('ventas_src','ventas_limpias','por_tienda') ORDER BY 1" });
    comprobar('son vistas temporales con el nombre de cada tarjeta', (vistas.data || []).map(v => v.view_name).join() === 'por_tienda,ventas_limpias,ventas_src', JSON.stringify(vistas));
    console.log('\nlo que sale, ejecutado');
    r = await post('/api/query', { query: sal.sqlAutonomo(leido, 'por_tienda') });
    const autoFilas = Object.fromEntries((r.data || []).map(f => [f.tienda, Number(f.venta)]));
    comprobar('el SQL autónomo corre solo, sin las vistas del lienzo', autoFilas.norte === 120 && autoFilas.sur === 55, JSON.stringify(r).slice(0, 300));
    const { ejecutarProceso } = require(path.join(RAIZ, 'server/ejecucion/ejecutarProceso.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const proc = sal.aDataFlow(leido, 'por_tienda');
    proc.config = { base: 'proyecto' };
    proc.nodes.push({ id: 'salida', type: 'export_file', label: 'Salida', position: { x: 1000, y: 120 }, config: { outputPath: 'salida/por_tienda.csv', format: 'csv' } });
    proc.edges.push({ id: 'e_fin', source: proc.nodes[2].id, target: 'salida' });
    const ej = await ejecutarProceso({ dbManager, chainDef: proc, proyecto: P, chainFile: 'rama.sqlchain', origen: 'interfaz' });
    const csv = fs.existsSync(path.join(P, 'salida', 'por_tienda.csv')) ? fs.readFileSync(path.join(P, 'salida', 'por_tienda.csv'), 'utf8') : '';
    comprobar('la rama, como proceso de Data Flow, corre y entrega', ej.status === 'completed' && /norte,120/.test(csv) && /sur,55/.test(csv), JSON.stringify(ej).slice(0, 300) + ' ' + csv);
    // What changed de un .amoxcanvas, frente al último commit.
    try {
        const { execFileSync } = await import('node:child_process');
        const git = (...x) => execFileSync('git', ['-C', P, ...x], { stdio: 'pipe' });
        git('init', '-q'); git('config', 'user.email', 'ana@example.com'); git('config', 'user.name', 'Ana');
        fs.writeFileSync(path.join(P, 'octubre.amoxcanvas'), texto);
        git('add', 'octubre.amoxcanvas'); git('commit', '-q', '-m', 'canvas');
        fs.writeFileSync(path.join(P, 'octubre.amoxcanvas'), JSON.stringify(v2, null, 2));
        const cambios = await fetch(`http://localhost:${port}/api/procesos/cambios?ruta=octubre.amoxcanvas`).then(x => x.json());
        comprobar('What changed de un canvas, frente al último commit', cambios.igual === false && cambios.nodos?.anadidos?.[0]?.id === 'nueva' && cambios.lineas?.length > 0, JSON.stringify(cambios).slice(0, 300));
    } catch (e) { console.log('  (sin git: se salta)', e.message); }
    await baseCentral.cerrar();
} catch (e) {
    fallos++;
    console.error('ERROR', e);
}

console.log(`\n${pasadas} bien, ${fallos} mal`);
process.exit(fallos ? 1 : 0);
