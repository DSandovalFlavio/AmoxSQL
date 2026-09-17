/**
 * Ejercita `utils/cuadernoFile.js` — el archivo del cuaderno.
 *
 *     node scripts/probarCuaderno.mjs
 *
 * Dos cosas que no pueden fallar, y ninguna de las dos da un error cuando falla:
 *
 * 1. **La ida y vuelta.** Leer y volver a escribir sin tocar nada tiene que
 *    devolver el mismo texto. Estos archivos se versionan: un guardado que
 *    reordena convierte cada commit en ruido, y el ruido hace que nadie los
 *    revise.
 * 2. **Los formatos viejos.** Hay `.sqlnb` por ahí en tres formas distintas.
 *    Abrir uno y perder la mitad sería el peor fallo posible de esta fase.
 */
import {
    leerCuaderno, escribirCuaderno, partirCabecera, tituloDe, indiceDe,
} from '../client/src/utils/cuadernoFile.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};
const F = '```';
/** Las celdas sin el identificador, que se genera al vuelo. */
const sinId = (c) => c.celdas.map(({ id, ...resto }) => resto);

// ── el front-matter ─────────────────────────────────────────────────────────
eq('sin cabecera, todo es cuerpo', partirCabecera('# hola').meta, {});
eq('una clave', partirCabecera('---\ntitulo: X\n---\ncuerpo').meta, { titulo: 'X' });
eq('y el cuerpo queda limpio', partirCabecera('---\ntitulo: X\n---\ncuerpo').cuerpo, 'cuerpo');
eq('un bloque anidado',
    partirCabecera('---\nparametros:\n  desde: 2026-09-01\n  region: Norte\n---\n').meta,
    { parametros: { desde: '2026-09-01', region: 'Norte' } });
eq('se quitan las comillas', partirCabecera('---\ntitulo: "Con dos puntos: aquí"\n---\n').meta.titulo, 'Con dos puntos: aquí');
eq('cabecera sin cerrar no revienta', typeof partirCabecera('---\ntitulo: X').cuerpo, 'string');

// ── el cuerpo ───────────────────────────────────────────────────────────────
const doc = [
    '---',
    'titulo: Caída de septiembre',
    'parametros:',
    '  desde: 2026-09-01',
    '---',
    '',
    '# ¿Por qué cayeron las ventas?',
    '',
    'Texto suelto de contexto.',
    '',
    '<!-- celda: ventas_limpias -->',
    `${F}sql`,
    '-- Quito devoluciones',
    'SELECT * FROM ventas;',
    F,
    '',
    '## Dónde se fue el dinero',
    '',
    '<!-- celda: por_categoria materializada -->',
    `${F}sql`,
    'SELECT categoria FROM ventas_limpias;',
    F,
    '',
].join('\n');

const c = leerCuaderno(doc);
eq('la cabecera', c.meta, { titulo: 'Caída de septiembre', parametros: { desde: '2026-09-01' } });
eq('cuántas celdas', c.celdas.length, 4);
eq('los tipos', c.celdas.map((x) => x.tipo), ['texto', 'sql', 'texto', 'sql']);
eq('los nombres', c.celdas.filter((x) => x.tipo === 'sql').map((x) => x.nombre), ['ventas_limpias', 'por_categoria']);
eq('la materializada', c.celdas.filter((x) => x.tipo === 'sql').map((x) => x.materializada), [false, true]);
// El markdown suelto entre dos bloques es UNA celda, no una por encabezado.
eq('el texto va entero', c.celdas[0].contenido, '# ¿Por qué cayeron las ventas?\n\nTexto suelto de contexto.');
eq('el SQL va limpio, sin la directiva', c.celdas[1].contenido, '-- Quito devoluciones\nSELECT * FROM ventas;');

// ── la ida y la vuelta, que es el requisito ─────────────────────────────────
eq('escribir lo leído devuelve lo mismo', escribirCuaderno(c), doc.replace(/\n+$/, '\n'));
eq('y otra vuelta más no lo mueve', escribirCuaderno(leerCuaderno(escribirCuaderno(c))), escribirCuaderno(c));

// ── un cuaderno vacío ───────────────────────────────────────────────────────
eq('vacío da una celda de código', leerCuaderno('').celdas.length, 1);
eq('y es de sql', leerCuaderno('').celdas[0].tipo, 'sql');
eq('nulo tampoco revienta', leerCuaderno(null).celdas.length, 1);

