/**
 * Crea la carpeta «Ejemplos AmoxSQL»: proyectos de verdad, con datos reales, que
 * usan todos los tipos de archivo de AmoxSQL. Sirve para enseñar la aplicación y
 * para sacar las capturas de la documentación.
 *
 *     node scripts/ejemplos/crearEjemplos.mjs [--datos <carpeta>] [--destino <carpeta>]
 *                                             [--home <carpeta>] [--servir]
 *
 * - `--datos`: de dónde salen los datos (por defecto, la carpeta del curso de SQL
 *   del autor). Se copian; el original no se toca.
 * - `--destino`: dónde se crea (por defecto, «Ejemplos AmoxSQL» en el escritorio).
 *   Si ya existe y no la creó este script, se detiene sin borrar nada.
 * - `--home`: la casa de AmoxSQL para generar (workspaces, fuentes, programaciones,
 *   ejecuciones). SIEMPRE una temporal: nunca la del usuario.
 * - `--servir`: al terminar deja el servidor escuchando en 3911, para mirar los
 *   ejemplos con `pnpm client:dev` y `?apiPort=3911` (las capturas).
 *
 * Lo que es del proyecto (consultas, cuaderno, gráficos, procesos, Canvas,
 * diagrama, contexto) vive versionado en `scripts/ejemplos/proyectos/`; aquí sólo
 * se copian los datos, se construyen las bases y se registra lo que en la app es
 * de la máquina.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLANTILLA = path.join(RAIZ, 'scripts', 'ejemplos', 'proyectos');
const require = createRequire(import.meta.url);

const arg = (n, def) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : def; };
const DATOS = arg('--datos', 'C:/Users/flavi/Documents/Curso_SQL/Data');
const DESTINO = arg('--destino', path.join(os.homedir(), 'Desktop', 'Ejemplos AmoxSQL'));
const HOME = arg('--home', path.join(os.tmpdir(), 'amox-ejemplos-home'));
const SERVIR = process.argv.includes('--servir');
// El servidor atrapa las excepciones para seguir en pie; aquí un fallo es el final.
process.on('unhandledRejection', (e) => { console.error('Falló:', e?.message || e); process.exit(1); });
const MARCA = '.ejemplos-amoxsql';

// ── La carpeta: sólo se rehace si es nuestra ──────────────────────────────────
if (fs.existsSync(DESTINO)) {
    if (!fs.existsSync(path.join(DESTINO, MARCA))) {
        console.error(`«${DESTINO}» ya existe y no la creó este script: no se toca.`);
        process.exit(1);
    }
    fs.rmSync(DESTINO, { recursive: true, force: true });
}
fs.rmSync(HOME, { recursive: true, force: true });
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

fs.mkdirSync(DESTINO, { recursive: true });
fs.writeFileSync(path.join(DESTINO, MARCA), 'Creada por scripts/ejemplos/crearEjemplos.mjs; se puede borrar entera.\n');
fs.cpSync(PLANTILLA, DESTINO, { recursive: true });

const TIENDA = path.join(DESTINO, 'tienda-electronica');
const MARKETING = path.join(DESTINO, 'marketing-campanas');
const ALMACEN = path.join(DESTINO, 'almacen-dbt');

// ── Los datos ─────────────────────────────────────────────────────────────────
const mensuales = path.join(DATOS, 'Sales Historicos CSVs');
const dirVentas = path.join(TIENDA, 'datos', 'ventas-mensuales');
fs.mkdirSync(dirVentas, { recursive: true });
for (const f of fs.readdirSync(mensuales).filter(f => /^Sales_202[34]_\d+\.csv$/.test(f))) {
    fs.copyFileSync(path.join(mensuales, f), path.join(dirVentas, f));
}
fs.mkdirSync(path.join(MARKETING, 'datos'), { recursive: true });
fs.copyFileSync(path.join(DATOS, 'Octubre_2024_planeado.csv'), path.join(MARKETING, 'datos', 'plan_octubre_2024.csv'));
fs.copyFileSync(path.join(DATOS, 'catalogo_regiones.csv'), path.join(MARKETING, 'datos', 'catalogo_regiones.csv'));
fs.copyFileSync(path.join(DATOS, 'dataset.csv'), path.join(MARKETING, 'datos', 'historico_campanias.csv'));
fs.mkdirSync(ALMACEN, { recursive: true });

// Las metas de Finanzas: un Excel de verdad, con la venta de 2023 más un 12 %
// redondeada a miles, por mes y categoría.
const { DuckDBInstance } = require('@duckdb/node-api');
{
    const db = await DuckDBInstance.create(':memory:');
    const c = await db.connect();
    const lector = `read_csv('${dirVentas.replace(/\\/g, '/')}/Sales_2023_*.csv', union_by_name=true)`;
    const filas = (await c.runAndReadAll(`
        SELECT month("Order Date") AS m, Category AS categoria,
               (round(sum("Quantity Ordered" * "Price Each") * 1.12, -3))::BIGINT AS meta
        FROM ${lector} GROUP BY ALL ORDER BY m, categoria`)).getRowObjectsJson();
    const { libro } = await import(`file:///${path.join(RAIZ, 'scripts/ayudas/libroMinimo.mjs').replace(/\\/g, '/')}`);
    libro(path.join(TIENDA, 'datos', 'metas_2024.xlsx'), ['Mes', 'Categoría', 'Meta'],
        filas.map(f => [new Date(Date.UTC(2024, Number(f.m) - 1, 1)), f.categoria, Number(f.meta)]));
}

// ── El servidor, con la casa temporal ─────────────────────────────────────────
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
const { ejecutarProceso } = require(path.join(RAIZ, 'server/ejecucion/ejecutarProceso.js'));
const { port } = await startServer(3911);
const u = (q) => `http://localhost:${port}${q}`;
async function pedir(q, b, m = 'POST') {
    const r = await fetch(u(q), { method: m, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(`${m} ${q}: ${d.error || r.status}`);
    return d;
}
const sql = (query) => pedir('/api/query', { query });
const leer = (r) => JSON.parse(fs.readFileSync(path.join(TIENDA, r), 'utf8'));

await pedir('/api/preferencias/etiqueta', { clave: 'clients' }, 'PUT');
const idDe = (w) => w.id || w.workspace?.id;
const electronica = idDe(await pedir('/api/workspaces', { nombre: 'Electrónica Global', color: '#3b82f6' }));
const agencia = idDe(await pedir('/api/workspaces', { nombre: 'Agencia Digital MX', color: '#f59e0b' }));

/** Abre un proyecto, lo enlaza a su cliente y le pone estado y entrega. */
async function abrir(ruta, workspaceId, { estado, entrega } = {}) {
    await pedir('/api/project/open', { path: ruta });
    await pedir('/api/proyectos-enlace', { ruta, workspaceId }, 'PUT');
    if (estado || entrega) {
        const { proyectos = [] } = await pedir(`/api/workspaces/${workspaceId}/proyectos`, undefined, 'GET');
        const p = proyectos.find(x => path.resolve(x.ruta) === path.resolve(ruta));
        if (p) await pedir(`/api/proyectos/${encodeURIComponent(p.id)}`, { estado, entrega }, 'PUT');
        else console.warn(`Sin id para ${ruta}: estado y entrega no se pusieron.`);
    }
}

