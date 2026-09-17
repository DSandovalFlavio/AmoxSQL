/**
 * Pruebas de `client/src/components/cuaderno/exportar.js`.
 *
 * Lo que se comprueba es la traducción entre el cuaderno nuevo y los
 * exportadores que se conservan, y sobre todo **que se avise de lo que no va a
 * salir**: un gráfico que falta en un documento de Word no da ningún error, y se
 * descubre cuando el documento ya está en el correo de otra persona.
 *
 *   node scripts/probarExportarCuaderno.mjs
 */
import {
    celdasParaExportar, graficosQueNoSalen, planDeTablero,
} from '../client/src/components/cuaderno/exportar.js';

let bien = 0;
let mal = 0;

function comprobar(titulo, real, esperado) {
    const a = JSON.stringify(real);
    const b = JSON.stringify(esperado);
    if (a === b) { bien++; return; }
    mal++;
    console.error(`FALLA  ${titulo}\n  esperado ${b}\n  real     ${a}`);
}

const celdas = [
    { id: 't1', tipo: 'texto', contenido: '# Caída de septiembre' },
    { id: 'c1', tipo: 'sql', nombre: 'ventas_limpias', contenido: 'SELECT 1' },
    { id: 'c2', tipo: 'sql', nombre: 'por_region', contenido: 'SELECT 2' },
    { id: 't2', tipo: 'texto', contenido: '   ' },
];
const claves = { t1: 'p:0', c1: 'n:ventas_limpias', c2: 'n:por_region', t2: 'p:3' };

// ── la traducción ───────────────────────────────────────────────────────────
comprobar(
    'las celdas se traducen a la forma del exportador',
    celdasParaExportar(celdas),
    [
        { id: 't1', type: 'markdown', content: '# Caída de septiembre' },
        { id: 'c1', type: 'code', content: 'SELECT 1' },
        { id: 'c2', type: 'code', content: 'SELECT 2' },
        { id: 't2', type: 'markdown', content: '   ' },
    ],
);
comprobar('sin celdas, nada', celdasParaExportar(null), []);

// ── el aviso de lo que no va a salir ────────────────────────────────────────
{
    // El exportador captura del DOM vivo: una celda en «sólo el código» no tiene
    // gráfico que capturar, y en el documento saldría sin figura.
    const estados = {
        'n:ventas_limpias': { vista: 'chart', grafico: {}, modo: 'codigo' },
        'n:por_region': { vista: 'chart', grafico: {}, modo: 'ambos' },
    };
    comprobar('se avisa de la que está plegada', graficosQueNoSalen(celdas, claves, estados), ['ventas_limpias']);
}
comprobar(
    'una celda en tabla no se avisa: no hay gráfico que perder',
    graficosQueNoSalen(celdas, claves, { 'n:ventas_limpias': { vista: 'table', modo: 'codigo' } }),
    [],
);
comprobar('sin estados, no hay nada que avisar', graficosQueNoSalen(celdas, claves, {}), []);

// ── el puente al tablero ────────────────────────────────────────────────────
{
    const estados = {
        'n:ventas_limpias': { vista: 'chart', grafico: { chartType: 'bar' } },
        'n:por_region': { vista: 'table', grafico: { chartType: 'line' } },
    };
    const resultados = { c1: { data: [{ a: 1 }] }, c2: { data: [{ a: 1 }] } };
    const plan = planDeTablero(celdas, claves, estados, resultados, 'Caída de septiembre');

    comprobar('el texto vacío no se lleva una diapositiva', plan.trozos.filter((t) => t.clase === 'prosa').length, 1);
    comprobar('sólo la que está en gráfico se lleva figura', plan.figuras, 1);
    comprobar('el nombre del archivo se limpia', plan.nombre, 'Ca_da_de_septiembre');
    comprobar(
        'y la figura guarda su consulta junto a la configuración',
        JSON.parse(plan.trozos.find((t) => t.clase === 'figura').contenido),
        { chartType: 'bar', query: 'SELECT 1' },
    );
    comprobar(
        'el orden del documento se respeta',
        plan.trozos.map((t) => t.clase),
        ['prosa', 'figura'],
    );
}
{
    // Un gráfico configurado sobre una celda que nunca se ejecutó no tiene datos
    // que enseñar: la diapositiva saldría vacía.
    const plan = planDeTablero(celdas, claves,
        { 'n:ventas_limpias': { vista: 'chart', grafico: {} } }, {}, 'x');
    comprobar('sin resultado no hay figura', plan.figuras, 0);
}
{
    const plan = planDeTablero([], {}, {}, {}, '');
    comprobar('un cuaderno vacío no da diapositivas', plan.trozos, []);
    comprobar('y el nombre cae en uno por omisión', plan.nombre, 'cuaderno');
}

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
