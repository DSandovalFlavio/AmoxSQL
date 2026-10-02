/**
 * Prueba de concepto 0.1 de la 5.10 (docs/dev/plan_5_10_datos_donde_estan.md, Dec-10).
 *
 * ¿Un catalogo en memoria, `fuentes`, con una vista por fuente, se consulta como
 * `fuentes."ventas-semanales"` con la base del proyecto adjunta y en uso, en una
 * sesion sin proyecto (contexto aislado, linea de comandos) y aunque el proyecto
 * tenga un esquema que se llame igual?
 *
 *   node scripts/poc510/p01_catalogo_fuentes.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { DuckDBInstance } = require('@duckdb/node-api');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-poc01-'));
const csv = path.join(dir, 'ventas.csv').replace(/\\/g, '/');
fs.writeFileSync(csv, 'tienda,importe\nnorte,10\nsur,20\n');
const proyecto = path.join(dir, 'proyecto.duckdb').replace(/\\/g, '/');

const resultados = [];
const anota = (pregunta, ok, detalle = '') => {
    resultados.push({ pregunta, ok, detalle });
    console.log(`${ok ? 'SI ' : 'NO '} ${pregunta}${detalle ? `  — ${detalle}` : ''}`);
};

async function filas(c, sql) {
    const r = await c.runAndReadAll(sql);
    return r.getRowObjectsJson();
}

async function intenta(c, sql) {
    try { return { ok: true, filas: await filas(c, sql) }; }
    catch (e) { return { ok: false, error: String(e.message || e).split('\n')[0] }; }
}

// --- 1. Sesion del proyecto: base adjunta como user_db y en uso (como DatabaseManager)
{
    const inst = await DuckDBInstance.create(':memory:');
    const c = await inst.connect();
    await c.run(`ATTACH '${proyecto}' AS user_db`);
    await c.run('USE user_db');
    await c.run('CREATE TABLE ventas AS SELECT 1 AS id');

    await c.run(`ATTACH ':memory:' AS fuentes`);
    await c.run(`CREATE OR REPLACE VIEW fuentes.main."ventas-semanales" AS SELECT * FROM read_csv('${csv}')`);

    let r = await intenta(c, `SELECT sum(importe)::INT AS t FROM fuentes."ventas-semanales"`);
    anota('fuentes."x" resuelve con el proyecto en uso', r.ok && r.filas[0].t === 30, r.error);

    r = await intenta(c, `SELECT count(*)::INT AS n FROM ventas`);
    anota('el proyecto sigue resolviendo sin calificar', r.ok && r.filas[0].n === 1, r.error);

    // Una segunda conexion (otro carril) ve el catalogo: ATTACH es de instancia
    const c2 = await inst.connect();
    await c2.run('USE user_db');
    r = await intenta(c2, `SELECT count(*)::INT AS n FROM fuentes."ventas-semanales"`);
    anota('otro carril de la misma instancia ve las fuentes', r.ok && r.filas[0].n === 2, r.error);

    // La vista guarda la ruta, no el dato: cambiar el archivo cambia el resultado
    fs.appendFileSync(csv.replace(/\//g, path.sep), 'este,5\n');
    r = await intenta(c, `SELECT sum(importe)::INT AS t FROM fuentes."ventas-semanales"`);
    anota('la vista lee el archivo cada vez', r.ok && r.filas[0].t === 35, r.error);

    // Nada se escribe en la base del proyecto
    r = await intenta(c, `SELECT count(*)::INT AS n FROM duckdb_views() WHERE database_name = 'user_db' AND NOT internal`);
    anota('la base del proyecto no recibe vistas', r.ok && r.filas[0].n === 0, r.error);

    // Lo que ve el explorador: information_schema lista la vista con su catalogo
    r = await intenta(c, `SELECT table_catalog, table_schema, table_name, table_type FROM information_schema.tables WHERE table_catalog = 'fuentes'`);
    anota('information_schema la lista bajo el catalogo fuentes', r.ok && r.filas.length === 1, JSON.stringify(r.filas || r.error));

    // Un nombre con guion obliga a comillas; sin ellas el parser lo lee como resta
    r = await intenta(c, `SELECT * FROM fuentes.ventas-semanales`);
    anota('sin comillas falla (se documenta: el guion obliga a comillas)', !r.ok, r.error);

    // --- 2. Esquema homonimo dentro del proyecto
    await c.run('CREATE SCHEMA user_db.fuentes');
    await c.run(`CREATE TABLE user_db.fuentes."ventas-semanales" AS SELECT 999 AS importe`);
    r = await intenta(c, `SELECT sum(importe)::INT AS t FROM fuentes."ventas-semanales"`);
    // Resultado: el motor NO elige en silencio; da un error de ambiguedad. Es lo
    // deseable (nunca se lee lo que no es), y AmoxSQL avisa al abrir un proyecto
    // con un esquema "fuentes" (fase 1).
    anota('con un esquema "fuentes" en el proyecto, fuentes."x" da error de ambiguedad (no lee lo que no es)',
        !r.ok && /Ambiguous/.test(r.error), r.ok ? `devuelve ${r.filas[0]?.t}` : r.error);
    r = await intenta(c, `SELECT sum(importe)::INT AS t FROM user_db.fuentes."ventas-semanales"`);
    anota('el esquema del proyecto se alcanza con user_db.fuentes."x"', r.ok && r.filas[0].t === 999, r.error);
    r = await intenta(c, `SELECT sum(importe)::INT AS t FROM fuentes.main."ventas-semanales"`);
    anota('la forma de tres partes fuentes.main."x" no es ambigua', r.ok && r.filas[0].t === 35, r.error);
    await c.run('DROP SCHEMA user_db.fuentes CASCADE');

    // Una vista del PROYECTO que lee de una fuente: se guarda, pero solo resuelve
    // donde exista el catalogo fuentes (documentar en C1)
    await c.run(`CREATE VIEW user_db.main.resumen AS SELECT sum(importe) AS t FROM fuentes."ventas-semanales"`);
    c.closeSync?.(); c2.closeSync?.();
    inst.closeSync?.();
}

// --- 3. Sesion sin proyecto (contexto aislado en memoria / linea de comandos)
{
    const inst = await DuckDBInstance.create(':memory:');
    const c = await inst.connect();
    await c.run(`ATTACH ':memory:' AS fuentes`);
    await c.run(`CREATE VIEW fuentes."ventas-semanales" AS SELECT * FROM read_csv('${csv}')`);
    let r = await intenta(c, `SELECT count(*)::INT AS n FROM fuentes."ventas-semanales"`);
    anota('en una sesion en memoria, sin proyecto', r.ok && r.filas[0].n === 3, r.error);

    // Reabrir el proyecto: la vista del proyecto que lee de fuentes
    await c.run(`ATTACH '${proyecto}' AS user_db`);
    r = await intenta(c, `SELECT t::INT AS t FROM user_db.main.resumen`);
    anota('una vista del proyecto sobre una fuente resuelve si el catalogo existe', r.ok && r.filas[0].t === 35, r.error);
    await c.run('DETACH fuentes');
    r = await intenta(c, `SELECT t FROM user_db.main.resumen`);
    anota('...y falla con un error claro si no existe', !r.ok, r.error);

    // Base de trabajo de Data Flow como base por defecto (contexto "trabajo")
    const trabajo = path.join(dir, 'trabajo.duckdb').replace(/\\/g, '/');
    await c.run(`ATTACH '${trabajo}' AS trabajo`);
    await c.run('USE trabajo');
    await c.run(`ATTACH ':memory:' AS fuentes`);
    await c.run(`CREATE VIEW fuentes."ventas-semanales" AS SELECT * FROM read_csv('${csv}')`);
    r = await intenta(c, `CREATE TABLE paso AS SELECT * FROM fuentes."ventas-semanales"`);
    r = r.ok ? await intenta(c, `SELECT count(*)::INT AS n FROM trabajo.paso`) : r;
    anota('con una base de trabajo en uso, un paso lee de la fuente', r.ok && r.filas[0].n === 3, r.error);
    inst.closeSync?.();
}

// --- 4. Archivo que falta: CREATE VIEW enlaza la consulta y lee el archivo
{
    const inst = await DuckDBInstance.create(':memory:');
    const c = await inst.connect();
    await c.run(`ATTACH ':memory:' AS fuentes`);
    let r = await intenta(c, `CREATE VIEW fuentes."falta" AS SELECT * FROM read_csv('${dir.split(path.sep).join('/')}/no.csv')`);
    anota('crear la vista sobre un archivo que no esta falla al crearla', !r.ok, r.error);
    // Lo que se hace entonces: una vista que explica, con error()
    r = await intenta(c, `CREATE VIEW fuentes."falta" AS SELECT error('La fuente «falta» no tiene ubicación en esta máquina')::VARCHAR AS aviso`);
    r = r.ok ? await intenta(c, `SELECT * FROM fuentes."falta"`) : r;
    anota('una vista con error() se crea y explica al consultarla', !r.ok && /no tiene ubicaci/.test(r.error), r.error);
    // Si el archivo desaparece DESPUES, la vista sigue y la consulta dice que falta
    const b = path.join(dir, 'b.csv');
    fs.writeFileSync(b, 'x,y\n1,2\n');
    await c.run(`CREATE VIEW fuentes."b" AS SELECT * FROM read_csv('${b.split(path.sep).join('/')}')`);
    fs.unlinkSync(b);
    r = await intenta(c, `SELECT * FROM fuentes."b"`);
    anota('si el archivo se va despues, la consulta falla diciendo que no esta', !r.ok && /No files found/.test(r.error), r.error);
    fs.writeFileSync(b, 'x,y,z\n1,2,3\n');
    r = await intenta(c, `SELECT * FROM fuentes."b"`);
    anota('si vuelve con otra columna, la vista la ve sin rehacerla', r.ok && 'z' in r.filas[0], JSON.stringify(r.filas || r.error));
    // La procedencia viaja en la vista, como en los cuadernos
    await c.run(`COMMENT ON VIEW fuentes."b" IS 'Fuente: b'`);
    r = await intenta(c, `SELECT comment FROM duckdb_views() WHERE database_name = 'fuentes' AND view_name = 'b'`);
    anota('COMMENT ON VIEW funciona en el catalogo fuentes', r.ok && r.filas[0].comment === 'Fuente: b', r.error);
    inst.closeSync?.();
}

// --- 5. Coste: crear 200 vistas en el catalogo
{
    const inst = await DuckDBInstance.create(':memory:');
    const c = await inst.connect();
    await c.run(`ATTACH ':memory:' AS fuentes`);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) {
        await c.run(`CREATE OR REPLACE VIEW fuentes."f-${i}" AS SELECT * FROM read_csv('${csv}')`);
    }
    const ms = performance.now() - t0;
    // Casi todo es leer el archivo para conocer sus columnas (una vista trivial
    // cuesta ~0.3 ms): se crean despues de abrir, sin hacer esperar a nadie.
    anota('crear 200 vistas sobre CSV cuesta menos de 2 s', ms < 2000, `${ms.toFixed(0)} ms`);
    inst.closeSync?.();
}

fs.rmSync(dir, { recursive: true, force: true });
const fallos = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} como se esperaba`);
process.exit(fallos ? 1 : 0);