// ── Tienda electrónica: el proyecto principal ─────────────────────────────────
await abrir(TIENDA, electronica, { estado: 'en_curso', entrega: '2024-11-05' });
await pedir('/api/fuentes', { definicion: {
    nombre: 'ventas-mensuales', tipo: 'carpeta', ubicacion: 'datos/ventas-mensuales', patron: 'Sales_*.csv', criterio: 'todos',
    descripcion: 'Un CSV por mes con cada línea de venta; llega el día 5 del mes siguiente.' } });
await pedir('/api/fuentes', { definicion: {
    nombre: 'metas', tipo: 'archivo', ubicacion: 'datos/metas_2024.xlsx', excel: { encabezado: true },
    descripcion: 'Metas de venta por mes y categoría que manda Finanzas.' } });
// El contrato de las ventas: las columnas de hoy, y que no lleguen cantidades vacías.
{
    const { contrato } = await pedir('/api/fuentes/ventas-mensuales/contrato/de-hoy', {});
    await pedir('/api/fuentes', { anterior: 'ventas-mensuales', definicion: {
        nombre: 'ventas-mensuales', tipo: 'carpeta', ubicacion: 'datos/ventas-mensuales', patron: 'Sales_*.csv', criterio: 'todos',
        descripcion: 'Un CSV por mes con cada línea de venta; llega el día 5 del mes siguiente.',
        contrato: { ...contrato, alFallar: 'parar', reglas: [
            { tipo: 'no_nulos', columna: 'Quantity Ordered' }, { tipo: 'rango', columna: 'Price Each', min: 0 }, { tipo: 'filas_minimas', valor: 1000 }] } } });
}
fs.mkdirSync(path.join(TIENDA, 'entregas'), { recursive: true });   // un destino nunca crea su propia carpeta
await pedir('/api/destinos', { definicion: { nombre: 'entregas-direccion', ubicacion: 'entregas', subcarpeta: '{fecha:AAAA}',
    descripcion: 'Donde Dirección busca el cierre de cada mes.' } });

