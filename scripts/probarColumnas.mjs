/**
 * El gráfico acierta a la primera (6.0, M2; auditoría R1, R2).
 *
 *     node scripts/probarColumnas.mjs
 *
 * Las once consultas de los proyectos de ejemplo (`scripts/ejemplos/proyectos/*`) se
 * ejecutan contra tablas sintéticas con el mismo esquema, y para cada resultado se
 * comprueba lo que propone `client/src/utils/columnas.js`: el eje X, el eje Y, si se
 * parte por una categoría y el tipo de gráfico. El objetivo del plan era 10 de 11.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { perfilarColumnas, ejesPorDefecto, tipoSugerido } = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/columnas.js')).href);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
const con = await (await crearInstancia(':memory:')).connect();
for (const s of [
    `CREATE TABLE categorias AS SELECT * FROM (VALUES ('Portátiles'),('Monitores'),('Teléfonos'),('Cargadores'),('Auriculares'),('Pilas'),('Televisores'),('Electrodomésticos')) t(categoria)`,
    `CREATE TABLE productos AS SELECT 'Producto ' || i AS producto, ['Portátiles','Monitores','Teléfonos','Cargadores','Auriculares','Pilas','Televisores','Electrodomésticos'][i % 8 + 1] AS categoria, (10 + i * 7)::DECIMAL(10,2) AS precio_lista FROM range(19) r(i)`,
    `CREATE TABLE ventas AS SELECT i AS linea, DATE '2023-01-01' + (i % 700)::INTEGER AS fecha, p.producto, p.categoria,
        1 + (i % 3) AS cantidad, p.precio_lista AS precio_unitario, ((1 + (i % 3)) * p.precio_lista)::DECIMAL(12,2) AS importe,
        ['Dallas', 'Boston', 'Austin', 'Seattle', 'Atlanta', 'Portland', 'San Francisco', 'Los Angeles', 'New York City'][i % 9 + 1] AS ciudad,
        ['TX', 'MA', 'TX', 'WA', 'GA', 'OR', 'CA', 'CA', 'NY'][i % 9 + 1] AS estado,
        'Calle ' || i AS direccion, 'Sales_' || (i % 24) || '.csv' AS archivo
        FROM range(20000) r(i) JOIN productos p ON p.producto = 'Producto ' || (i % 19)`,
    `CREATE TABLE metas_2024 AS SELECT m::DATE AS mes, c.categoria, 100000::BIGINT AS meta FROM range(DATE '2024-01-01', DATE '2025-01-01', INTERVAL 1 MONTH) t(m), categorias c`,
    `CREATE TABLE plan_octubre AS SELECT 'Campaña ' || (i % 6) AS nombre_campania, ['Jalisco', 'Nuevo León', 'CDMX', 'Puebla'][i % 4 + 1] AS region,
        1000 + i * 3 AS impresiones, 10 + i % 50 AS clicks, (50 + i)::DOUBLE AS costo FROM range(60) r(i)`,
    `CREATE TABLE catalogo_regiones AS SELECT * FROM (VALUES ('Occidente', 'Jalisco'), ('Norte', 'Nuevo León'), ('Centro', 'CDMX'), ('Centro', 'Puebla')) t(region, estado)`,
    `CREATE TABLE historico_campanias AS SELECT DATE '2023-01-01' + i::INTEGER AS fecha, 'Curso ' || (i % 4) AS campania, 900 + i AS impresiones, 5 + i % 30 AS clicks, (20 + i % 40)::DOUBLE AS costo FROM range(500) r(i)`,
]) await con.run(s);

const leer = (rel) => fs.readFileSync(path.join(RAIZ, 'scripts/ejemplos/proyectos', rel), 'utf8')
    .replace(/\$\{anio\}/g, '2024').replace(/'\$\{categoria\}'/g, "'Monitores'");

// Lo esperado: x, y (la primera), partir y el tipo sugerido (null = columnas, lo de siempre).
const CASOS = [
    ['tienda-electronica/queries/01_panorama_mensual.sql', { x: 'mes', y: 'venta', tipo: 'line' }],
    ['tienda-electronica/queries/02_mezcla_por_categoria.sql', { x: 'categoria', y: 'venta', tipo: null }],
    ['tienda-electronica/queries/03_top_productos.sql', { x: 'producto', y: 'venta', tipo: 'bar-horizontal' }],
    ['tienda-electronica/queries/04_meta_vs_real.sql', { x: 'mes', y: 'venta', partir: 'categoria', tipo: 'line' }],
    ['tienda-electronica/queries/05_ciudades.sql', { x: 'ciudad', y: 'venta', tipo: 'bar-horizontal' }],
    ['tienda-electronica/queries/06_estacionalidad.sql', { x: 'mes', y: 'venta', tipo: null }],
    ['tienda-electronica/queries/07_calidad_de_datos.sql', { x: 'revision', y: 'casos', tipo: null }],
    ['tienda-electronica/queries/08_variables.sql', { x: 'mes', y: 'venta', tipo: 'line' }],
    ['marketing-campanas/queries/01_costo_por_campania.sql', { x: 'campania', y: 'costo', tipo: null }],
    ['marketing-campanas/queries/02_por_region.sql', { x: 'region', y: 'costo', tipo: null }],
    ['marketing-campanas/queries/03_rendimiento_historico.sql', { x: 'mes', y: 'clicks', tipo: 'line' }],
];

let aciertos = 0;
for (const [rel, esp] of CASOS) {
    const r = await con.runAndReadAll(leer(rel));
    const filas = r.getRowObjectsJson();
    const tipos = Object.fromEntries(r.columnNames().map((n, i) => [n, r.columnTypes()[i].toString()]));
    const perfil = perfilarColumnas(filas, tipos);
    const ejes = ejesPorDefecto(perfil, filas);
    const tipo = tipoSugerido(perfil, ejes, filas)?.chartType ?? null;
    const ok = ejes.x === esp.x && ejes.y[0] === esp.y && (ejes.partir || '') === (esp.partir || '') && tipo === esp.tipo;
    if (ok) aciertos++;
    comprobar(`${path.basename(rel)}: ${esp.y} por ${esp.x}${esp.partir ? ` y ${esp.partir}` : ''}, ${esp.tipo || 'columnas'}`, ok,
        `salió x=${ejes.x} y=${ejes.y.join(',')} partir=${ejes.partir || '-'} tipo=${tipo || 'columnas'} · ${perfil.map(c => `${c.nombre}:${c.papel}`).join(' ')}`);
}
console.log(`\n  ${aciertos} de ${CASOS.length} consultas de ejemplo con el gráfico esperado (objetivo del plan: 10)`);

// Casos de borde
const de = (filas, tipos) => { const p = perfilarColumnas(filas, tipos); return { p, e: ejesPorDefecto(p, filas) }; };
let r = de([{ lugar: 1, n: 5 }, { lugar: 2, n: 3 }, { lugar: 3, n: 1 }]);
comprobar('sólo un ranking y un número: el ranking es el eje antes que nada', r.e.x === 'lugar' && r.e.y[0] === 'n', JSON.stringify(r.e));
r = de([{ a: 1.5, b: 2.5 }, { a: 2, b: 7 }, { a: 3.1, b: 1 }]);
comprobar('dos medidas sin categoría: dispersión', tipoSugerido(r.p, r.e, [{}, {}, {}])?.chartType === 'scatter', JSON.stringify(r.e));
r = de([{ total: 10 }]);
comprobar('una sola fila: no se fuerza nada', tipoSugerido(r.p, r.e, [{ total: 10 }]) === null);
r = de([{ datos: { a: 1 } }, { datos: { a: 2 } }]);
comprobar('una columna VARIANT no rompe', r.p[0].papel === 'texto');
comprobar('sin filas: vacío', ejesPorDefecto(perfilarColumnas([])).x === '');

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
