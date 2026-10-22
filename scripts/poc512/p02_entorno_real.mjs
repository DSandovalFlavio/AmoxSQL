/**
 * «Set up dbt…» de verdad (5.12, Dec-36): crea el entorno de AmoxSQL en un home
 * TEMPORAL, descargando dbt de internet, y corre un proyecto con él.
 *
 *     node scripts/poc512/p02_entorno_real.mjs
 *
 * Necesita un Python admitido (3.10–3.13) y red. Tarda unos minutos.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-entorno-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const require = createRequire(import.meta.url);
const entorno = require(path.join(RAIZ, 'server/dbt/entorno.js'));
const { correr } = require(path.join(RAIZ, 'server/dbt/correr.js'));
const resultados = require(path.join(RAIZ, 'server/dbt/resultados.js'));
const anota = (t, ok, d = '') => console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${d}` : ''}`);

const pythons = await entorno.buscarPythons();
console.log('Pythons:', pythons.map(p => `${p.version}${p.admitida ? '' : ' (no)'} ${p.ruta}`).join(' · '));
const py = pythons.find(p => p.admitida);
if (!py) { anota('hay un Python admitido', false); process.exit(1); }
const t0 = Date.now();
let pasos = 0;
try {
    const r = await entorno.crear({ python: py.ruta, alProgreso: (p) => { pasos++; if (p.paso !== 'pip' || /Successfully installed/.test(p.texto)) console.log(`   [${p.paso}] ${p.texto.slice(0, 160)}`); } });
    anota('el entorno se creó', entorno.estado().existe, `${Math.round((Date.now() - t0) / 1000)} s · ${r.carpeta} · ${JSON.stringify(r.versiones)}`);
} catch (e) { anota('el entorno se creó', false, e.message); process.exit(1); }

const PR = path.join(TMP, 'proyecto');
fs.mkdirSync(path.join(PR, 'models'), { recursive: true });
fs.writeFileSync(path.join(PR, 'dbt_project.yml'), "name: p\nprofile: p\nmodels:\n  p:\n    +materialized: table\n");
fs.writeFileSync(path.join(PR, 'profiles.yml'), "p:\n  target: prod\n  outputs:\n    prod: { type: duckdb, path: p.duckdb }\n");
fs.writeFileSync(path.join(PR, 'models', 'hola.sql'), "select 42 as respuesta\n");
const lineas = [];
const r = await correr({ raiz: PR, args: ['build'], entorno: { tipo: 'amoxsql' }, alLinea: (l) => lineas.push(l.texto) });
const res = resultados.leer(PR, { desde: r.inicio });
anota('dbt build con el entorno de AmoxSQL', r.codigo === 0 && res?.nodos?.[0]?.estado === 'success', `${r.ms} ms · ${lineas.filter(l => /Done\.|ERROR/.test(l)).join(' | ')}`);

// La base que escribió dbt la abre el motor de AmoxSQL (el mismo formato).
const { DuckDBInstance } = require(require.resolve('@duckdb/node-api', { paths: [RAIZ] }));
try {
    const inst = await DuckDBInstance.create(path.join(PR, 'p.duckdb'), { access_mode: 'READ_ONLY' });
    const con = await inst.connect();
    const filas = await (await con.run('SELECT respuesta FROM hola')).getRowObjectsJson();
    con.closeSync(); inst.closeSync();
    anota('AmoxSQL abre la base que escribió dbt', filas[0]?.respuesta === 42, JSON.stringify(filas));
} catch (e) { anota('AmoxSQL abre la base que escribió dbt', false, e.message.split('\n')[0]); }
console.log(`\n${TMP}`);