await pedir('/api/db/connect', { path: path.join(TIENDA, 'tienda.duckdb') });
for (const s of [
    'CREATE SCHEMA staging',
    // Lo que llega, tal cual: el explorador dice de qué archivos salió cada tabla.
    'CREATE TABLE staging.ventas_crudas AS SELECT * FROM fuentes."ventas-mensuales"',
    'CREATE TABLE staging.metas_excel AS SELECT * FROM fuentes."metas"',
    `CREATE TABLE categorias (categoria VARCHAR PRIMARY KEY, familia VARCHAR NOT NULL)`,
    `INSERT INTO categorias VALUES ('Portátiles','Cómputo'),('Monitores','Cómputo'),('Teléfonos','Telefonía'),('Cargadores','Accesorios'),
        ('Auriculares','Accesorios'),('Pilas','Accesorios'),('Televisores','Hogar'),('Electrodomésticos','Hogar')`,
    `CREATE TABLE productos (producto VARCHAR PRIMARY KEY, categoria VARCHAR NOT NULL REFERENCES categorias (categoria), precio_lista DECIMAL(10,2))`,
    `INSERT INTO productos SELECT Product, any_value(Category), max("Price Each") FROM staging.ventas_crudas GROUP BY Product`,
    `CREATE TABLE ventas (
        linea BIGINT PRIMARY KEY, fecha DATE NOT NULL, producto VARCHAR NOT NULL REFERENCES productos (producto),
        categoria VARCHAR NOT NULL, cantidad INTEGER NOT NULL, precio_unitario DECIMAL(10,2) NOT NULL, importe DECIMAL(12,2) NOT NULL,
        ciudad VARCHAR, estado VARCHAR, direccion VARCHAR, archivo VARCHAR)`,
    `INSERT INTO ventas SELECT row_number() OVER (ORDER BY "Order Date", Product), "Order Date", Product, Category, "Quantity Ordered",
        "Price Each", round("Quantity Ordered" * "Price Each", 2), trim(split_part("Purchase Address", ',', 2)),
        split_part(trim(split_part("Purchase Address", ',', 3)), ' ', 1), "Purchase Address", regexp_extract(_archivo, '[^\\\\/]+$')
        FROM staging.ventas_crudas`,
    `CREATE TABLE metas_2024 (mes DATE, categoria VARCHAR REFERENCES categorias (categoria), meta BIGINT, PRIMARY KEY (mes, categoria))`,
    `INSERT INTO metas_2024 SELECT "Mes"::DATE, "Categoría", "Meta" FROM staging.metas_excel`,
    `CREATE VIEW v_venta_mensual AS SELECT date_trunc('month', fecha)::DATE AS mes, categoria, sum(importe) AS venta, sum(cantidad) AS unidades FROM ventas GROUP BY ALL`,
    `COMMENT ON TABLE ventas IS 'Cada línea de venta de los archivos mensuales, con el importe calculado y la ciudad separada de la dirección.'`,
    `COMMENT ON TABLE productos IS 'Catálogo de productos con su categoría y el precio de lista más alto visto.'`,
    `COMMENT ON TABLE categorias IS 'Las ocho categorías y su familia.'`,
    `COMMENT ON TABLE metas_2024 IS 'Metas de Finanzas por mes y categoría (datos/metas_2024.xlsx).'`,
    `COMMENT ON VIEW v_venta_mensual IS 'Venta y unidades por mes y categoría.'`,
    `COMMENT ON COLUMN ventas.importe IS 'cantidad × precio_unitario, sin impuestos'`,
    `COMMENT ON COLUMN ventas.archivo IS 'El archivo mensual del que salió la línea'`,
]) await sql(s);

