/**
 * Fase 0 de la 5.12 (plan_5_12_dbt_y_ducklake.md): lo que dbt y dbt-duckdb hacen de
 * verdad, con un proyecto pequeño en una carpeta temporal.
 *
 *     node scripts/poc512/p00_dbt.mjs --dbt <carpeta con dbt.exe>
 *
 * 0.1 compile: cuánto tarda; compiled_code en el manifiesto; el compilado corre en el motor
 * 0.2 run_results.json y store_failures
 * 0.3 persist_docs: comentarios en tablas, vistas y columnas
 * 0.4 external_location con env_var; source freshness sobre un archivo
 * 0.6 dbt por lista de argumentos, sin shell; cancelar
 * 0.7 snapshot en YAML
 * 0.8 macros en el manifiesto (propias y de dbt_utils), y su peso
 * Necesita red la primera vez (dbt deps baja dbt_utils).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const i = process.argv.indexOf('--dbt');
if (i < 0) { console.error('Falta --dbt <carpeta con dbt.exe>'); process.exit(2); }
const DBT = path.join(path.resolve(process.argv[i + 1]), process.platform === 'win32' ? 'dbt.exe' : 'dbt');
const require = createRequire(import.meta.url);
const { DuckDBInstance } = require(require.resolve('@duckdb/node-api', { paths: [RAIZ] }));

const P = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-poc512-'));
const escribir = (rel, texto) => { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, texto); };
const anota = (t, ok, d = '') => console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${d}` : ''}`);
const dato = (t, d) => console.log(`··  ${t}: ${d}`);

const ARCHIVO = path.join(P, 'datos', 'ventas_externas.csv');
const ENV = { ...process.env, AMOXSQL_FUENTE_VENTAS_EXTERNAS: ARCHIVO.replace(/\\/g, '/'), DBT_SEND_ANONYMOUS_USAGE_STATS: 'false' };

function dbt(args, { timeoutMs = 600000 } = {}) {
    const t = Date.now();
    return new Promise((resolve) => {
        execFile(DBT, [...args, '--profiles-dir', '.'], { cwd: P, env: ENV, windowsHide: true, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
            resolve({ codigo: err ? (err.code ?? 1) : 0, salida: `${stdout}${stderr}`, ms: Date.now() - t });
        });
    });
}
async function consultar(sql, base = path.join(P, 'poc.duckdb')) {
    const inst = await DuckDBInstance.create(':memory:');
    const con = await inst.connect();
    try {
        await con.run(`ATTACH '${base.replace(/\\/g, '/')}' AS poc (READ_ONLY)`);
        return await (await con.run(sql)).getRowObjectsJson();
    } finally { con.closeSync(); inst.closeSync(); }
}

// ── El proyecto ─────────────────────────────────────────────────────────────
escribir('dbt_project.yml', `name: amox_poc
version: '1.0.0'
profile: amox_poc
model-paths: ['models']
seed-paths: ['seeds']
macro-paths: ['macros']
snapshot-paths: ['snapshots']
models:
  amox_poc:
    +persist_docs: { relation: true, columns: true }
    staging: { +materialized: view }
    marts: { +materialized: table }
data_tests:
  +store_failures: true
vars:
  tienda_principal: norte
`);
escribir('profiles.yml', `amox_poc:
  target: prod
  outputs:
    prod:
      type: duckdb
      path: poc.duckdb
      threads: 2
`);
escribir('packages.yml', `packages:\n  - package: dbt-labs/dbt_utils\n    version: [">=1.0.0", "<2.0.0"]\n`);
escribir('seeds/ventas.csv', 'id,tienda,importe,fecha\n1,norte,120.5,2026-10-01\n2,sur,80,2026-10-01\n3,norte,30,2026-10-02\n4,este,7,2026-10-02\n');
escribir('datos/ventas_externas.csv', 'tienda,importe\nnorte,10\noeste,25\n');
escribir('macros/redondear.sql', `{% macro redondear(columna, decimales=2) %}\n    round({{ columna }}, {{ decimales }})\n{% endmacro %}\n`);
escribir('macros/schema.yml', `macros:\n  - name: redondear\n    description: Redondea una columna\n    arguments:\n      - name: columna\n        type: column\n        description: La columna\n      - name: decimales\n        type: integer\n        description: Cuántos decimales\n`);
escribir('models/staging/stg_ventas.sql', `select id, tienda, {{ redondear('importe') }} as importe, fecha::date as fecha\nfrom {{ ref('ventas') }}\n`);
escribir('models/staging/stg_externas.sql', `select * from {{ source('amoxsql', 'ventas_externas') }}\n`);
escribir('models/marts/fct_ventas_tienda.sql', `select tienda, sum(importe) as total, count(*) as ventas\nfrom {{ ref('stg_ventas') }}\ngroup by tienda\n`);
escribir('models/sources/amoxsql.yml', `sources:
  - name: amoxsql
    tables:
      - name: ventas_externas
        config:
          external_location: "{{ env_var('AMOXSQL_FUENTE_VENTAS_EXTERNAS') }}"
          loaded_at_query: "select last_modified from read_blob('{{ env_var('AMOXSQL_FUENTE_VENTAS_EXTERNAS') }}')"
          freshness:
            warn_after: { count: 7, period: day }
`);
escribir('models/staging/schema.yml', `models:
  - name: stg_ventas
    description: Las ventas, limpias
    columns:
      - name: id
        description: El identificador de la venta
        data_tests: [unique, not_null]
      - name: tienda
        description: La tienda que vendió
        data_tests:
          - accepted_values:
              arguments:
                values: ['norte', 'sur']
              config:
                severity: warn
  - name: fct_ventas_tienda
    description: Total por tienda
    columns:
      - name: total
        description: La suma de importes
`);
escribir('snapshots/ventas_snap.yml', `snapshots:
  - name: ventas_snap
    relation: ref('stg_ventas')
    config:
      unique_key: id
      strategy: check
      check_cols: all
`);

console.log(`Proyecto en ${P}\n`);
try {
    // 0.6 · sin shell (execFile con la lista); deps
    let r = await dbt(['deps']);
    anota('0.6 dbt por lista de argumentos, sin shell (deps)', r.codigo === 0, `${r.ms} ms${r.codigo ? ' · ' + r.salida.slice(-300) : ''}`);

    // 0.7 + 0.2 · build: semilla, modelos, tests (uno falla: accepted_values), snapshot
    r = await dbt(['build']);
    dato('build', `código ${r.codigo}, ${r.ms} ms`);
    const rr = JSON.parse(fs.readFileSync(path.join(P, 'target', 'run_results.json'), 'utf8'));
    const por = (id) => rr.results.find(x => x.unique_id.includes(id));
    anota('0.2 run_results: estado y duración por nodo', rr.results.every(x => x.status && typeof x.execution_time === 'number'), rr.results.map(x => `${x.unique_id.split('.').slice(-1)}=${x.status}`).join(', '));
    dato('0.2 filas por nodo (adapter_response)', JSON.stringify(por('fct_ventas_tienda')?.adapter_response));
    const fallido = rr.results.find(x => x.unique_id.startsWith('test.') && (x.status === 'fail' || x.status === 'warn'));
    dato('código de salida de build con un test en warn', r.codigo);
    anota('0.2 un test que falla se ve con su nodo y su número de fallos', !!fallido && fallido.failures >= 1, fallido ? `${fallido.unique_id} · failures=${fallido.failures}` : 'ninguno');
    anota('0.7 snapshot en YAML (dbt ≥ 1.9)', por('ventas_snap')?.status === 'success', por('ventas_snap')?.status);
    let audit = [];
    try { audit = await consultar(`SELECT table_schema, table_name FROM information_schema.tables WHERE table_catalog = 'poc' AND table_schema LIKE '%dbt_test__audit%'`); } catch (e) { dato('audit', e.message); }
    anota('0.2 store_failures deja tablas en dbt_test__audit', audit.length > 0, audit.map(a => `${a.table_schema}.${a.table_name}`).join(', '));

    // 0.3 · persist_docs
    const tablas = await consultar(`SELECT table_name, comment FROM duckdb_tables() WHERE database_name = 'poc'`);
    const vistas = await consultar(`SELECT view_name, comment FROM duckdb_views() WHERE database_name = 'poc'`);
    const columnas = await consultar(`SELECT table_name, column_name, comment FROM duckdb_columns() WHERE database_name = 'poc' AND comment IS NOT NULL`);
    anota('0.3 persist_docs en una TABLA (fct_ventas_tienda)', tablas.some(t => t.table_name === 'fct_ventas_tienda' && t.comment === 'Total por tienda'), JSON.stringify(tablas.filter(t => t.comment)));
    anota('0.3 persist_docs en una VISTA (stg_ventas)', vistas.some(v => v.view_name === 'stg_ventas' && v.comment === 'Las ventas, limpias'), JSON.stringify(vistas.filter(v => v.comment)));
    anota('0.3 persist_docs en COLUMNAS', columnas.length >= 2, JSON.stringify(columnas));

    // 0.4 · external_location con env_var
    anota('0.4 external_location con env_var: el modelo lee el archivo', por('stg_externas')?.status === 'success', por('stg_externas')?.message);
    r = await dbt(['source', 'freshness']);
    const sf = fs.existsSync(path.join(P, 'target', 'sources.json')) ? JSON.parse(fs.readFileSync(path.join(P, 'target', 'sources.json'), 'utf8')) : null;
    anota('0.4 source freshness sobre un archivo, con loaded_at_query (la fecha del archivo)', r.codigo === 0 && sf?.results?.[0]?.status && sf.results[0].status !== 'runtime error', sf ? JSON.stringify(sf.results.map(x => ({ estado: x.status, max_loaded_at: x.max_loaded_at, error: x.error || undefined }))) : '');
    dato('salida de freshness', r.salida.split('\n').filter(l => /fresh|source|WARN|ERROR|skip/i.test(l)).slice(-6).join(' | ').replace(/\x1b\[[0-9;]*m/g, ''));

    // 0.1 · compile y el compilado en el motor
    r = await dbt(['compile', '--select', 'stg_ventas']);
    dato('compile de un modelo', `${r.ms} ms (código ${r.codigo})`);
    const manifiesto = JSON.parse(fs.readFileSync(path.join(P, 'target', 'manifest.json'), 'utf8'));
    const nodo = manifiesto.nodes['model.amox_poc.stg_ventas'];
    anota('0.1 compiled_code en el manifiesto', !!nodo?.compiled_code, (nodo?.compiled_code || '').replace(/\s+/g, ' ').slice(0, 160));
    anota('0.1 relation_name', !!nodo?.relation_name, nodo?.relation_name);
    try {
        const filas = await consultar(`SELECT * FROM (${nodo.compiled_code}) LIMIT 3`);
        anota('0.1 el compilado corre tal cual en el motor de AmoxSQL (base adjunta como «poc»)', filas.length === 3, JSON.stringify(filas[0]));
    } catch (e) { anota('0.1 el compilado corre en el motor', false, e.message.split('\n')[0]); }
    r = await dbt(['show', '--select', 'stg_ventas', '--limit', '3', '--output', 'json']);
    dato('dbt show (lo que Preview evita)', `${r.ms} ms (código ${r.codigo})`);

    // 0.8 · macros en el manifiesto
    const macros = Object.values(manifiesto.macros);
    const propia = manifiesto.macros['macro.amox_poc.redondear'];
    const deUtils = macros.filter(m => m.package_name === 'dbt_utils');
    anota('0.8 macro propia: argumentos documentados y su código', propia?.arguments?.length === 2 && /macro redondear\(columna, decimales=2\)/.test(propia.macro_sql), JSON.stringify(propia?.arguments?.map(a => a.name)));
    const conArgs = deUtils.filter(m => m.arguments?.length).length;
    anota('0.8 macros de dbt_utils en el manifiesto', deUtils.length > 20, `${deUtils.length} macros; con argumentos documentados: ${conArgs}; ej. ${deUtils.find(m => m.name === 'star')?.macro_sql?.split('\n')[0]}`);
    dato('peso del manifiesto', `${Math.round(fs.statSync(path.join(P, 'target', 'manifest.json')).size / 1024)} KB · ${macros.length} macros en total (${macros.filter(m => m.package_name === 'dbt').length} de dbt, ${macros.filter(m => m.package_name.startsWith('dbt_duckdb') || m.package_name === 'dbt_duckdb').length} del adaptador)`);
    const cols = manifiesto.nodes['model.amox_poc.stg_ventas']?.columns || {};
    anota('0.8 columnas documentadas por modelo', Object.keys(cols).length === 2, Object.keys(cols).join(', '));

    // 0.6 · cancelar: matar el proceso y que la base quede libre
    const hijo = spawn(DBT, ['build', '--profiles-dir', '.'], { cwd: P, env: ENV, windowsHide: true });
    const salio = new Promise(res => hijo.once('exit', res));
    await new Promise(res => setTimeout(res, 2500));
    const t = Date.now();
    if (process.platform === 'win32') await new Promise(res => execFile('taskkill', ['/PID', String(hijo.pid), '/T', '/F'], () => res()));
    else hijo.kill('SIGTERM');
    await salio;
    let libre = false;
    for (let k = 0; k < 20 && !libre; k++) {
        try { const inst = await DuckDBInstance.create(path.join(P, 'poc.duckdb')); inst.closeSync(); libre = true; } catch { await new Promise(res => setTimeout(res, 250)); }
    }
    anota('0.6 cancelar (árbol de procesos) deja la base libre', libre, `${Date.now() - t} ms`);
} catch (e) {
    anota('inesperado', false, e.stack || e.message);
}
console.log(`\nProyecto: ${P}`);
