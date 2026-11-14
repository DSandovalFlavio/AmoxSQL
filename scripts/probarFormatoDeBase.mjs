/**
 * «Upgrade the database format» (6.0, fase 3; O4).
 *
 *     node scripts/probarFormatoDeBase.mjs
 *
 * Una base escrita por DuckDB 1.5.6 (`scripts/fixtures/motor/vistas_con_catalogo_v15.duckdb`)
 * abierta en la 6.0: se dice que es del formato anterior; al actualizarla queda en el
 * formato de DuckDB 2 con todo lo que tenía (tablas, vistas, macros, comentarios,
 * restricciones, secuencias), la original queda al lado como respaldo y la sesión sigue
 * (las vistas temporales sobreviven). Una base ya nueva, en sólo lectura o en memoria no
 * se actualiza, y lo dice.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-formato-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');      // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(P, { recursive: true });
fs.copyFileSync(path.join(RAIZ, 'scripts/fixtures/motor/vistas_con_catalogo_v15.duckdb'), path.join(P, 'tienda.duckdb'));

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 300) : ''}`); }
};

try {
    const lago = require(path.join(RAIZ, 'server/lago.js'));
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST');
    const sql = (query) => post('/api/query', { query });
    await post('/api/project/open', { path: P });

    console.log('\nuna base de la 5.x');
    await post('/api/db/connect', { path: 'tienda.duckdb' });
    let e = await get('/api/db/formato');
    comprobar('se sabe que es del formato anterior', e.aplicable && e.anterior && e.formato < lago.FORMATO_DE_DUCKDB_2 && e.tamano > 0, JSON.stringify(e));
    // Algo que la copia debe llevarse, y una vista temporal que la sesión debe conservar.
    for (const s of [
        'CREATE SEQUENCE sec START 100',
        "CREATE TABLE prod (id INTEGER PRIMARY KEY DEFAULT nextval('sec'), precio DECIMAL(10,2) CHECK (precio > 0))",
        'INSERT INTO prod (precio) SELECT 1 + range FROM range(50000)',
        'DELETE FROM prod WHERE id % 3 = 0',
        'CREATE MACRO doble(x) AS x * 2',
        "COMMENT ON TABLE prod IS 'Productos'",
        'CREATE TEMP VIEW de_la_sesion AS SELECT 7 AS x',
    ]) { const r = await sql(s); if (r.error) comprobar(`preparar: ${s}`, false, r.error); }
    const antes = await sql("SELECT (SELECT count(*) FROM prod) AS n, (SELECT total FROM mart) AS t, doble(21) AS d, (SELECT comment FROM duckdb_tables() WHERE table_name = 'prod') AS c");

    console.log('\nactualizarla');
    const r = await post('/api/db/formato/actualizar', {});
    comprobar('se actualiza', r.status === 200 && r.despues > 0 && /tienda\.before-6\.duckdb$/.test(r.respaldo || ''), JSON.stringify(r));
    comprobar('  el archivo queda en el formato de DuckDB 2', r.formato === lago.FORMATO_DE_DUCKDB_2, JSON.stringify(r));
    comprobar('  y la original, intacta al lado', fs.existsSync(path.join(P, 'tienda.before-6.duckdb')) && lago.formatoDelArchivo(path.join(P, 'tienda.before-6.duckdb')) < lago.FORMATO_DE_DUCKDB_2);
    comprobar('  sin restos del temporal', !fs.readdirSync(P).some(f => f.includes('amoxtmp')), fs.readdirSync(P).join(', '));
    const despues = await sql("SELECT (SELECT count(*) FROM prod) AS n, (SELECT total FROM mart) AS t, doble(21) AS d, (SELECT comment FROM duckdb_tables() WHERE table_name = 'prod') AS c");
    comprobar('todo sigue igual: filas, vistas, macros, comentarios', !despues.error && JSON.stringify(despues.data) === JSON.stringify(antes.data), `${JSON.stringify(antes.data)} → ${JSON.stringify(despues.data)}`);
    let q = await sql("SELECT nextval('sec') AS s");
    comprobar('la secuencia sigue donde iba', Number(q.data?.[0]?.s) === 50100, JSON.stringify(q));
    q = await sql('INSERT INTO prod (precio) VALUES (-1)');
    comprobar('las restricciones siguen (CHECK)', /CHECK|constraint/i.test(q.error || ''), JSON.stringify(q).slice(0, 200));
    q = await sql('SELECT x FROM de_la_sesion');
    comprobar('la sesión sigue: la vista temporal sobrevive', q.data?.[0]?.x === 7, JSON.stringify(q));
    e = await get('/api/db/formato');
    comprobar('ya no se ofrece', e.aplicable && !e.anterior, JSON.stringify(e));
    q = await post('/api/db/formato/actualizar', {});
    comprobar('  y pedirlo otra vez lo dice', q.status === 400 && /already uses the current format/.test(q.error || ''), JSON.stringify(q));

    console.log('\nel selector de base, después (M1, F1)');
    const lista = await fetch(`http://127.0.0.1:${port}/api/project/scan-dbs`).then(r => r.json());
    comprobar('la base de trabajo va primero y el respaldo al final, marcado', lista[0]?.name === 'tienda.duckdb' && lista.at(-1)?.name === 'tienda.before-6.duckdb' && lista.at(-1)?.respaldo === true, JSON.stringify(lista));
    comprobar('un .wal no se ofrece como base', !lista.some(f => /\.wal$/.test(f.name)), JSON.stringify(lista));

    console.log('\nlo que no se actualiza');
    fs.copyFileSync(path.join(RAIZ, 'scripts/fixtures/motor/vistas_con_catalogo_v15.duckdb'), path.join(P, 'otra.duckdb'));
    await post('/api/db/connect', { path: 'otra.duckdb', readOnly: true });
    q = await post('/api/db/formato/actualizar', {});
    comprobar('en sólo lectura: lo dice y no toca nada', q.status === 400 && /read-only/.test(q.error || '') && lago.formatoDelArchivo(path.join(P, 'otra.duckdb')) < lago.FORMATO_DE_DUCKDB_2, JSON.stringify(q));
    await post('/api/db/connect', { path: ':memory:' });
    comprobar('cerrada, la cabecera lo confirma', lago.formatoDelArchivo(path.join(P, 'tienda.duckdb')) === lago.FORMATO_DE_DUCKDB_2);
    e = await get('/api/db/formato');
    comprobar('en memoria: no aplica', e.aplicable === false, JSON.stringify(e));
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