await pedir('/api/snippets', [
    { name: 'Venta por mes', category: 'Ventas', sql: "SELECT date_trunc('month', fecha)::DATE AS mes, sum(importe) AS venta\nFROM ventas\nGROUP BY ALL\nORDER BY mes;", description: 'La serie mensual base' },
    { name: 'Top N productos', category: 'Ventas', sql: 'SELECT producto, sum(importe) AS venta\nFROM ventas\nGROUP BY ALL\nORDER BY venta DESC\nLIMIT 10;', description: 'Cambia el LIMIT' },
]);
await pedir('/api/snippets/workspace', [
    { name: 'Cumplimiento de meta', sql: 'SELECT categoria, round(100 * sum(venta) / sum(meta), 1) AS cumplimiento_pct\nFROM v_venta_mensual JOIN metas_2024 USING (mes, categoria)\nGROUP BY ALL;', description: 'Igual en todos los proyectos de Electrónica Global' },
]);

// Los procesos: corren de verdad, y el cierre queda programado.
const cierre = leer('flujos/cierre_mensual.sqlchain');
const publicar = leer('flujos/publicar_ventas.sqlchain');
await ejecutarProceso({ dbManager, chainDef: publicar, proyecto: TIENDA, chainFile: 'flujos/publicar_ventas.sqlchain', origen: 'interfaz' });
await ejecutarProceso({ dbManager, chainDef: cierre, proyecto: TIENDA, chainFile: 'flujos/cierre_mensual.sqlchain', origen: 'interfaz', variables: { desde: '2024-01-01' } });
await ejecutarProceso({ dbManager, chainDef: cierre, proyecto: TIENDA, chainFile: 'flujos/cierre_mensual.sqlchain', origen: 'programada', variables: { desde: '2024-01-01' } });
await pedir('/api/programaciones', { nombre: 'Cierre mensual', proceso: 'flujos/cierre_mensual.sqlchain', proyecto: TIENDA,
    regla: { tipo: 'mensual', hora: '07:00', modo: 'habil_n', dia: 3 }, avisar: 'siempre' });
await pedir('/api/programaciones', { nombre: 'Publicar ventas limpias', proceso: 'flujos/publicar_ventas.sqlchain', proyecto: TIENDA,
    regla: { tipo: 'al_llegar', fuente: 'ventas-mensuales' }, avisar: 'fallos' });

// Git: el historial que enseña el panel de Git y «What changed».
{
    const g = (...a) => execFileSync('git', ['-C', TIENDA, ...a], { stdio: 'pipe' });
    fs.writeFileSync(path.join(TIENDA, '.gitignore'), '*.duckdb\n*.duckdb.wal\nentregas/\npublicado/\n.amoxsql/entregas/\n');
    g('init', '-q', '-b', 'main');
    g('config', 'user.name', 'Analista'); g('config', 'user.email', 'analista@example.com');
    g('add', '-A'); g('commit', '-q', '-m', 'Proyecto de ventas: consultas, cuaderno y cierre mensual');
    const otro = { ...cierre, nodes: cierre.nodes.map(n => (n.id === 'orden_producto' ? { ...n, label: 'Mayor primero (top 15)' } : n)) };
    fs.writeFileSync(path.join(TIENDA, 'flujos/cierre_mensual.sqlchain'), JSON.stringify(otro, null, 2) + '\n');
    g('commit', '-q', '-am', 'Cierre: nombre más claro para el ranking de productos');
}

