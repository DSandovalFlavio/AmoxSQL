/**
 * Ejercita `utils/celdaSql.js` — lo que se deduce de una celda sin ejecutarla.
 *
 *     node scripts/probarCeldaSql.mjs
 *
 * De este análisis cuelgan dos cosas del cuaderno, y una de ellas es la que al
 * fallar **no da un error**:
 *
 * - `envolvible` decide si la celda deja una vista. Si se equivoca de más, se
 *   manda al motor un `CREATE VIEW AS (CREATE TABLE …)` que **revienta**.
 * - `lee` es el grafo de dependencias. Si se pierde una, un resultado viejo se
 *   queda con pinta de nuevo y acaba copiado en un informe.
 *
 * Por eso los casos que se vigilan no son los bonitos: comentarios dentro de
 * cadenas, punto y coma dentro de un literal, `WITH` que acaba en `INSERT`,
 * funciones que parecen tablas, y nombres de CTE que parecen dependencias.
 */
import { analizarCelda, enmascarar } from '../client/src/utils/celdaSql.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};
const lee = (sql) => analizarCelda(sql).lee.map((s) => s.toLowerCase()).sort();

// ── el enmascarado, que es la base de todo lo demás ─────────────────────────
eq('un comentario se borra', enmascarar('SELECT 1 -- hola').trim(), 'SELECT 1');
eq('pero NO el que está dentro de una cadena',
    enmascarar("SELECT 'a -- b' AS x, 2").includes('AS x'), true);
eq('la longitud se conserva', enmascarar("SELECT 'abc'").length, "SELECT 'abc'".length);
eq('los saltos de línea se conservan', enmascarar('SELECT 1\n-- nota\nFROM t').split('\n').length, 3);
eq('comentario de bloque', enmascarar('SELECT /* x */ 1').replace(/\s+/g, ' '), 'SELECT 1');
eq('comilla escapada duplicada', enmascarar("SELECT 'a''b' , c").includes(', c'), true);
eq('las comillas DOBLES se conservan: son un identificador',
    enmascarar('SELECT * FROM "mi tabla"').includes('mi tabla'), true);
eq('cadena con dólar', enmascarar('SELECT $$ raro ; $$ , 1').includes(', 1'), true);
eq('bloque sin cerrar no revienta', typeof enmascarar('SELECT /* sin fin'), 'string');

// ── cuántas sentencias ──────────────────────────────────────────────────────
eq('una', analizarCelda('SELECT 1').sentencias, 1);
eq('dos', analizarCelda('SELECT 1; SELECT 2;').sentencias, 2);
// El punto y coma de dentro de una cadena NO parte nada.
eq('punto y coma dentro de un literal', analizarCelda("SELECT 'a;b'").sentencias, 1);
eq('vacía', analizarCelda('').vacia, true);
eq('sólo un comentario también es vacía', analizarCelda('-- nada que ver').vacia, true);

// ── envolvible: la condición de la vista implícita ──────────────────────────
eq('un SELECT', analizarCelda('SELECT 1').envolvible, true);
eq('un WITH que acaba en SELECT',
    analizarCelda('WITH a AS (SELECT 1) SELECT * FROM a').envolvible, true);
eq('dos sentencias NO', analizarCelda('SELECT 1; SELECT 2').envolvible, false);
// Medido contra el motor: envolver esto FALLA. Es la razón de que exista el campo.
eq('un CREATE TABLE NO', analizarCelda('CREATE TABLE x (a int)').envolvible, false);
eq('un INSERT NO', analizarCelda('INSERT INTO t VALUES (1)').envolvible, false);
eq('un COPY NO', analizarCelda("COPY t TO 'x.csv'").envolvible, false);
eq('un PRAGMA NO', analizarCelda('PRAGMA database_list').envolvible, false);
// La trampa: empieza por WITH y acaba escribiendo.
eq('un WITH que acaba en INSERT NO',
    analizarCelda('WITH a AS (SELECT 1) INSERT INTO t SELECT * FROM a').envolvible, false);
eq('vacía NO', analizarCelda('').envolvible, false);

// ── si ya la escribió el usuario, se respeta ────────────────────────────────
eq('vista propia', analizarCelda('CREATE OR REPLACE TEMP VIEW ventas_limpias AS SELECT 1').vistaPropia, 'ventas_limpias');
eq('y entonces no se envuelve', analizarCelda('CREATE TEMP VIEW v AS SELECT 1').envolvible, false);
eq('con comillas', analizarCelda('CREATE VIEW "mi vista" AS SELECT 1').vistaPropia, 'mi vista');
eq('un SELECT no tiene vista propia', analizarCelda('SELECT 1').vistaPropia, null);

// ── el comentario de cabecera, que será la descripción ──────────────────────
eq('una línea',
    analizarCelda('-- Quito devoluciones\nSELECT 1').comentario, 'Quito devoluciones');
eq('varias líneas',
    analizarCelda('-- Quito devoluciones\n-- y pedidos de prueba\nSELECT 1').comentario,
    'Quito devoluciones\ny pedidos de prueba');
eq('se salta las líneas en blanco de delante',
    analizarCelda('\n\n-- hola\nSELECT 1').comentario, 'hola');
// Un comentario DESPUÉS del código no es la descripción de nada.
eq('el de después no cuenta', analizarCelda('SELECT 1\n-- nota suelta').comentario, '');
eq('corta en la línea en blanco',
    analizarCelda('-- cabecera\n\n-- otra cosa\nSELECT 1').comentario, 'cabecera');