// ── una celda sin nombre todavía ────────────────────────────────────────────
const sinNombre = leerCuaderno(`${F}sql\nSELECT 1;\n${F}\n`);
eq('se lee sin directiva', sinNombre.celdas[0].nombre, '');
eq('y se escribe sin directiva', escribirCuaderno(sinNombre).includes('<!-- celda:'), false);

// ── lo que podría perderse y no se pierde ───────────────────────────────────
// Una directiva a la que no sigue un bloque vuelve al texto en vez de evaporarse.
const huerfana = leerCuaderno('<!-- celda: fantasma -->\n\ntexto normal\n');
eq('la directiva huérfana no se pierde', huerfana.celdas[0].contenido.includes('fantasma'), true);
// Un bloque cercado que no es de SQL es parte del texto, no una celda.
const conBloque = leerCuaderno(`Mira esto:\n\n${F}json\n{"a":1}\n${F}\n`);
eq('un bloque de otro lenguaje es texto', conBloque.celdas.length, 1);
eq('y se conserva entero', conBloque.celdas[0].contenido.includes('{"a":1}'), true);

// ── el formato viejo: JSON ──────────────────────────────────────────────────
const json = JSON.stringify({
    version: '3.0',
    environment: { desde: '2026-01-01' },
    cells: [
        { id: '1', type: 'markdown', content: '# Antiguo' },
        { id: '2', type: 'code', content: 'SELECT 1;' },
        { id: '3', type: 'input', content: 'Norte', metadata: { varName: 'region' } },
    ],
});
const v = leerCuaderno(json);
eq('JSON: cuántas celdas quedan', v.celdas.length, 2);
eq('JSON: los tipos', v.celdas.map((x) => x.tipo), ['texto', 'sql']);
eq('JSON: el markdown', v.celdas[0].contenido, '# Antiguo');
// La celda de «Input» era un parámetro disfrazado: pasa a serlo de verdad.
eq('JSON: el Input sube al front-matter', v.meta.parametros, { desde: '2026-01-01', region: 'Norte' });
eq('JSON: y ya no es una celda', v.celdas.some((x) => x.tipo === 'parametro'), false);

// ── el formato más viejo: los marcadores ────────────────────────────────────
const marcas = [
    '-- !CELL:MARKDOWN!',
    '-- # Título viejo',
    '-- con su texto',
    '-- !CELL:CODE!',
    'SELECT 1;',
    '-- !CELL:CODE!',
    'SELECT 2;',
].join('\n');
const m = leerCuaderno(marcas);
eq('marcadores: cuántas', m.celdas.length, 3);
eq('marcadores: los tipos', m.celdas.map((x) => x.tipo), ['texto', 'sql', 'sql']);
// El texto iba comentado; al leerlo se le quita el `--`.
eq('marcadores: el texto se descomenta', m.celdas[0].contenido, '# Título viejo\ncon su texto');
eq('marcadores: el código no', m.celdas[1].contenido, 'SELECT 1;');

// ── un archivo que no se entiende ───────────────────────────────────────────
// Se abre como texto en vez de no abrirse: perder el archivo de alguien por no
// reconocer su forma seria el peor fallo posible aqui.
const raro = leerCuaderno('{ esto no es json del todo');
eq('lo irreconocible se abre igual', raro.celdas.length >= 1, true);
eq('y conserva el contenido', JSON.stringify(raro.celdas).includes('esto no es json'), true);

// ── el título ───────────────────────────────────────────────────────────────
eq('del front-matter', tituloDe(c), 'Caída de septiembre');
eq('o del primer encabezado', tituloDe(leerCuaderno('# El del cuerpo\n')), 'El del cuerpo');
eq('sin ninguno', tituloDe(leerCuaderno(`${F}sql\nSELECT 1;\n${F}`)), '');

// ── el índice ───────────────────────────────────────────────────────────────
const idx = indiceDe(c);
eq('cuántas entradas', idx.length, 2);
eq('los niveles', idx.map((x) => x.nivel), [1, 2]);
eq('los textos', idx.map((x) => x.texto), ['¿Por qué cayeron las ventas?', 'Dónde se fue el dinero']);
// Un `#` dentro de un bloque de código NO es un encabezado.
eq('el # de dentro de un bloque no cuenta',
    indiceDe(leerCuaderno(`texto\n\n${F}python\n# esto es un comentario\n${F}\n`)).length, 0);
eq('el #### no llega', indiceDe(leerCuaderno('#### muy hondo\n')).length, 0);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