// ── Marketing: el proyecto de otro cliente ────────────────────────────────────
await abrir(MARKETING, agencia, { estado: 'en_revision', entrega: '2024-10-31' });
await pedir('/api/db/connect', { path: path.join(MARKETING, 'marketing.duckdb') });
const dm = path.join(MARKETING, 'datos').replace(/\\/g, '/');
for (const s of [
    `CREATE TABLE plan_octubre AS SELECT * FROM read_csv('${dm}/plan_octubre_2024.csv')`,
    `CREATE TABLE catalogo_regiones AS SELECT "Región" AS region, "Estado" AS estado FROM read_csv('${dm}/catalogo_regiones.csv')`,
    `CREATE TABLE historico_campanias AS SELECT "Fecha"::DATE AS fecha, "Nombre de la Campaña" AS campania,
        "Region" AS zona, "Clicks" AS clicks, "Impresiones" AS impresiones, "Views" AS visualizaciones, "Costo" AS costo
        FROM read_csv('${dm}/historico_campanias.csv', all_varchar=false)`,
    `COMMENT ON TABLE plan_octubre IS 'Plan de medios de octubre 2024 por campaña y estado.'`,
]) await sql(s);

// ── Almacén dbt: el proyecto del ingeniero ────────────────────────────────────
await abrir(ALMACEN, electronica, { estado: 'en_curso' });
await pedir('/api/dbt/init', { projectName: 'almacen' });

// Al final, la tienda abierta: es lo primero que se ve.
await pedir('/api/project/open', { path: TIENDA });
await pedir('/api/db/connect', { path: path.join(TIENDA, 'tienda.duckdb') });

fs.writeFileSync(path.join(DESTINO, 'LEEME.md'), `# Ejemplos de AmoxSQL

Tres proyectos de dos clientes, con datos reales de un curso de SQL, que usan todo
lo que AmoxSQL sabe hacer. Ábrelos desde la bienvenida con **Open a project**.

| Proyecto | Cliente | Qué enseña |
|---|---|---|
| \`tienda-electronica\` | Electrónica Global | Consultas, cuaderno, gráficos de Story Flow, Canvas, Data Flow programado que entrega un Excel, fuentes con contrato, diagrama, contexto para la IA, Git |
| \`marketing-campanas\` | Agencia Digital MX | Otro cliente: plan de medios por estado, cuaderno con parámetros |
| \`almacen-dbt\` | Electrónica Global | Un proyecto de dbt con una capa por modelo |

## La historia

**Electrónica Global** vende en línea. Cada mes llega un CSV con cada línea de venta
(\`datos/ventas-mensuales/\`) y Finanzas manda sus metas en Excel
(\`datos/metas_2024.xlsx\`). El analista:

1. Lee la carpeta como **una fuente con nombre** (\`ventas-mensuales\`) con su contrato.
2. Construye \`tienda.duckdb\` (ventas, productos, categorías, metas).
3. Explora en \`queries/\`, cuenta la historia en \`notebooks/analisis_2024.sqlnb\` y en
   \`canvas/exploracion_2024.amoxcanvas\`.
4. Automatiza el cierre con \`flujos/cierre_mensual.sqlchain\`: el tercer día hábil de
   cada mes deja \`entregas/<año>/cierre_<año-mes>.xlsx\` para Dirección.

## Recrearla

\`\`\`
node scripts/ejemplos/crearEjemplos.mjs
\`\`\`

(desde el repositorio de AmoxSQL). Borra y vuelve a crear esta carpeta.
`);

console.log(`Ejemplos listos en ${DESTINO}`);
if (SERVIR) console.log(`Servidor en ${port}: pnpm client:dev y http://localhost:5173/?apiPort=${port}`);
else process.exit(0);
