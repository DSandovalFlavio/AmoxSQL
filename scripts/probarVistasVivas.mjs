/**
 * Pruebas de `client/src/components/cuaderno/vistasVivas.js`.
 *
 * Lo que se comprueba es que la barra derecha diga **la verdad sobre dos cosas
 * distintas**: lo que el documento declara y lo que el motor tiene vivo. El
 * fallo que se quiere evitar es el de siempre — reabrir el cuaderno al día
 * siguiente, ver todas las celdas con su nombre, y enterarse de que la sesión
 * está vacía sólo cuando falla la celda de en medio.
 *
 *   node scripts/probarVistasVivas.mjs
 */
import {
    cruzarVistas, parametrosUsados, sustituirParametros,
} from '../client/src/components/cuaderno/vistasVivas.js';

let bien = 0;
let mal = 0;

function comprobar(titulo, real, esperado) {
    const a = JSON.stringify(real);
    const b = JSON.stringify(esperado);
    if (a === b) { bien++; return; }
    mal++;
    console.error(`FALLA  ${titulo}\n  esperado ${b}\n  real     ${a}`);
}

const sql = (id, nombre, contenido = '', extra = {}) =>
    ({ id, tipo: 'sql', nombre, contenido, ...extra });

// ── el caso que da nombre a la fase ─────────────────────────────────────────
{
    // Cuaderno recién abierto: todas las celdas ahí, la sesión vacía.
    const celdas = [sql('a', 'ventas_limpias'), sql('b', 'por_region')];
    const r = cruzarVistas(celdas, []);
    comprobar('al reabrir, faltan todas', r.faltan, 2);
    comprobar('y ninguna está viva', r.vivasPropias, 0);
    comprobar('pero siguen declaradas', r.propias.map((p) => p.nombre), ['ventas_limpias', 'por_region']);
}
{
    const celdas = [sql('a', 'ventas_limpias'), sql('b', 'por_region')];
    const vivas = [{ nombre: 'ventas_limpias', tipo: 'vista', descripcion: 'Quito devoluciones' }];
    const r = cruzarVistas(celdas, vivas);
    comprobar('ejecutada una, falta la otra', r.faltan, 1);
    comprobar('la viva lo dice', r.propias[0].viva, true);
    comprobar('y trae su descripción DEL MOTOR', r.propias[0].descripcion, 'Quito devoluciones');
    comprobar('la que falta no inventa descripción', r.propias[1].descripcion, '');
    comprobar('la que falta lo dice', r.propias[1].viva, false);
}

// ── el tipo lo manda el motor cuando existe ─────────────────────────────────
{
    // Alguien marcó «materializar» DESPUÉS de ejecutar: lo que hay puesto en la
    // sesión sigue siendo una vista, y eso es lo que hay que enseñar.
    const celdas = [sql('a', 'p', '', { materializada: true })];
    const r = cruzarVistas(celdas, [{ nombre: 'p', tipo: 'vista' }]);
    comprobar('manda el motor sobre el documento', r.propias[0].tipo, 'vista');
}
{
    const celdas = [sql('a', 'p', '', { materializada: true })];
    comprobar('sin nada vivo, manda el documento', cruzarVistas(celdas, []).propias[0].tipo, 'tabla');
}

// ── mayúsculas ──────────────────────────────────────────────────────────────
comprobar(
    'el motor no distingue mayúsculas y aquí tampoco',
    cruzarVistas([sql('a', 'Ventas')], [{ nombre: 'ventas', tipo: 'vista' }]).propias[0].viva,
    true,
);

// ── lo que no es del cuaderno ───────────────────────────────────────────────
{
    const r = cruzarVistas([sql('a', 'mia')], [
        { nombre: 'mia', tipo: 'vista' },
        { nombre: 'de_otro_sitio', tipo: 'tabla', descripcion: 'de un .sql' },
    ]);
    comprobar('lo ajeno sale aparte', r.ajenas.map((v) => v.nombre), ['de_otro_sitio']);
    comprobar('con su tipo', r.ajenas[0].tipo, 'tabla');
    comprobar('y no cuenta como propia', r.propias.length, 1);
}

// ── bordes ──────────────────────────────────────────────────────────────────
comprobar('las celdas sin nombre no se declaran', cruzarVistas([sql('a', '')], []).propias.length, 0);
comprobar('ni las de texto', cruzarVistas([{ id: 'a', tipo: 'texto', nombre: 'x' }], []).propias.length, 0);
comprobar(
    'dos celdas con el mismo nombre se listan una vez',
    cruzarVistas([sql('a', 'p'), sql('b', 'p')], []).propias.length,
    1,
);
comprobar('sin nada, nada', cruzarVistas([], []), { propias: [], ajenas: [], faltan: 0, vivasPropias: 0 });
comprobar('sin argumentos tampoco revienta', cruzarVistas(null, null).faltan, 0);

// ── parámetros ─────────────────────────────────────────────────────────
comprobar(
    'se leen del texto, en orden de aparición',
    parametrosUsados([sql('a', '', 'WHERE f >= {{desde}} AND f < {{hasta}}')]),
    ['desde', 'hasta'],
);
comprobar(
    'con espacios dentro, como acepta el sustituidor compartido',
    parametrosUsados([sql('a', '', 'WHERE f >= {{ desde }}')]),
    ['desde'],
);
comprobar(
    'sin repetir entre celdas',
    parametrosUsados([sql('a', '', '{{desde}}'), sql('b', '', '{{desde}} {{otro}}')]),
    ['desde', 'otro'],
);
comprobar('las celdas de texto no cuentan', parametrosUsados([{ id: 'a', tipo: 'texto', contenido: '{{no}}' }]), []);
comprobar('sin parámetros, lista vacía', parametrosUsados([sql('a', '', 'SELECT 1')]), []);
// La otra convención del producto —la del editor de consultas— no es ésta. Si
// alguien la escribe aquí no se sustituye, y conviene que la barra no prometa
// que sí.
comprobar(
    'la otra convención del producto no se confunde con ésta',
    parametrosUsados([sql('a', '', 'WHERE f >= ${desde}')]),
    [],
);

// Sustituir es la función que ya compartian los cuadernos y los tableros. Se
// comprueba aquí para dejar escrito cuál es el trato, no para volver a probar
// código ajeno: un texto entra ENTRECOMILLADO y un número entra tal cual.
comprobar(
    'un texto entra entrecomillado, y así la fecha funciona sola',
    sustituirParametros('WHERE f >= {{desde}}', { desde: '2026-09-01' }),
    "WHERE f >= '2026-09-01'",
);
comprobar('un número entra tal cual', sustituirParametros('LIMIT {{n}}', { n: 10 }), 'LIMIT 10');
comprobar('todas las apariciones', sustituirParametros('{{a}} y {{a}}', { a: '1' }), "'1' y '1'");
comprobar(
    'lo que no está declarado se queda como está, para que se note',
    sustituirParametros('{{desde}} {{sin_declarar}}', { desde: 'x' }),
    "'x' {{sin_declarar}}",
);
comprobar('sin parámetros no toca nada', sustituirParametros('{{a}}', {}), '{{a}}');

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
