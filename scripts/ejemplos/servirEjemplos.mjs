/**
 * Levanta el servidor de AmoxSQL sobre los ejemplos ya creados, sin volver a
 * crearlos: la casa temporal de `crearEjemplos.mjs` y la tienda abierta.
 *
 *     node scripts/ejemplos/servirEjemplos.mjs [--home <carpeta>] [--destino <carpeta>] [--puerto 3911]
 *
 * Con `pnpm client:dev`, la interfaz se mira en http://localhost:5173/?apiPort=3911.
 */
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const arg = (n, def) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : def; };
const DESTINO = arg('--destino', path.join(os.homedir(), 'Desktop', 'Ejemplos AmoxSQL'));
process.env.AMOXSQL_HOME = arg('--home', path.join(os.tmpdir(), 'amox-ejemplos-home'));
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const { port } = await startServer(Number(arg('--puerto', 3911)));
const pedir = (q, b) => fetch(`http://localhost:${port}${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const TIENDA = path.join(DESTINO, 'tienda-electronica');
await pedir('/api/project/open', { path: TIENDA });
await pedir('/api/db/connect', { path: path.join(TIENDA, 'tienda.duckdb') });
console.log(`Ejemplos servidos en ${port} (casa ${process.env.AMOXSQL_HOME})`);
