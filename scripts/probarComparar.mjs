/**
 * Comparar (5.14, fase 4; F3 + J9, Dec-52 y Dec-53).
 *
 *     node scripts/probarComparar.mjs
 *
 * Con un home temporal:
 *   - F3: al reemplazar un archivo (Export File, Excel, Publish) el anterior se
 *     guarda en `.amoxsql/entregas/`, que git ignora; sólo las 5 últimas; una
 *     escritura que falla no deja copia; la ficha la ofrece y la comparación
 *     dice qué filas aparecen, desaparecen o cambian por una clave (y sin ella);
 *     sólo se acepta una copia de verdad.
 *   - J9: el diff de un proceso habla de pasos (añadidos, quitados, cambiados
 *     campo a campo), conexiones, parámetros y variables; mover un nodo no es un
 *     cambio; y el endpoint lo compara con el último commit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-comparar-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'cierre');
fs.mkdirSync(P, { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 500) : ''}`); }
};

try {
    // ── J9: puro ──
    console.log('\nJ9 · qué cambió en un proceso');
    const dp = require(path.join(RAIZ, 'server/diffDeProcesos.js'));
    const v1 = {
        version: '1.0', name: 'Cierre', config: { base: 'memoria' }, variables: { mes: '2026-09' },
        parametros: [{ nombre: 'tienda', tipo: 'lista', opciones: ['norte'] }],
        nodes: [
            { id: 'a', type: 'sql_inline', label: 'Ventas', position: { x: 0, y: 0 }, config: { query: 'SELECT * FROM ventas' } },
            { id: 'f', type: 'filter', label: 'Sólo norte', position: { x: 200, y: 0 }, config: { conditions: [{ column: 'tienda', operator: '=', value: 'norte' }] } },
            { id: 'x', type: 'export_file', label: 'Salida', position: { x: 400, y: 0 }, config: { outputPath: 'salida.csv', format: 'csv' } },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'f' }, { id: 'e2', source: 'f', target: 'x' }],
    };
    const movido = JSON.parse(JSON.stringify(v1));
    movido.nodes.forEach(n => { n.position = { x: n.position.x + 50, y: 99 }; });
    comprobar('mover los nodos no es un cambio', dp.diferencias(v1, movido).igual === true);
    comprobar('el texto también se acepta', dp.diferencias(JSON.stringify(v1), JSON.stringify(movido)).igual === true);

    const v2 = JSON.parse(JSON.stringify(v1));
    v2.nodes[1].config.conditions[0] = { column: 'tienda', operator: 'in', value: "'norte', 'sur'" };
    v2.nodes[1].label = 'Norte y sur';
    v2.nodes.splice(2, 1, { id: 'g', type: 'group_aggregate', label: 'Por tienda', config: { groupBy: ['tienda'] } });
    v2.nodes.push({ id: 'xl', type: 'excel', label: 'Libro', config: { outputPath: 'cierre.xlsx' } });
    v2.edges = [{ id: 'e1', source: 'a', target: 'f' }, { id: 'e3', source: 'f', target: 'g' }, { id: 'e4', source: 'g', target: 'xl' }];
    v2.variables = { mes: '2026-10', zona: 'norte' };
    v2.parametros = [{ nombre: 'tienda', tipo: 'lista', opciones: ['norte', 'sur'] }, { nombre: 'desde', tipo: 'fecha' }];
    v2.config = { base: 'trabajo' };
    const d = dp.diferencias(v1, v2);
    const lineas = dp.describir(d);
    comprobar('pasos añadidos y quitados, con su tipo', d.nodos.anadidos.map(n => n.etiqueta).join() === 'Por tienda,Libro' && d.nodos.quitados[0]?.etiqueta === 'Salida' && d.nodos.quitados[0].tipo === 'Export File', JSON.stringify(d.nodos));
    const filtro = d.nodos.cambiados.find(n => n.id === 'f');
    comprobar('el filtro cambiado, campo a campo y en palabras', filtro?.etiqueta === 'Norte y sur' && filtro.campos.some(c => c.campo === 'name') && filtro.campos.some(c => c.campo === 'conditions 1 · operator' && c.antes === '=' && c.despues === 'in'), JSON.stringify(filtro));
    comprobar('las conexiones, por nombre', d.conexiones.anadidas.some(e => e.de === 'Norte y sur' && e.a === 'Por tienda') && d.conexiones.quitadas.some(e => e.de === 'Sólo norte' && e.a === 'Salida'), JSON.stringify(d.conexiones));
    comprobar('parámetros y variables', d.parametros.anadidos.join() === 'desde' && d.parametros.cambiados[0]?.nombre === 'tienda' && d.variables.cambiadas[0]?.nombre === 'mes' && d.variables.anadidas[0]?.nombre === 'zona', JSON.stringify([d.parametros, d.variables]));
    comprobar('y los ajustes del proceso', d.proceso.some(c => c.campo === 'base' && c.antes === 'memoria' && c.despues === 'trabajo'), JSON.stringify(d.proceso));
    comprobar('en líneas que se leen', lineas.includes('Norte y sur · conditions 1 · operator: `=` → `in`') && lineas.includes('Added step «Libro» (Excel)') && lineas.includes('Variable mes: `2026-09` → `2026-10`'), lineas.join('\n'));
    comprobar('un proceso nuevo es todo añadido', dp.diferencias(null, v1).nodos.anadidos.length === 3);
    let roto = null; try { dp.diferencias('{no', v1); } catch (e) { roto = e.message; }
    comprobar('un archivo roto lo dice', /not a valid process/.test(roto || ''), roto);

    // ── por el servidor ──
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const entregas = require(path.join(RAIZ, 'server/entregas.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST');
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: ':memory:' });

    console.log('\nF3 · la entrega anterior');
    const datos = (filas) => `SELECT * FROM (VALUES ${filas.map(f => `(${f[0]}, '${f[1]}', ${f[2]})`).join(', ')}) t(id, tienda, importe)`;
    const proceso = (filas, salida) => ({
        version: '1.0', name: 'Cierre', config: { base: 'memoria' },
        nodes: [{ id: 'v', type: 'sql_inline', label: 'Ventas', config: { query: datos(filas) } }, { id: 'x', label: 'Salida', ...salida }],
        edges: [{ id: 'e', source: 'v', target: 'x' }],
    });
    const correr = (filas, salida) => post('/api/chains/run', { chainDefinition: proceso(filas, salida), chainFile: 'cierre.sqlchain' });
    const CSV = { type: 'export_file', config: { outputPath: 'salida/ventas.csv', format: 'csv' } };
    const lunes = [[1, 'norte', 10], [2, 'sur', 20], [3, 'este', 30]];
    const martes = [[1, 'norte', 10], [2, 'sur', 25], [4, 'oeste', 40]];

    let r = await correr(lunes, CSV);
    let res = await get(`/api/chains/run/${r.runId}/resumen`);
    comprobar('la primera vez no hay nada que guardar', res.guardados?.[0] && !res.guardados[0].anterior, JSON.stringify(res.guardados));
    r = await correr(martes, CSV);
    res = await get(`/api/chains/run/${r.runId}/resumen`);
    const ant = res.guardados?.[0]?.anterior;
    comprobar('al reemplazarla, la anterior se guarda y la ficha la ofrece', !!ant?.ruta && fs.existsSync(ant.ruta) && ant.ruta.includes(path.join('.amoxsql', 'entregas')), JSON.stringify(res.guardados));
    comprobar('la copia es la de antes', fs.readFileSync(ant.ruta, 'utf8').includes(',este,') && !fs.readFileSync(path.join(P, 'salida', 'ventas.csv'), 'utf8').includes(',este,'));
    comprobar('la carpeta de entregas se ignora sola en git', fs.readFileSync(path.join(P, '.amoxsql', 'entregas', '.gitignore'), 'utf8').trim() === '*');

    r = await get(`/api/entregas?copia=${encodeURIComponent(ant.ruta)}`);
    comprobar('las copias de ese archivo, y una clave sugerida', r.copias?.length === 1 && r.actual?.bytes > 0 && r.clave === 'id', JSON.stringify(r));
    r = await post('/api/entregas/comparar', { copia: ant.ruta, clave: ['id'] });
    comprobar('por la clave: 1 nueva, 1 que ya no está, 1 que cambió', r.aparecen?.n === 1 && r.desaparecen?.n === 1 && r.cambian?.n === 1 && r.filas.actual === 3 && r.filas.anterior === 3, JSON.stringify(r));
    comprobar('y qué columna cambió, con su valor de antes', r.cambian.muestra[0]?.__cambiaron?.join() === 'importe' && String(r.cambian.muestra[0]['importe (before)']) === '20' && String(r.cambian.muestra[0].importe) === '25', JSON.stringify(r.cambian.muestra));
    comprobar('las muestras traen las filas', String(r.aparecen.muestra[0]?.tienda) === 'oeste' && String(r.desaparecen.muestra[0]?.tienda) === 'este', JSON.stringify([r.aparecen, r.desaparecen]));
    r = await post('/api/entregas/comparar', { copia: ant.ruta, clave: [] });
    comprobar('sin clave, filas enteras (y «cambiar» no aplica)', r.aparecen?.n === 2 && r.desaparecen?.n === 2 && r.cambian === null, JSON.stringify(r));
    r = await post('/api/entregas/comparar', { copia: path.join(P, 'salida', 'ventas.csv') });
    comprobar('un archivo cualquiera no pasa por copia', r.status === 400 && /not a saved delivery/.test(r.error), JSON.stringify(r));

    for (let i = 0; i < 6; i++) await correr([[i, 'x', i]], CSV);
    const copias = entregas.listar(P, path.join(P, 'salida', 'ventas.csv'));
    const enDisco = fs.readdirSync(path.dirname(copias[0].ruta)).filter(f => f !== 'indice.json');
    comprobar('sólo las 5 últimas, en el índice y en el disco', copias.length === 5 && enDisco.length === 5, JSON.stringify(enDisco));

    console.log('\nF3 · Excel y Publish');
    const XL = { type: 'excel', config: { outputPath: 'salida/cierre.xlsx' } };
    await correr(lunes, XL);
    r = await correr(martes, XL);
    res = await get(`/api/chains/run/${r.runId}/resumen`);
    const antXl = res.guardados?.[0]?.anterior;
    r = antXl ? await post('/api/entregas/comparar', { copia: antXl.ruta, clave: ['id'] }) : {};
    comprobar('un Excel también, comparado por su primera hoja', !!antXl && r.aparecen?.n === 1 && r.cambian?.n === 1, JSON.stringify(r));
    comprobar('y sus enteros se dicen sin «.0» (y 20 sigue siendo 20)', String(r.cambian?.muestra?.[0]?.id) === '2' && String(r.cambian?.muestra?.[0]?.['importe (before)']) === '20', JSON.stringify(r.cambian?.muestra));

    fs.mkdirSync(path.join(P, 'publicado'), { recursive: true });
    const PUB = (q) => ({ type: 'publicar', config: { fuente: 'ventas-limpias', carpeta: 'publicado', formato: 'parquet', registrarEn: 'proyecto', ...(q ? { query: q } : {}) } });
    await correr(lunes, PUB());
    r = await correr(martes, PUB());
    res = await get(`/api/chains/run/${r.runId}/resumen`);
    const antPub = res.guardados?.[0]?.anterior;
    comprobar('Publish guarda la anterior', !!antPub && fs.existsSync(antPub.ruta), JSON.stringify(res.guardados));
    const antes = entregas.listar(P, path.join(P, 'publicado', 'ventas-limpias.parquet')).length;
    r = await correr(martes, PUB('SELECT id, tienda FROM (VALUES (1, \'a\')) t(id, tienda)'));
    const despues = entregas.listar(P, path.join(P, 'publicado', 'ventas-limpias.parquet')).length;
    comprobar('si el esquema roto la detiene, no queda copia de más', r.status === 'failed' || r.error ? antes === despues : false, JSON.stringify({ r, antes, despues }));
    comprobar('un archivo remoto nunca se guarda', entregas.guardarAnterior(P, 's3://cubo/x.csv') === null);
    comprobar('una carpeta (salida particionada) tampoco', entregas.guardarAnterior(P, path.join(P, 'salida')) === null);

    console.log('\nJ9 · frente al último commit');
    let hayGit = true;
    const git = (...a) => execFileSync('git', ['-C', P, ...a], { stdio: 'pipe' }).toString();
    try {
        git('init', '-q'); git('config', 'user.email', 'ana@example.com'); git('config', 'user.name', 'Ana');
        fs.writeFileSync(path.join(P, 'cierre.sqlchain'), JSON.stringify(v1, null, 2));
        git('add', 'cierre.sqlchain'); git('commit', '-q', '-m', 'primera');
    } catch { hayGit = false; }
    if (hayGit) {
        r = await get('/api/procesos/cambios?ruta=cierre.sqlchain');
        comprobar('sin tocar, nada cambió', r.igual === true && r.nuevo === false, JSON.stringify(r));
        fs.writeFileSync(path.join(P, 'cierre.sqlchain'), JSON.stringify(v2, null, 2));
        r = await get('/api/procesos/cambios?ruta=cierre.sqlchain');
        comprobar('tras cambiar el filtro, lo dice en pasos', r.igual === false && r.lineas?.includes('Norte y sur · conditions 1 · operator: `=` → `in`'), JSON.stringify(r.lineas));
        git('add', 'cierre.sqlchain');
        r = await get('/api/procesos/cambios?ruta=cierre.sqlchain&antes=index&despues=disco');
        comprobar('lo preparado frente al disco: nada', r.igual === true, JSON.stringify(r.lineas));
        r = await get('/api/procesos/cambios?ruta=cierre.sqlchain&antes=HEAD&despues=index');
        comprobar('el commit frente a lo preparado: el cambio', r.igual === false && r.nodos.anadidos.length === 2, JSON.stringify(r.lineas));
        fs.writeFileSync(path.join(P, 'nuevo.sqlchain'), JSON.stringify(v1));
        r = await get('/api/procesos/cambios?ruta=nuevo.sqlchain');
        comprobar('uno sin commit: todo es nuevo', r.nuevo === true && r.nodos.anadidos.length === 3, JSON.stringify(r));
        r = await get(`/api/procesos/cambios?ruta=${encodeURIComponent('../fuera.sqlchain')}`);
        comprobar('fuera del proyecto, no', r.status === 400, JSON.stringify(r));
    } else {
        console.log('  (sin git en esta máquina: se salta)');
    }
} catch (e) {
    fallos++;
    console.error('ERROR', e);
}

console.log(`\n${pasadas} bien, ${fallos} mal`);
process.exit(fallos ? 1 : 0);
