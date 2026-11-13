/**
 * Los números de la tabla de resultados, por el tipo de su columna (6.0, M1; F5).
 *
 *     node scripts/probarFormatoCelda.mjs
 *
 * Con el motor de verdad: lo que manda para cada tipo (texto para DECIMAL y los enteros
 * grandes, número para DOUBLE) y cómo queda en la tabla, en inglés (en-US) para que la
 * prueba no dependa del idioma de la máquina.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { formatearNumero } = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/formatoCelda.js')).href);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
const con = await (await crearInstancia(':memory:')).connect();
const r = await con.runAndReadAll(`SELECT 5553900::DECIMAL(12,2) AS venta, 1700.0::DOUBLE AS precio, 999.99::DOUBLE AS p2,
    10850::HUGEINT AS unidades, 12345678901234567890::HUGEINT AS enorme, -4200::BIGINT AS neg, 7::INTEGER AS chico,
    0.5::DECIMAL(5,3) AS medio, 'texto' AS t, DATE '2024-01-01' AS d`);
const fila = r.getRowObjectsJson()[0];
const tipos = Object.fromEntries(r.columnNames().map((n, i) => [n, r.columnTypes()[i].toString()]));
const f = (col) => formatearNumero(fila[col], tipos[col], 'en-US');

comprobar('DECIMAL(12,2) llega como texto y sale con miles y sus 2 decimales', typeof fila.venta === 'string' && f('venta') === '5,553,900.00', `${typeof fila.venta} ${f('venta')}`);
comprobar('DOUBLE entero: 1,700', f('precio') === '1,700', f('precio'));
comprobar('DOUBLE con decimales: 999.99', f('p2') === '999.99', f('p2'));
comprobar('HUGEINT: 10,850', f('unidades') === '10,850', f('unidades'));
comprobar('un HUGEINT que no cabe en un número de JavaScript, sin perder dígitos', f('enorme') === '12,345,678,901,234,567,890', f('enorme'));
comprobar('negativo: -4,200', f('neg') === '-4,200', f('neg'));
comprobar('INTEGER pequeño: 7', f('chico') === '7', f('chico'));
comprobar('DECIMAL(5,3) con su escala: 0.500', f('medio') === '0.500', f('medio'));
comprobar('un texto o una fecha no son números: null', f('t') === null && f('d') === null);
comprobar('en español, con sus separadores', formatearNumero('5553900.00', 'DECIMAL(12,2)', 'es-ES') === '5.553.900,00', formatearNumero('5553900.00', 'DECIMAL(12,2)', 'es-ES'));
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