eq('sin comentario', analizarCelda('SELECT 1').comentario, '');

// ── lo que lee: EL GRAFO ────────────────────────────────────────────────────
eq('un FROM', lee('SELECT * FROM ventas'), ['ventas']);
eq('con esquema', lee('SELECT * FROM main.ventas'), ['main.ventas']);
eq('dos tablas separadas por coma', lee('SELECT * FROM a, b'), ['a', 'b']);
eq('un JOIN', lee('SELECT * FROM a JOIN b ON a.id = b.id'), ['a', 'b']);
eq('LEFT JOIN', lee('SELECT * FROM a LEFT JOIN b ON 1=1'), ['a', 'b']);
eq('con alias', lee('SELECT * FROM ventas AS v'), ['ventas']);
eq('comillas dobles', lee('SELECT * FROM "mi tabla"'), ['mi tabla']);
// Se recorre TODO el texto, así que una subconsulta también cuenta.
eq('dentro de una subconsulta', lee('SELECT * FROM (SELECT * FROM interna) x'), ['interna']);
eq('en un UNION', lee('SELECT * FROM a UNION ALL SELECT * FROM b'), ['a', 'b']);

// Lo que NO es una dependencia, y de lo que hay certeza:
eq('un CTE propio no cuenta',
    lee('WITH limpio AS (SELECT * FROM ventas) SELECT * FROM limpio'), ['ventas']);
eq('dos CTE encadenados',
    lee('WITH a AS (SELECT * FROM t1), b AS (SELECT * FROM a) SELECT * FROM b'), ['t1']);
eq('una llamada a función no es una tabla', lee("SELECT * FROM read_csv('x.csv')"), []);
eq('el nombre de dentro de una cadena tampoco', lee("SELECT 'FROM secreta' AS x"), []);

// La cadena entera de un cuaderno, que es el caso real.
eq('la cadena de un análisis',
    lee('SELECT categoria, sum(importe) FROM ventas_limpias GROUP BY categoria'),
    ['ventas_limpias']);

// ── consultar un ARCHIVO, que en esta aplicación es de lo más común ─────────
// Al enmascarar, el literal deja un hueco de espacios. Sin cuidado, el escáner
// se salta el hueco y se traga la palabra siguiente: este caso daba
// `["JOIN","campanas"]` y lo cazó probarlo con una consulta de verdad, no las
// pruebas que yo había escrito.
eq('un CSV no deja nombre de tabla', lee("SELECT * FROM 'Data/ventas.csv'"), []);
eq('y NO se come el JOIN de detrás',
    lee("SELECT * FROM 'Data/ventas.csv' JOIN campanas c ON c.id = id"), ['campanas']);
eq('ni el WHERE', lee("SELECT * FROM 'x.csv' WHERE a = 1"), []);
eq('ni el GROUP BY', lee("SELECT a FROM 'x.csv' GROUP BY ALL"), []);
// Una palabra reservada nunca es una tabla, venga de donde venga.
eq('FROM seguido de SELECT', lee('SELECT * FROM (SELECT 1) t'), []);
eq('el alias no se confunde con otra tabla', lee('SELECT * FROM ventas v JOIN campanas c ON 1=1'), ['campanas', 'ventas']);
eq('alias con AS explícito', lee('SELECT * FROM ventas AS v, campanas AS c'), ['campanas', 'ventas']);

// ── si escribe, y dónde ─────────────────────────────────────────────────────
eq('un SELECT no escribe', analizarCelda('SELECT 1').escribe, 'no');
eq('una tabla TEMP es de sesión', analizarCelda('CREATE TEMP TABLE t AS SELECT 1').escribe, 'sesion');
eq('una vista TEMP también', analizarCelda('CREATE OR REPLACE TEMP VIEW v AS SELECT 1').escribe, 'sesion');
eq('una tabla de verdad toca el DISCO', analizarCelda('CREATE TABLE t (a int)').escribe, 'disco');
eq('un INSERT también', analizarCelda('INSERT INTO t VALUES (1)').escribe, 'disco');
eq('un DROP también', analizarCelda('DROP TABLE t').escribe, 'disco');
eq('un COPY también', analizarCelda("COPY t TO 'x.parquet'").escribe, 'disco');
eq('un SET es de sesión', analizarCelda('SET threads = 4').escribe, 'sesion');
eq('un INSTALL es de sesión', analizarCelda('INSTALL httpfs').escribe, 'sesion');
// Entre varias, manda la más grave.
eq('entre varias gana la peor',
    analizarCelda('SELECT 1; CREATE TABLE t (a int);').escribe, 'disco');
eq('sesión y consulta', analizarCelda('SET x = 1; SELECT 1;').escribe, 'sesion');
// Lo que no se reconoce se trata como si escribiera: callarse un CREATE seria
// peor que avisar de un SELECT raro.
eq('lo desconocido se supone que escribe', analizarCelda('MERGE INTO t USING s ON 1=1').escribe, 'disco');

// ── entradas rotas: ninguna debe lanzar ─────────────────────────────────────
eq('nulo', analizarCelda(null).vacia, true);
eq('sólo espacios', analizarCelda('   \n  ').vacia, true);
eq('sin cerrar el paréntesis', typeof analizarCelda('SELECT * FROM (').lee, 'object');
eq('comilla sin cerrar', typeof analizarCelda("SELECT 'sin fin").lee, 'object');

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
