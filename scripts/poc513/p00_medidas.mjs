/**
 * Fase 0.1 de la 5.13 (Dec-41): las medidas de `metrics.yml` como macros.
 *
 *     node scripts/poc513/p00_medidas.mjs
 *
 * Una macro sin parámetros no ve las columnas de quien la llama; con las columnas
 * como parámetros, sí. Aquí: sacar las columnas de la expresión de cada medida
 * (sin palabras del motor, tipos, funciones ni cadenas), crearla como macro
 * TEMPORAL y usarla agrupada y sin agrupar. Con las medidas del ejemplo de
 * `templates/` y unas cuantas «reales» (FILTER, CASE, cociente, comillas).
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
const { parseMetrics: parseMetricsYaml } = (() => { try { return require(path.join(RAIZ, 'server/ai/contextLoader.js')); } catch { return {}; } })();
const anota = (t, ok, d = '') => console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${String(d).slice(0, 300)}` : ''}`);
const dato = (t, d) => console.log(`··  ${t}: ${d}`);

const inst = await crearInstancia(':memory:');
const con = await inst.connect();
const q = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson();
const intenta = async (sql) => { try { return { filas: await q(sql) }; } catch (e) { return { error: e.message.split('\n')[0] }; } };

// Lo que no es una columna, según el motor.
const reservadas = new Set((await q(`SELECT lower(keyword_name) AS k FROM duckdb_keywords()`)).map(r => r.k));
const tipos = new Set((await q(`SELECT DISTINCT lower(type_name) AS t FROM duckdb_types()`)).map(r => r.t));
dato('palabras del motor', reservadas.size);
dato('nombres de tipo', tipos.size);

/** Las columnas de una expresión de medida, en orden de aparición. */
function columnasDe(sql) {
    const sinCadenas = String(sql)
        .replace(/--[^\n]*/g, ' ')
        .replace(/'(?:[^']|'')*'/g, ' ');
    const out = [];
    const re = /"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$]*)(\s*\()?/g;
    let m, previo = '';
    while ((m = re.exec(sinCadenas))) {
        const antes = sinCadenas.slice(Math.max(0, m.index - 2), m.index);
        if (m[1] !== undefined) {
            out.push(m[1].replace(/""/g, '"'));
        } else {
            const id = m[2];
            const esFuncion = !!m[3];
            const trasCast = /::\s*$/.test(sinCadenas.slice(0, m.index)) || /^as$/i.test(previo);
            const calificado = /\.$/.test(antes);
            if (!esFuncion && !trasCast && !reservadas.has(id.toLowerCase()) && !(tipos.has(id.toLowerCase()) && trasCast)) {
                if (!calificado || true) out.push(id);
            }
            previo = id;
            continue;
        }
        previo = '';
    }
    return [...new Set(out)];
}

const ejemplo = fs.readFileSync(path.join(RAIZ, 'templates/.amoxsql/context/metrics.yml'), 'utf8');
let delEjemplo = [];
if (parseMetricsYaml) delEjemplo = parseMetricsYaml(ejemplo);
else {
    // Lectura mínima, por si el cargador no exporta su parser.
    const bloques = ejemplo.split(/\n\s*- name:\s*/).slice(1);
    delEjemplo = bloques.map(b => ({ name: b.split('\n')[0].trim(), sql: (/sql:\s*"(.*)"/.exec(b) || [])[1] }));
}
dato('medidas del ejemplo', delEjemplo.map(m => m.name).join(', '));

const reales = [
    { name: 'venta_neta', sql: "SUM(importe) FILTER (WHERE estado = 'pagado') - SUM(descuento)" },
    { name: 'ticket_medio', sql: 'SUM(importe) / NULLIF(COUNT(DISTINCT folio), 0)' },
    { name: 'tasa_devolucion', sql: "COUNT(*) FILTER (WHERE estado = 'devuelto')::DOUBLE / COUNT(*)" },
    { name: 'clientes_nuevos', sql: "COUNT(DISTINCT CASE WHEN fecha_alta >= date_trunc('month', fecha) THEN cliente END)" },
    { name: 'importe_con_espacio', sql: 'SUM("Importe neto")' },
    { name: 'margen', sql: 'SUM(importe - costo) / SUM(importe)' },
];

