/**
 * El esquema del Assistant (`amoxsql_ai`) cuando se abre una base justo al
 * arrancar (6.0.2).
 *
 * El servidor lo crea al arrancar sin esperar, y abrir una base lo vuelve a
 * crear en ella. Las dos inicializaciones sobre la misma conexión se pisaban
 * (con la máquina cargada): una dejaba la transacción abortada y la base
 * abierta se quedaba sin tablas, así que el Assistant fallaba toda la sesión.
 * `persistence.initSchema` las pone en fila. Aquí se lanzan a la vez, como en
 * el arranque, varias veces.
 *
 *   node scripts/probarInicioDelAsistente.mjs   (con AMOXSQL_HOME temporal: pnpm test lo pone)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
if (!process.env.AMOXSQL_HOME) { console.error('Falta AMOXSQL_HOME temporal (pnpm test lo pone).'); process.exit(1); }

const dbManager = require('../server/DatabaseManager');
const persistence = require('../server/ai/persistence');

let bien = 0;
let mal = 0;
function comprobar(titulo, ok, detalle = '') {
    if (ok) { bien++; return; }
    mal++;
    console.error(`FALLA  ${titulo}${detalle ? ` — ${detalle}` : ''}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-inicio-ia-'));
const RONDAS = 8;
for (let i = 0; i < RONDAS; i++) {
    const base = path.join(tmp, `p${i}.duckdb`);
    // Como index.js: la del arranque, sin esperar, mientras se abre la base…
    const arranque = persistence.initSchema(dbManager);
    await dbManager.connect(base, tmp, {});
    // …y con la máquina cargada, la del arranque aún en vuelo cuando llega la de
    // /api/db/connect. Se fuerza el solapamiento lanzando varias a la vez.
    await Promise.all([arranque, persistence.initSchema(dbManager), persistence.initSchema(dbManager), persistence.initSchema(dbManager)]);
    const filas = await dbManager.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_catalog = '${dbManager.alias}' AND table_schema = 'amoxsql_ai' ORDER BY 1`);
    const nombres = (filas || []).map((f) => f.table_name);
    comprobar(`ronda ${i + 1}: la base abierta tiene las tablas del Assistant`,
        ['conversations', 'messages'].every((t) => nombres.includes(t)), JSON.stringify(nombres));
    let creada = null;
    try { creada = await persistence.createConversation(dbManager, { mode: 'assistant', title: 'x' }); } catch (e) { creada = e.message; }
    comprobar(`ronda ${i + 1}: se puede crear una conversación`, !!creada?.id, String(creada).slice(0, 160));
}
await dbManager.close?.();
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows */ }
console.log(`${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
