/**
 * La lista de sesiones de Deep Dive, por HTTP (6.0, M7).
 *
 *     node scripts/probarSesionesDeepDive.mjs
 *
 * `GET /api/ai/sessions` respondía 500: la consulta tomaba `c.*` y agrupaba por una lista
 * de columnas escrita a mano, y la tabla de conversaciones tiene columnas que añadieron
 * migraciones después (`context_objects`…) — «must appear in the GROUP BY clause». Lo
 * encontró la prueba de humo de M7. Aquí: dos sesiones, una con dos artefactos, la lista
 * con sus conteos, la búsqueda, y que una conversación que no es Deep Dive no sale.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-sesiones-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
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
    const { server, port } = await startServer(0);
    const pedir = async (metodo, url, cuerpo) => {
        const r = await fetch(`http://127.0.0.1:${port}${url}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
        return { estado: r.status, datos: await r.json().catch(() => null) };
    };
    await pedir('POST', '/api/project/open', { path: P });
    await pedir('POST', '/api/db/connect', { path: path.join(P, 'sesiones.duckdb') });

    const a = (await pedir('POST', '/api/ai/conversations', { mode: 'diving', title: 'Ventas por región', session_name: 'Ventas' })).datos;
    const b = (await pedir('POST', '/api/ai/conversations', { mode: 'diving', title: 'Clientes que se van' })).datos;
    await pedir('POST', '/api/ai/conversations', { mode: 'chat', title: 'Una charla' });
    // la columna que añadió una migración, con algo dentro
    await pedir('PUT', `/api/ai/conversations/${a.id}/context-objects`, { contextObjects: [{ type: 'table', name: 'ventas' }] });
    await pedir('POST', `/api/ai/sessions/${a.id}/artifacts`, { type: 'chart', name: 'mapa.amoxvis' });
    await pedir('POST', `/api/ai/sessions/${a.id}/artifacts`, { type: 'query', name: 'top.sql' });

    let r = await pedir('GET', '/api/ai/sessions');
    comprobar('la lista responde', r.estado === 200 && Array.isArray(r.datos), JSON.stringify(r));
    const porId = Object.fromEntries((r.datos || []).map(s => [s.id, s]));
    comprobar('  con las dos sesiones de Deep Dive y sin la charla', (r.datos || []).length === 2 && porId[a.id] && porId[b.id], JSON.stringify(r.datos));
    comprobar('  y sus artefactos contados', Number(porId[a.id]?.artifact_count) === 2 && Number(porId[b.id]?.artifact_count) === 0, JSON.stringify(r.datos?.map(s => [s.title, s.artifact_count])));
    r = await pedir('GET', '/api/ai/sessions?search=clientes');
    comprobar('la búsqueda filtra', r.estado === 200 && r.datos.length === 1 && r.datos[0].id === b.id, JSON.stringify(r.datos));
    r = await pedir('GET', '/api/ai/sessions?limit=1');
    comprobar('el límite se respeta', r.estado === 200 && r.datos.length === 1, JSON.stringify(r.datos));

    server.close();
} catch (e) {
    comprobar('la suite corre', false, e.stack || e.message);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