await q(`CREATE TABLE ventas AS SELECT * FROM (VALUES
    (1, 'norte', 100.0, 'pagado', 5.0, 60.0, DATE '2026-10-01', DATE '2026-10-03', 'c1', 100.0),
    (2, 'norte', 50.0, 'devuelto', 0.0, 30.0, DATE '2026-09-01', DATE '2026-10-04', 'c2', 50.0),
    (3, 'sur', 80.0, 'pagado', 0.0, 40.0, DATE '2026-10-02', DATE '2026-10-05', 'c3', 80.0)
) t(folio, tienda, importe, estado, descuento, costo, fecha_alta, fecha, cliente, "Importe neto")`);
// Las del ejemplo, sobre su tabla con sus columnas.
await q(`CREATE TABLE orders AS SELECT * FROM (VALUES (10.0, 'paid', 'u1', 'n'), (5.0, 'refund', 'u2', 'n')) t(amount, status, user_id, store)`);
await q(`CREATE TABLE events AS SELECT * FROM (VALUES ('u1', DATE '2026-10-01')) t(user_id, day)`);
await q(`CREATE TABLE subscriptions AS SELECT * FROM (VALUES ('u1', NULL::DATE), ('u2', DATE '2026-10-01')) t(user_id, churned_at)`);

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
let bien = 0, total = 0;
for (const [grupo, medidas, tabla] of [['ejemplo', delEjemplo, null], ['reales', reales, 'ventas']]) {
    for (const m of medidas) {
        total++;
        const cols = columnasDe(m.sql);
        const t = tabla || m.table || 'orders';
        const crear = `CREATE OR REPLACE TEMP MACRO ${ident(m.name)}(${cols.map(ident).join(', ')}) AS ${m.sql}`;
        const c = await intenta(crear);
        if (c.error) { anota(`${grupo} · ${m.name}: crear`, false, `${cols.join(', ')} → ${c.error}`); continue; }
        const llamada = `${ident(m.name)}(${cols.map(ident).join(', ')})`;
        const sola = await intenta(`SELECT ${llamada} AS v FROM ${t}`);
        const directa = await intenta(`SELECT ${m.sql} AS v FROM ${t}`);
        const igual = !sola.error && !directa.error && JSON.stringify(sola.filas) === JSON.stringify(directa.filas);
        const agrupada = t === 'ventas' ? await intenta(`SELECT tienda, ${llamada} AS v FROM ventas GROUP BY ALL ORDER BY 1`) : { filas: [] };
        const ok = igual && !agrupada.error;
        if (ok) bien++;
        anota(`${grupo} · ${m.name}(${cols.join(', ')})`, ok, sola.error || agrupada.error || `${JSON.stringify(sola.filas)}${agrupada.filas?.length ? ' · ' + JSON.stringify(agrupada.filas) : ''}`);
    }
}

console.log('\nlos bordes');
let r = await intenta(`ATTACH ':memory:' AS otra; SELECT venta_neta(importe, estado, descuento) AS v FROM ventas`);
anota('se usan con otra base adjunta (son de la sesión, no de una base)', !r.error, r.error || JSON.stringify(r.filas));
r = await intenta(`SELECT function_name, macro_definition FROM duckdb_functions() WHERE function_name = 'venta_neta'`);
anota('las macros temporales se listan (para el completado)', r.filas?.length === 1, JSON.stringify(r.filas));
r = await intenta(`CREATE OR REPLACE TEMP MACRO rota(a) AS SUM(a) FILTER (WHERE`);
anota('una medida que no compila falla al crearla, no al usarla', !!r.error, r.error);
// La regla: un nombre que ya es una función (del motor o de una extensión) no se crea.
const yaEs = async (n) => (await q(`SELECT count(*)::INT AS n FROM duckdb_functions() WHERE lower(function_name) = lower('${n.replace(/'/g, "''")}') AND NOT (function_type = 'macro' AND database_name = 'temp')`))[0].n > 0;
anota('«sum», «count», «avg» se reconocen como del motor', (await yaEs('sum')) && (await yaEs('count')) && (await yaEs('avg')));
anota('«venta_neta» (ya creada como medida) no cuenta como del motor', !(await yaEs('venta_neta')));
r = await intenta(`CREATE OR REPLACE TEMP MACRO sum(x) AS 1`);
const tras = await intenta(`SELECT sum(importe) AS v FROM ventas`);
anota('POR QUÉ: una medida llamada «sum» tapa a sum() en toda la sesión', !r.error && JSON.stringify(tras.filas) !== '[{"v":"230.0"}]', `sum(importe) devuelve ${JSON.stringify(tras.filas)}`);
r = await intenta(`DROP MACRO temp.main.sum`);
const vuelta = await intenta(`SELECT sum(importe) AS v FROM ventas`);
anota('  y quitarla devuelve la del motor', !r.error && JSON.stringify(vuelta.filas) === '[{"v":"230.0"}]', r.error || JSON.stringify(vuelta.filas));

console.log(`\n${bien} de ${total} medidas como macros, iguales a su expresión`);
process.exit(0);
