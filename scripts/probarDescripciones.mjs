/**
 * Lo que dice cada tabla y cada columna (5.12, fase 5; I5, Dec-30).
 *
 *     node scripts/probarDescripciones.mjs
 *
 *   - los comentarios del motor (tablas, vistas, columnas), sin la procedencia;
 *   - lo que no tiene comentario, del manifiesto de dbt si la base es la del target;
 *   - el explorador (/api/db/schemas) y el texto que recibe el asistente.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-descripciones-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });

const require = createRequire(import.meta.url);
const { DuckDBInstance } = require(require.resolve('@duckdb/node-api', { paths: [RAIZ] }));
const { formatTableSchemas } = require(path.join(RAIZ, 'server/ai/prompt/schema.js'));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

const P = path.join(TMP, 'tienda');
const esc = (rel, t) => { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
esc('dbt_project.yml', 'name: tienda\nprofile: tienda\n');
esc('profiles.yml', 'tienda:\n  target: prod\n  outputs:\n    prod: { type: duckdb, path: tienda.duckdb }\n');
esc('target/manifest.json', JSON.stringify({
    nodes: {
        'model.tienda.sin_docs': { name: 'sin_docs', resource_type: 'model', schema: 'main', description: 'Del YAML de dbt', columns: { x: { name: 'x', description: 'La x, del YAML' } } },
        'model.tienda.ventas': { name: 'ventas', resource_type: 'model', schema: 'main', description: 'No debe ganar al comentario', columns: { tienda: { name: 'tienda', description: 'La tienda, del YAML' } } },
    },
    sources: {}, macros: {},
}));
{
    const i = await DuckDBInstance.create(path.join(P, 'tienda.duckdb'));
    const c = await i.connect();
    await c.run("CREATE TABLE ventas AS SELECT 1 AS id, 'norte' AS tienda");
    await c.run("COMMENT ON TABLE ventas IS 'Las ventas del mes,\n  limpias'");
    await c.run("COMMENT ON COLUMN ventas.id IS 'El id de la venta'");
    await c.run("CREATE VIEW resumen AS SELECT tienda, count(*) n FROM ventas GROUP BY 1");
    await c.run("COMMENT ON VIEW resumen IS 'Ventas por tienda'");
    await c.run("CREATE TABLE cargada AS SELECT 1 AS a");
    await c.run(`COMMENT ON TABLE cargada IS 'Loaded from x.csv\n{"amoxsql":"procedencia","v":1,"archivos":[]}'`);
    await c.run('CREATE TABLE sin_docs AS SELECT 1 AS x');
    c.closeSync(); i.closeSync();
}

try {
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const descripciones = require(path.join(RAIZ, 'server/descripciones.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const u = (p) => `http://localhost:${port}${p}`;
    const post = (p, b) => fetch(u(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'tienda.duckdb' });

    console.log('\nlos comentarios del motor, y dbt para lo demás');
    const d = await descripciones.deLaBase(dbManager, { raiz: P, attachedPath: dbManager.attachedPath });
    comprobar('una tabla, en una línea', d['main.ventas']?.descripcion === 'Las ventas del mes, limpias', JSON.stringify(d['main.ventas']));
    comprobar('una vista', d['main.resumen']?.descripcion === 'Ventas por tienda');
    comprobar('una columna', d['main.ventas']?.columnas?.id === 'El id de la venta');
    comprobar('la procedencia no es una descripción', !d['main.cargada']?.descripcion);
    comprobar('sin comentario: la del YAML de dbt (sin persist_docs)', d['main.sin_docs']?.descripcion === 'Del YAML de dbt' && d['main.sin_docs'].de === 'dbt' && d['main.sin_docs'].columnas.x === 'La x, del YAML', JSON.stringify(d['main.sin_docs']));
    comprobar('el comentario de la base gana al YAML; lo que la base no dice, del YAML', d['main.ventas'].descripcion === 'Las ventas del mes, limpias' && d['main.ventas'].columnas.tienda === 'La tienda, del YAML');
    const sinTarget = await descripciones.deLaBase(dbManager, { raiz: P, attachedPath: path.join(P, 'otra.duckdb') });
    comprobar('si la base adjunta no es la del target, dbt no cuenta', !sinTarget['main.sin_docs']);

    console.log('\nel explorador');
    const esquemas = await fetch(u('/api/db/schemas')).then(r => r.json());
    const tablas = Object.fromEntries(esquemas.flatMap(s => s.tables).map(t => [t.name, t]));
    comprobar('/api/db/schemas: la descripción de la tabla y de qué viene', tablas.ventas?.descripcion === 'Las ventas del mes, limpias' && tablas.sin_docs?.descripcionDe === 'dbt', JSON.stringify(tablas.ventas).slice(0, 200));
    comprobar('  y la de sus columnas', tablas.ventas.columns.find(c => c.column_name === 'id')?.descripcion === 'El id de la venta');
    comprobar('  la procedencia sigue en su sitio', !!tablas.cargada?.procedencia && !tablas.cargada.descripcion, JSON.stringify(tablas.cargada));

    console.log('\nel asistente');
    const texto = formatTableSchemas([{ name: 'ventas', rows: 1, descripcion: 'Las ventas del mes', columns: [{ name: 'id', type: 'INTEGER', descripcion: 'El id' }, { name: 'tienda', type: 'VARCHAR' }] }]);
    comprobar('el prompt lleva la descripción de la tabla y de cada columna', texto === 'TABLE "ventas" — 1 rows\n  -- Las ventas del mes\n  id INTEGER -- El id\n  tienda VARCHAR', JSON.stringify(texto));
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
