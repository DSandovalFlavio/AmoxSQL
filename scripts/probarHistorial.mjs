/**
 * El historial de consultas guarda lo que el usuario ejecutó, como lo escribió
 * (6.0, M1; auditoría F3).
 *
 *     node scripts/probarHistorial.mjs
 *
 * Hasta la 6.0 el historial escuchaba todo lo que pasaba por el motor y descartaba por
 * una lista de prefijos: guardaba la consulta envuelta con el tope de filas
 * (`SELECT * FROM (…) __amox_rows LIMIT 1000001`) y las consultas internas de la app
 * (el completado, el perfil, el catálogo de funciones). Ahora:
 *   - una consulta del editor se guarda una vez, con su texto;
 *   - una celda del cuaderno, con su SQL (no la vista que AmoxSQL compone);
 *   - el plan, el perfil, el describe del completado, lo de fondo y el Assistant, no;
 *   - lo que lleva un secreto, tampoco (como antes).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-historial-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');      // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(P, { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 400) : ''}`); }
};

try {
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://127.0.0.1:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
    const get = pedir('GET'), post = pedir('POST');
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'historial.duckdb' });
    // Lo que deja la preparación no cuenta: se vacía antes de empezar.
    await post('/api/query', { query: 'CREATE TABLE ventas AS SELECT range AS id, range % 3 AS region FROM range(100)' });
    await dbManager.flushQueryHistory();
    await dbManager.systemQuery('DELETE FROM amoxsql_ai.query_history');

    const DEL_EDITOR = '-- mis ventas\nSELECT region, count(*) AS n\nFROM ventas\nGROUP BY region';
    await post('/api/query', { query: DEL_EDITOR, historial: true });
    // Una vista previa o los totales de un gráfico también pasan por /api/query, sin la marca.
    await post('/api/query', { query: 'SELECT * FROM ventas LIMIT 5 -- vista previa' });
    await post('/api/cuaderno/celda', {
        nombre: 'por_region', vista: 'por_region', deja: 'vista',
        preparacion: 'CREATE OR REPLACE TEMP VIEW "por_region" AS (\nSELECT region FROM ventas\n);',
        lector: 'SELECT * FROM "por_region"',
        historial: 'SELECT region FROM ventas',
    });
    // Lo que NO es del usuario:
    await post('/api/db/explain', { query: 'SELECT count(*) FROM ventas', mode: 'analyze' });
    await post('/api/profile', { query: 'SELECT * FROM ventas' });
    await post('/api/db/describe', { sql: 'SELECT id FROM ventas' });
    await post('/api/query', { query: 'SELECT 42 AS de_fondo', deFondo: true });
    await post('/api/query', { query: "CREATE OR REPLACE SECRET s (TYPE s3, KEY_ID 'AKIA', SECRET 'x')" }).catch(() => {});

    const h = await get('/api/db/history');
    const textos = (Array.isArray(h) ? h : []).map(x => x.query);
    console.log(`\n${textos.length} entradas`);
    comprobar('la consulta del editor, una vez y con su texto (comentario incluido)', textos.filter(t => t === DEL_EDITOR).length === 1, JSON.stringify(textos));
    comprobar('la celda del cuaderno, con su SQL', textos.includes('SELECT region FROM ventas'), JSON.stringify(textos));
    comprobar('nada envuelto con el tope de filas', !textos.some(t => /__amox_rows/.test(t)), JSON.stringify(textos));
    comprobar('ni la vista que compone el cuaderno', !textos.some(t => /CREATE OR REPLACE TEMP VIEW "por_region"/.test(t)));
    comprobar('ni el plan, el perfil o el describe', !textos.some(t => /^(EXPLAIN|SUMMARIZE|DESCRIBE)|COUNT\(\*\) as total_rows/i.test(t)), JSON.stringify(textos));
    comprobar('ni lo de fondo', !textos.some(t => /de_fondo/.test(t)));
    comprobar('ni una vista previa de la interfaz', !textos.some(t => /vista previa/.test(t)));
    comprobar('ni lo que lleva un secreto', !textos.some(t => /SECRET/i.test(t)));
    comprobar('en total, sólo las dos', textos.length === 2, JSON.stringify(textos));
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
