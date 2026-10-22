/**
 * El paquete de un proyecto (5.14, fase 2; G2 + G3, Dec-47 y Dec-48).
 *
 *     node scripts/probarPaquete.mjs
 *
 * Por el servidor, con un home temporal:
 *   - qué viaja siempre (procesos, consultas, cuadernos, contexto, fuentes, snippets,
 *     project.json sin su id) y qué se elige (bases, datos), con la plantilla de
 *     Excel de un nodo marcada de serie;
 *   - lo que NUNCA viaja: un .env con un secreto, .git, la carpeta de trabajo;
 *   - «Save as template» lleva sólo la plantilla; con datos elegidos, también ellos;
 *   - empezar desde un paquete: carpeta nueva, id nuevo al abrirlo, y lo que falta
 *     (la credencial por su nombre, la fuente sin su archivo);
 *   - no se extrae en una carpeta con cosas ni fuera de la carpeta (`..`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-paquete-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'cierre');

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 400) : ''}`); }
};
const escribir = (rel, contenido) => { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, contenido); };

// El proyecto, con un poco de todo.
const SECRETO = 'clave-super-secreta-123';
escribir('cierre.sqlchain', JSON.stringify({ name: 'Cierre', nodes: [{ id: 'x', type: 'excel', config: { modo: 'plantilla', plantilla: 'plantillas/cliente.xlsx', outputPath: 'salida/cierre.xlsx' } }], edges: [] }));
escribir('consultas/ventas.sql', 'SELECT * FROM fuentes."ventas";');
escribir('analisis.sqlnb', '---\n---\n<!-- celda: a -->\n```sql\nSELECT 1\n```\n');
escribir('analisis.sqlnb.state.json', '{"a":{}}');
escribir('context/metrics.yml', 'metrics:\n  - name: venta\n    sql: "SUM(x)"\n');
escribir('.amoxsql/project.json', JSON.stringify({ id: 'id-de-esta-carpeta', requiere: { credenciales: [{ nombre: 'banco', tipo: 'postgres' }], extensiones: [], fuentes: ['ventas'] } }));
escribir('.amoxsql/fuentes/ventas.json', JSON.stringify({ nombre: 'ventas', tipo: 'archivo', ubicacion: 'datos/ventas.csv' }));
escribir('.amox/snippets.json', '[{"name":"limpiar"}]');
escribir('.amox/historial.json', '{"mucho":"historial"}');
escribir('datos/ventas.csv', 'tienda,importe\nnorte,1\n');
escribir('plantillas/cliente.xlsx', 'PK-falso-pero-es-la-plantilla');
escribir('salida/cierre.xlsx', 'PK-una-salida');
escribir('tienda.duckdb', 'base');
escribir('.env', `TOKEN=${SECRETO}\n`);
escribir('.git/config', `[remote]\n url = https://x:${SECRETO}@example.com\n`);
escribir('.amoxsql/trabajo/cierre.duckdb', 'trabajo');

try {
    const paquete = require(path.join(RAIZ, 'server/paquete.js'));
    const zip = require(path.join(RAIZ, 'server/zip.js'));
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST');
    await post('/api/project/open', { path: P });

    console.log('\nlo que hay');
    const c = await get('/api/proyecto/paquete');
    const enProyecto = new Set(c.proyecto.map(a => a.rel));
    const dato = (rel) => c.datos.find(d => d.rel === rel);
    comprobar('viaja siempre: procesos, consultas, cuadernos y su estado, contexto, fuentes, snippets, project.json',
        ['cierre.sqlchain', 'consultas/ventas.sql', 'analisis.sqlnb', 'analisis.sqlnb.state.json', 'context/metrics.yml', '.amoxsql/project.json', '.amoxsql/fuentes/ventas.json', '.amox/snippets.json'].every(r => enProyecto.has(r)), [...enProyecto].join(', '));
    comprobar('se eligen, desmarcados: la base y los datos', dato('tienda.duckdb')?.tipo === 'base' && dato('tienda.duckdb').marcado === false && dato('datos/ventas.csv')?.marcado === false && dato('salida/cierre.xlsx')?.marcado === false, JSON.stringify(c.datos));
    comprobar('la plantilla de Excel que usa un nodo, marcada y con su motivo', dato('plantillas/cliente.xlsx')?.marcado === true && /Excel node/.test(dato('plantillas/cliente.xlsx').motivo || ''));
    const todo = [...c.proyecto, ...c.datos].map(a => a.rel);
    comprobar('nunca: .env, .git, la carpeta de trabajo, el resto de .amox', !todo.some(r => /^\.env|^\.git\/|^\.amoxsql\/trabajo|^\.amox\/historial/.test(r)), todo.join(', '));

    console.log('\nexportar');
    const PLANTILLA = path.join(TMP, 'salidas', 'cierre-plantilla.amoxproject');
    let r = await post('/api/proyecto/exportar', { destino: PLANTILLA.replace(/\.amoxproject$/, ''), plantilla: true });
    comprobar('«Save as template»: se escribe (y se le pone la extensión)', r.ruta === PLANTILLA && fs.existsSync(PLANTILLA), JSON.stringify(r).slice(0, 200));
    let z = zip.abrir(PLANTILLA);
    let nombres = z.entradas.map(e => e.nombre);
    comprobar('  lleva la plantilla de Excel y ningún otro dato', nombres.includes('plantillas/cliente.xlsx') && !nombres.includes('datos/ventas.csv') && !nombres.includes('tienda.duckdb') && !nombres.includes('salida/cierre.xlsx'), nombres.join(', '));
    const pj = JSON.parse(z.leer('.amoxsql/project.json').toString('utf8'));
    comprobar('  project.json sin el id de esta carpeta, con lo que requiere', !pj.id && pj.requiere?.credenciales?.[0]?.nombre === 'banco', JSON.stringify(pj));
    const todoElZip = fs.readFileSync(PLANTILLA);
    const desinflado = z.entradas.map(e => z.leer(e.nombre).toString('latin1')).join('\n');
    comprobar('  el secreto no está en ninguna parte del paquete', !todoElZip.toString('latin1').includes(SECRETO) && !desinflado.includes(SECRETO));
    z.cerrar();
    const CON = path.join(TMP, 'salidas', 'cierre-con-datos.amoxproject');
    r = await post('/api/proyecto/exportar', { destino: CON, incluir: ['datos/ventas.csv', 'plantillas/cliente.xlsx'] });
    z = zip.abrir(CON);
    nombres = z.entradas.map(e => e.nombre);
    comprobar('con datos elegidos: van ésos y no los demás', nombres.includes('datos/ventas.csv') && !nombres.includes('tienda.duckdb') && r.datos.length === 2, nombres.join(', '));
    z.cerrar();

    console.log('\nempezar desde el paquete');
    let h = await post('/api/paquete/leer', { ruta: PLANTILLA });
    comprobar('se lee lo que trae sin extraerlo', h.manifiesto?.formato === 'amoxproject' && h.manifiesto.plantilla === true && h.entradas.some(e => e.nombre === 'cierre.sqlchain'), JSON.stringify(h.manifiesto).slice(0, 200));
    const NUEVO = path.join(TMP, 'cierre-noviembre');
    h = await post('/api/proyecto/desde-paquete', { paquete: PLANTILLA, carpeta: NUEVO });
    comprobar('se crea el proyecto en la carpeta nueva', h.raiz === NUEVO && fs.existsSync(path.join(NUEVO, 'cierre.sqlchain')) && fs.existsSync(path.join(NUEVO, 'plantillas', 'cliente.xlsx')), JSON.stringify(h).slice(0, 300));
    comprobar('  lo que le falta: la credencial (por su nombre) y la fuente sin su archivo', h.faltan?.credenciales?.some(x => x.nombre === 'banco') && h.faltan?.fuentes?.some(x => x.nombre === 'ventas'), JSON.stringify(h.faltan));
    await post('/api/project/open', { path: NUEVO });
    await new Promise(res => setTimeout(res, 800));
    const filas = await baseCentral.query('SELECT id, ruta FROM proyectos');
    const nuevo = filas.find(f => path.resolve(f.ruta).toLowerCase() === path.resolve(NUEVO).toLowerCase());
    comprobar('  al abrirlo, tiene un id propio (no el del original)', nuevo && nuevo.id !== 'id-de-esta-carpeta', JSON.stringify(filas));
    h = await post('/api/proyecto/desde-paquete', { paquete: PLANTILLA, carpeta: NUEVO });
    comprobar('no se extrae en una carpeta con cosas', h.status === 400 && /not empty/.test(h.error || ''), JSON.stringify(h));

    console.log('\npaquetes malos');
    const MALO = path.join(TMP, 'malo.amoxproject');
    const w = new zip.EscritorZip(MALO);
    w.agregar('amoxproject.json', JSON.stringify({ formato: 'amoxproject', version: 1 }));
    w.agregar('../fuera.txt', 'escapado');
    w.cerrar();
    h = await post('/api/proyecto/desde-paquete', { paquete: MALO, carpeta: path.join(TMP, 'victima') });
    comprobar('una entrada con «..» se rechaza y nada se escribe fuera', h.status === 400 && /outside the project/.test(h.error || '') && !fs.existsSync(path.join(TMP, 'fuera.txt')), JSON.stringify(h));
    h = await post('/api/paquete/leer', { ruta: path.join(P, 'consultas', 'ventas.sql') });
    comprobar('un archivo que no es un paquete lo dice', h.status === 400 && /not a project package/.test(h.error || ''), JSON.stringify(h));
    comprobar('la función pura: el paquete no se lleva su propia salida', !paquete.recorrer(P).some(a => /\.amoxtmp$/.test(a.rel)));

    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
