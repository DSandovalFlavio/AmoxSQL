/**
 * La biblioteca, el cuaderno limpio y mirar otro proyecto (5.14, fase 3; G1, J6, J1).
 *
 *     node scripts/probarBiblioteca.mjs
 *
 * Con un home temporal:
 *   - G1: los snippets del workspace se ven desde todos sus proyectos, viajan en
 *     el .amoxworkspace, y un proyecto suelto no tiene dónde guardarlos;
 *   - J6: la marca `borrador` sobrevive a leer y escribir (con nombre, sin nombre,
 *     en texto, junto a `materializada`), y no sale en Word ni en el tablero;
 *   - J1: los hermanos con base se listan, se adjuntan en sólo lectura con su
 *     nombre, no se mezclan con el árbol propio, y se sueltan.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-biblioteca-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const A = path.join(TMP, 'cierre-norte');
const B = path.join(TMP, 'Ventas Sur');
const C = path.join(TMP, 'sin-base');
const D = path.join(TMP, 'suelto');
for (const d of [A, B, C, D]) fs.mkdirSync(d, { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 400) : ''}`); }
};

try {
    // ── J6: el archivo del cuaderno y la exportación (puros) ──
    console.log('\nJ6 · borradores en el cuaderno');
    const cf = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/cuadernoFile.js')).href);
    const ex = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/cuaderno/exportar.js')).href);
    const doc = {
        meta: { titulo: 'Cierre' },
        celdas: [
            { id: '1', tipo: 'texto', contenido: '# Cierre\n\nLo que se entrega.' },
            { id: '2', tipo: 'sql', nombre: 'ventas', materializada: false, contenido: 'SELECT 1 AS x' },
            { id: '3', tipo: 'sql', nombre: 'prueba', materializada: true, borrador: true, contenido: 'SELECT 2 AS x' },
            { id: '4', tipo: 'sql', nombre: '', materializada: false, borrador: true, contenido: 'SELECT 3 AS x' },
            { id: '5', tipo: 'texto', borrador: true, contenido: 'Notas mías: revisar devoluciones.' },
            { id: '6', tipo: 'texto', contenido: 'La conclusión.' },
        ],
    };
    const texto = cf.escribirCuaderno(doc);
    comprobar('la marca va en la directiva, con materializada', texto.includes('<!-- celda: prueba materializada borrador -->'), texto);
    comprobar('una celda sin nombre en borrador lleva su directiva', texto.includes('<!-- celda borrador -->'), texto);
    comprobar('un texto en borrador lleva la suya, y el siguiente se separa', texto.includes('<!-- texto borrador -->\nNotas') && texto.includes('<!-- texto -->\nLa conclusión.'), texto);
    const leido = cf.leerCuaderno(texto);
    const forma = (c) => `${c.tipo}|${c.nombre || ''}|${!!c.materializada}|${!!c.borrador}|${c.contenido}`;
    comprobar('ida y vuelta: las mismas celdas', leido.celdas.length === 6 && leido.celdas.every((c, i) => forma(c) === forma({ materializada: false, ...doc.celdas[i] })),
        JSON.stringify(leido.celdas.map(forma)));
    comprobar('y el mismo texto al volver a escribir', cf.escribirCuaderno(leido) === texto);
    const viejo = '<!-- celda: a -->\n```sql\nSELECT 1\n```\n\n<!-- celda: b materializada -->\n```sql\nSELECT 2\n```\n';
    comprobar('un cuaderno sin borradores se escribe igual que antes', cf.escribirCuaderno(cf.leerCuaderno(viejo)) === viejo, cf.escribirCuaderno(cf.leerCuaderno(viejo)));
    comprobar('`<!-- celda -->` sola sigue siendo texto', cf.leerCuaderno('Hola\n<!-- celda -->\nadiós').celdas[0]?.tipo === 'texto');
    const paraWord = ex.celdasParaExportar(leido.celdas);
    comprobar('Word: los borradores no salen', paraWord.length === 3 && !paraWord.some(c => /SELECT [23]|Notas/.test(c.content)), JSON.stringify(paraWord));
    comprobar('y se cuentan para avisar', ex.borradores(leido.celdas) === 3);
    const claves = Object.fromEntries(leido.celdas.map(c => [c.id, c.nombre || c.id]));
    const estados = { ventas: { vista: 'chart', grafico: { tipo: 'bar' } }, prueba: { vista: 'chart', grafico: { tipo: 'bar' } } };
    const resultados = Object.fromEntries(leido.celdas.map(c => [c.id, { data: [{ x: 1 }] }]));
    const plan = ex.planDeTablero(leido.celdas, claves, estados, resultados, 'Cierre');
    comprobar('tablero: sólo la figura y la prosa que no son borrador', plan.figuras === 1 && plan.trozos.filter(t => t.clase === 'prosa').length === 2 && !plan.trozos.some(t => /Notas/.test(t.texto || '')), JSON.stringify(plan.trozos.map(t => t.clase)));

    // ── por el servidor ──
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
    const sql = (query) => post('/api/query', { query });

    const w = await post('/api/workspaces', { nombre: 'Cliente Norte' });
    for (const p of [A, B, C]) {
        await post('/api/project/open', { path: p });
        await put('/api/project/workspace', { workspaceId: w.id });
    }
    // B tiene su base, con una tabla.
    await post('/api/project/open', { path: B });
    await post('/api/db/connect', { path: path.join(B, 'datos.duckdb') });
    await sql("CREATE TABLE ventas AS SELECT * FROM (VALUES ('norte', 10), ('sur', 20)) t(zona, importe)");
    await sql('CREATE VIEW ventas_sur AS SELECT * FROM ventas WHERE zona = \'sur\'');

    console.log('\nG1 · los snippets del workspace');
    await post('/api/project/open', { path: A });
    await post('/api/db/connect', { path: path.join(A, 'cierre.duckdb') });
    await sql('CREATE TABLE propia AS SELECT 1 AS x');
    let r = await get('/api/snippets/workspace');
    comprobar('el proyecto ve su workspace, sin snippets aún', r.workspace?.id === w.id && r.workspace?.nombre === 'Cliente Norte' && r.snippets.length === 0, JSON.stringify(r));
    r = await post('/api/snippets/workspace', [{ name: 'Clientes activos', sql: 'SELECT * FROM clientes WHERE activo', description: 'Shared' }, { name: 'roto' }]);
    comprobar('se guardan (y lo que no es un snippet se descarta)', r.ok && r.snippets === 1, JSON.stringify(r));
    await post('/api/project/open', { path: B });
    r = await get('/api/snippets/workspace');
    comprobar('otro proyecto del workspace los ve', r.snippets.length === 1 && r.snippets[0].name === 'Clientes activos', JSON.stringify(r));
    r = await get(`/api/workspaces/${w.id}/exportar`);
    comprobar('viajan en el .amoxworkspace', !!r.contexto?.['snippets.json'] && JSON.parse(r.contexto['snippets.json'])[0].name === 'Clientes activos', JSON.stringify(Object.keys(r.contexto || {})));
    await post('/api/project/open', { path: D });
    r = await get('/api/snippets/workspace');
    comprobar('un proyecto suelto no tiene workspace', r.workspace === null && r.snippets.length === 0, JSON.stringify(r));
    r = await post('/api/snippets/workspace', [{ name: 'x', sql: 'SELECT 1' }]);
    comprobar('ni dónde guardarlos', r.status === 400 && /not in a workspace/.test(r.error), JSON.stringify(r));
    r = await get('/api/proyecto/hermanos');
    comprobar('ni hermanos', r.workspace === null && r.proyectos.length === 0, JSON.stringify(r));

    console.log('\nJ1 · mirar otro proyecto');
    await post('/api/project/open', { path: A });
    await post('/api/db/connect', { path: path.join(A, 'cierre.duckdb') });
    r = await get('/api/proyecto/hermanos');
    const hb = r.proyectos?.find(p => p.nombre === 'Ventas Sur');
    const hc = r.proyectos?.find(p => p.nombre === 'sin-base');
    comprobar('lista los hermanos, no a sí mismo', r.proyectos?.length === 2 && !r.proyectos.some(p => p.nombre === 'cierre-norte'), JSON.stringify(r));
    comprobar('con la base que se adjuntaría y su nombre de consulta', hb?.base === 'datos.duckdb' && hb.alias === 'ventas_sur' && !hb.adjunto, JSON.stringify(hb));
    comprobar('y por qué otro no se puede mirar', hc?.base === null && /no database/.test(hc.motivo), JSON.stringify(hc));
    r = await post('/api/proyecto/hermanos/mirar', { ruta: B });
    comprobar('se adjunta con su nombre y trae sus tablas', r.alias === 'ventas_sur' && r.tablas?.some(t => t.nombre === 'ventas' && t.columnas.length === 2) && r.tablas.some(t => t.nombre === 'ventas_sur' && /VIEW/.test(t.tipo)), JSON.stringify(r));
    r = await sql('SELECT p.x, sum(v.importe) AS total FROM propia p CROSS JOIN "ventas_sur".main.ventas v GROUP BY p.x');
    comprobar('se cruza con la base propia', Number(r.data?.[0]?.total) === 30, JSON.stringify(r));
    r = await sql('SELECT count(*) AS n FROM "ventas_sur".main.ventas_sur');
    comprobar('sus vistas también se leen', Number(r.data?.[0]?.n) === 1, JSON.stringify(r));
    r = await sql('INSERT INTO "ventas_sur".main.ventas VALUES (\'este\', 5)');
    comprobar('y nunca se escribe en ella', !!r.error && /read.only/i.test(r.error), JSON.stringify(r));
    r = await get('/api/db/schemas');
    // (la respuesta es una lista: `pedir` la abre en claves numéricas)
    const nombres = Object.keys(r).filter(k => /^\d+$/.test(k)).map(k => r[k]).flatMap(s => s.tables.map(t => t.name));
    comprobar('el árbol propio no se mezcla con el del hermano', nombres.includes('propia') && !nombres.includes('ventas'), JSON.stringify(nombres));
    r = await get('/api/proyecto/hermanos');
    comprobar('la lista lo da por adjunto', r.proyectos.find(p => p.nombre === 'Ventas Sur')?.adjunto === true);
    r = await post('/api/proyecto/hermanos/mirar', { ruta: D });
    comprobar('una carpeta que no es del workspace no se adjunta', r.status === 400 && /not in this/.test(r.error), JSON.stringify(r));
    r = await post('/api/proyecto/hermanos/mirar', { ruta: C });
    comprobar('uno sin base lo dice', r.status === 400 && /no database/.test(r.error), JSON.stringify(r));
    r = await post('/api/proyecto/hermanos/soltar', { alias: 'ventas_sur' });
    comprobar('se suelta', r.ok === true, JSON.stringify(r));
    r = await sql('SELECT 1 FROM "ventas_sur".main.ventas');
    comprobar('y deja de verse', !!r.error, JSON.stringify(r));
    r = await post('/api/proyecto/hermanos/soltar', { alias: 'cierre' });
    comprobar('sólo se suelta lo que se adjuntó aquí', r.status === 400, JSON.stringify(r));
    await post('/api/proyecto/hermanos/mirar', { ruta: B });
    await post('/api/db/connect', { path: ':memory:' });
    r = await get('/api/proyecto/hermanos');
    comprobar('cambiar de base lo suelta (y la lista lo sabe)', r.proyectos.find(p => p.nombre === 'Ventas Sur')?.adjunto === false, JSON.stringify(r.proyectos));
} catch (e) {
    fallos++;
    console.error('ERROR', e);
}

console.log(`\n${pasadas} bien, ${fallos} mal`);
process.exit(fallos ? 1 : 0);
