// @suite rapida: no carga el motor; corre en cada PR (pnpm test:rapidas).
/**
 * Pruebas de lo que una celda del cuaderno dice cuando falla (6.0.1, F0):
 * `client/src/components/cuaderno/errores.js`, y que «Refresh» no cuente una
 * celda vacía (Shift+Enter deja una al final).
 *
 *   node scripts/probarErroresCelda.mjs
 */
import { desfaseDeEnvoltorio, lineaDelError, parametrosSinValor } from '../client/src/components/cuaderno/errores.js';
import { construirGrafo, frescura, queActualizar } from '../client/src/components/cuaderno/grafo.js';
import { analizarCelda } from '../client/src/utils/celdaSql.js';
import { componerCelda } from '../client/src/utils/vistaDeCelda.js';

let bien = 0;
let mal = 0;
function comprobar(titulo, real, esperado) {
    const a = JSON.stringify(real);
    const b = JSON.stringify(esperado);
    if (a === b) { bien++; return; }
    mal++;
    console.error(`FALLA  ${titulo}\n  esperado ${b}\n  real     ${a}`);
}

// ── el desfase sale del envoltorio de verdad ──────────────────────────────
{
    const sql = 'SELECT x\nFROM t';
    const an = analizarCelda(sql);
    const { preparacion, deja } = componerCelda({ sql, analisis: an, nombre: 'paso_1' });
    const lineas = preparacion.split('\n');
    const primeraDeLaCelda = lineas.indexOf('SELECT x') + 1;   // 1-based
    comprobar('una vista: el envoltorio pone una línea delante', desfaseDeEnvoltorio(deja), primeraDeLaCelda - 1);
    comprobar('materializada también', desfaseDeEnvoltorio('tabla'), 1);
    comprobar('lo que no se envuelve no se desplaza', [desfaseDeEnvoltorio('nada'), desfaseDeEnvoltorio('propia')], [0, 0]);
}

// ── la línea del error ────────────────────────────────────────────────────
{
    const motor = 'Binder Error: Referenced column "precioo" not found\n\nLINE 3:   precioo\n          ^';
    const r = lineaDelError(motor, 1);
    comprobar('LINE 3 del envoltorio es la 2 de la celda', r.linea, 2);
    comprobar('y el mensaje lo dice así', r.mensaje.includes('LINE 2:') && !r.mensaje.includes('LINE 3:'), true);
    comprobar('sin desfase no cambia nada', lineaDelError(motor, 0).linea, 3);
    comprobar('una línea dentro del envoltorio no se marca', lineaDelError('Parser Error\nLINE 1: CREATE', 1).linea, null);
    comprobar('sin LINE no hay línea', lineaDelError('Catalog Error: Table x does not exist', 1), { mensaje: 'Catalog Error: Table x does not exist', linea: null });
    comprobar('un mensaje vacío no rompe', lineaDelError(undefined, 1).linea, null);
}

// ── parámetros sin valor ──────────────────────────────────────────────────
{
    comprobar('los que faltan, en orden y una vez', parametrosSinValor('{{b}} {{ a }} {{b}}', {}), ['b', 'a']);
    comprobar('declarado con valor no falta', parametrosSinValor('{{anio}}', { anio: '2024' }), []);
    comprobar('un cero es un valor', parametrosSinValor('{{n}}', { n: 0 }), []);
    comprobar('declarado vacío sí falta', parametrosSinValor('{{anio}}', { anio: '' }), ['anio']);
    comprobar('sin parámetros, nada', parametrosSinValor('SELECT 1', undefined), []);
}

// ── «Refresh» no cuenta la celda vacía ────────────────────────────────────
{
    const celdas = [
        { id: 'a', tipo: 'sql', nombre: 'paso_1', contenido: 'SELECT 1 AS x' },
        { id: 'b', tipo: 'sql', nombre: '', contenido: '' },
    ];
    const analisis = Object.fromEntries(celdas.map((c) => [c.id, analizarCelda(c.contenido)]));
    const grafo = construirGrafo(celdas, analisis);
    const f = frescura(celdas, grafo, {}, Object.fromEntries(celdas.map((c) => [c.id, c.contenido])));
    comprobar('sólo la que tiene algo que ejecutar', queActualizar(celdas, grafo, f, { analisis, conResultado: new Set() }).orden, ['a']);
}

console.log(`${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
