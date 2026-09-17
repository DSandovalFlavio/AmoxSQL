/**
 * Pruebas de `client/src/components/cuaderno/grafo.js`.
 *
 * **Es la parte del cuaderno que al fallar no da un error.** Una consulta mal
 * escrita falla y se ve; una dependencia perdida deja en pantalla un número
 * viejo con pinta de nuevo, y de ahí se va a una diapositiva y a una reunión.
 * Por eso hay más pruebas aquí que en ningún otro sitio, y por eso varias
 * comprueban que el código se equivoca **hacia marcar de más**.
 *
 *   node scripts/probarGrafoCuaderno.mjs
 */
import {
    construirGrafo, frescura, ordenTopologico, queActualizar, celdasEnCiclo,
} from '../client/src/components/cuaderno/grafo.js';
import { analizarCelda } from '../client/src/utils/celdaSql.js';

let bien = 0;
let mal = 0;

function comprobar(titulo, real, esperado) {
    const a = JSON.stringify(real);
    const b = JSON.stringify(esperado);
    if (a === b) { bien++; return; }
    mal++;
    console.error(`FALLA  ${titulo}\n  esperado ${b}\n  real     ${a}`);
}

/** Monta celdas, su análisis y su grafo de una tacada. */
function montar(defs) {
    const celdas = defs.map(([id, nombre, contenido]) => ({
        id, tipo: nombre === null ? 'texto' : 'sql', nombre: nombre || '', contenido: contenido || '',
    }));
    const analisis = {};
    for (const c of celdas) if (c.tipo === 'sql') analisis[c.id] = analizarCelda(c.contenido);
    return { celdas, analisis, grafo: construirGrafo(celdas, analisis) };
}

const padresDe = (g, id) => [...(g.padres.get(id) || [])].sort();
const est = (m) => Object.fromEntries([...m].sort());

// ── el grafo sale de lo que se lee, no del orden ────────────────────────────
{
    const { grafo } = montar([
        ['a', 'ventas_limpias', 'SELECT * FROM ventas'],
        ['b', 'por_region', 'SELECT region FROM ventas_limpias'],
    ]);
    comprobar('la que lee depende de la que crea', padresDe(grafo, 'b'), ['a']);
    comprobar('y la de arriba no depende de nadie', padresDe(grafo, 'a'), []);
}
{
    // La dependencia es POR NOMBRE: la celda que crea está DEBAJO de la que lee.
    // El orden de la pantalla no lo sabe, y por eso «ejecutar hacia abajo» era
    // una promesa falsa.
    const { celdas, grafo } = montar([
        ['b', 'por_region', 'SELECT region FROM ventas_limpias'],
        ['a', 'ventas_limpias', 'SELECT * FROM ventas'],
    ]);
    comprobar('la dependencia no mira la posición', padresDe(grafo, 'b'), ['a']);
    comprobar('y el orden de ejecución la respeta', ordenTopologico(celdas, grafo), ['a', 'b']);
}
comprobar(
    'una tabla real no es dependencia del cuaderno',
    padresDe(montar([['a', 'x', 'SELECT * FROM ventas']]).grafo, 'a'),
    [],
);
comprobar(
    'un archivo leído directamente tampoco',
    padresDe(montar([['a', 'x', "SELECT * FROM 'Data/ventas.csv'"]]).grafo, 'a'),
    [],
);
comprobar(
    'un CTE no es una dependencia: vive dentro de la consulta',
    padresDe(montar([
        ['a', 'base', 'SELECT 1'],
        ['b', 'x', 'WITH base AS (SELECT 2) SELECT * FROM base'],
    ]).grafo, 'b'),
    [],
);
comprobar(
    'el nombre no distingue mayúsculas',
    padresDe(montar([
        ['a', 'Ventas_Limpias', 'SELECT 1'],
        ['b', 'x', 'SELECT * FROM ventas_limpias'],
    ]).grafo, 'b'),
    ['a'],
);
comprobar(
    'una celda que se lee a sí misma no se hace su propio padre',
    padresDe(montar([['a', 'x', 'SELECT * FROM x']]).grafo, 'a'),
    [],
);
comprobar(
    'varias lecturas, varios padres',
    padresDe(montar([
        ['a', 'uno', 'SELECT 1'],
        ['b', 'dos', 'SELECT 2'],
        ['c', 'x', 'SELECT * FROM uno JOIN dos USING (id)'],
    ]).grafo, 'c'),
    ['a', 'b'],
);

// ── frescura ────────────────────────────────────────────────────────────────
{
    const { celdas, grafo } = montar([['a', 'x', 'SELECT 1']]);
    comprobar('sin ejecutar, nunca', est(frescura(celdas, grafo, {})), { a: 'nunca' });
    comprobar(
        'ejecutada y sin tocar, al día',
        est(frescura(celdas, grafo, { a: { en: 10, sql: 'SELECT 1' } })),
        { a: 'dia' },
    );
    comprobar(
        'editada después de ejecutar, cambiada',
        est(frescura(celdas, grafo, { a: { en: 10, sql: 'SELECT 2' } })),
        { a: 'cambiada' },
    );
}

// ── el criterio de la fase ──────────────────────────────────────────────────
{
    // De `base` cuelgan tres: dos directas y una nieta.
    const { celdas, grafo } = montar([
        ['a', 'base', 'SELECT * FROM ventas'],
        ['b', 'norte', 'SELECT * FROM base WHERE region = 1'],
        ['c', 'sur', 'SELECT * FROM base WHERE region = 2'],
        ['d', 'total', 'SELECT * FROM norte UNION ALL SELECT * FROM sur'],
        ['e', 'aparte', 'SELECT * FROM otra_tabla'],
    ]);
    // Todas ejecutadas y al día...
    const ejecuciones = {
        a: { en: 1, sql: 'SELECT * FROM ventas' },
        b: { en: 2, sql: 'SELECT * FROM base WHERE region = 1' },
        c: { en: 3, sql: 'SELECT * FROM base WHERE region = 2' },
        d: { en: 4, sql: 'SELECT * FROM norte UNION ALL SELECT * FROM sur' },
        e: { en: 5, sql: 'SELECT * FROM otra_tabla' },
    };
    comprobar(
        'de partida, todas al día',
        est(frescura(celdas, grafo, ejecuciones)),
        { a: 'dia', b: 'dia', c: 'dia', d: 'dia', e: 'dia' },
    );

    // ...y ahora se cambia la de la que cuelgan tres.
    celdas[0].contenido = 'SELECT * FROM ventas WHERE NOT devuelta';
    const f = frescura(celdas, grafo, ejecuciones);
    comprobar(
        'cambiar la base marca las tres que cuelgan, y sólo ésas',
        est(f),
        { a: 'cambiada', b: 'arriba', c: 'arriba', d: 'arriba', e: 'dia' },
    );
    comprobar(
        'y Actualizar ejecuta esas tres más la que cambió, en orden',
        queActualizar(celdas, grafo, f).orden,
        ['a', 'b', 'c', 'd'],
    );
    comprobar('la que no tiene relación no se toca', queActualizar(celdas, grafo, f).orden.includes('e'), false);
}

// ── el desfase por instante, no sólo por texto ──────────────────────────────
{
    const { celdas, grafo } = montar([
        ['a', 'base', 'SELECT 1'],
        ['b', 'hija', 'SELECT * FROM base'],
    ]);
    // La hija se ejecutó ANTES que la madre: lo que se ve en la hija es de antes
    // de que la madre se volviera a poner.
    const f = frescura(celdas, grafo, {
        a: { en: 20, sql: 'SELECT 1' },
        b: { en: 10, sql: 'SELECT * FROM base' },
    });
    comprobar('si la madre corrió después, la hija está desfasada', est(f), { a: 'dia', b: 'arriba' });
}
{
    const { celdas, grafo } = montar([
        ['a', 'base', 'SELECT 1'],
        ['b', 'hija', 'SELECT * FROM base'],
    ]);
    const f = frescura(celdas, grafo, {
        a: { en: 10, sql: 'SELECT 1' },
        b: { en: 20, sql: 'SELECT * FROM base' },
    });
    comprobar('y si corrió antes, la hija está al día', est(f), { a: 'dia', b: 'dia' });
}

// ── el código se inclina a marcar de más ────────────────────────────────────
{
    // La madre no se ha ejecutado nunca en esta sesión, pero la hija sí. Eso
    // significa que la hija leyó una vista puesta por OTRA COSA, no por lo que
    // esta celda dice. Se marca, aunque pueda ser una falsa alarma: inventarse
    // una dependencia cuesta una ejecución; perderla cuesta una cifra mala.
    const { celdas, grafo } = montar([
        ['a', 'base', 'SELECT 1'],
        ['b', 'hija', 'SELECT * FROM base'],
    ]);
    const f = frescura(celdas, grafo, { b: { en: 10, sql: 'SELECT * FROM base' } });
    comprobar('madre sin ejecutar contamina a la hija', est(f), { a: 'nunca', b: 'arriba' });
}
{
    // Tres niveles: lo que le pasa a la abuela llega a la nieta.
    const { celdas, grafo } = montar([
        ['a', 'abuela', 'SELECT 1'],
        ['b', 'madre', 'SELECT * FROM abuela'],
        ['c', 'nieta', 'SELECT * FROM madre'],
    ]);
    celdas[0].contenido = 'SELECT 2';
    const f = frescura(celdas, grafo, {
        a: { en: 1, sql: 'SELECT 1' },
        b: { en: 2, sql: 'SELECT * FROM abuela' },
        c: { en: 3, sql: 'SELECT * FROM madre' },
    });
    comprobar('la cascada llega hasta abajo', est(f), { a: 'cambiada', b: 'arriba', c: 'arriba' });
    comprobar('y el orden es abuela, madre, nieta', queActualizar(celdas, grafo, f).orden, ['a', 'b', 'c']);
}

// ── ciclos: no se cuelga, y se pueden señalar ───────────────────────────────
{
    const { celdas, grafo } = montar([
        ['a', 'uno', 'SELECT * FROM dos'],
        ['b', 'dos', 'SELECT * FROM uno'],
    ]);
    comprobar('un ciclo no pierde celdas del orden', ordenTopologico(celdas, grafo).sort(), ['a', 'b']);
    comprobar('y se puede decir cuáles están atrapadas', celdasEnCiclo(celdas, grafo).sort(), ['a', 'b']);
    comprobar('la frescura tampoco se cuelga', Object.keys(est(frescura(celdas, grafo, {}))).sort(), ['a', 'b']);
}
comprobar(
    'sin ciclos, nadie atrapado',
    celdasEnCiclo(...(() => { const m = montar([['a', 'x', 'SELECT 1'], ['b', 'y', 'SELECT * FROM x']]); return [m.celdas, m.grafo]; })()),
    [],
);

// ── bordes ──────────────────────────────────────────────────────────────────
{
    const { celdas, grafo } = montar([['t', null, '# Un título'], ['a', 'x', 'SELECT 1']]);
    comprobar('las celdas de texto no entran en el orden', ordenTopologico(celdas, grafo), ['a']);
    comprobar('ni en la frescura', Object.keys(est(frescura(celdas, grafo, {}))), ['a']);
}
{
    const { celdas, grafo } = montar([
        ['a', '', 'SELECT 1'],
        ['b', 'x', 'SELECT * FROM otra'],
    ]);
    comprobar('una celda sin nombre no crea dependencias', padresDe(grafo, 'b'), []);
    comprobar('pero sigue teniendo frescura propia', est(frescura(celdas, grafo, {})), { a: 'nunca', b: 'nunca' });
}
{
    // Dos celdas con el mismo nombre: la de arriba se queda el nombre en el
    // grafo. Es una ambigüedad del documento, no del grafo, y hace falta una
    // sola respuesta para poder ordenar.
    const { grafo } = montar([
        ['a', 'dup', 'SELECT 1'],
        ['b', 'dup', 'SELECT 2'],
        ['c', 'x', 'SELECT * FROM dup'],
    ]);
    comprobar('con nombres repetidos manda la primera', padresDe(grafo, 'c'), ['a']);
}
{
    const { celdas, grafo } = montar([]);
    comprobar('sin celdas no revienta', ordenTopologico(celdas, grafo), []);
    comprobar('ni la frescura', est(frescura(celdas, grafo, {})), {});
    comprobar('ni Actualizar', queActualizar(celdas, grafo, new Map()).orden, []);
}
{
    const { celdas, grafo } = montar([['a', 'x', 'SELECT 1']]);
    comprobar(
        'sin nada desactualizado, Actualizar no ejecuta nada',
        queActualizar(celdas, grafo, frescura(celdas, grafo, { a: { en: 1, sql: 'SELECT 1' } })).orden,
        [],
    );
    comprobar(
        'sin saber que esta vivo, una celda sin ejecutar se deja en paz',
        queActualizar(celdas, grafo, frescura(celdas, grafo, {})).orden,
        [],
    );
}

// ── el caso más común: reabrir el cuaderno al día siguiente ─────────────────
{
    // Ninguna celda está DESACTUALIZADA —están todas sin ejecutar, que no es lo
    // mismo— pero la sesión está vacía. Si Actualizar sólo mirara lo desfasado,
    // en el caso más común del mundo no haría nada.
    const { celdas, grafo, analisis } = montar([
        ['a', 'base', 'SELECT * FROM ventas'],
        ['b', 'hija', 'SELECT * FROM base'],
    ]);
    const f = frescura(celdas, grafo, {});
    comprobar(
        'al reabrir, Actualizar vuelve a poner lo que falta, en orden',
        queActualizar(celdas, grafo, f, { vivas: new Set(), analisis }).orden,
        ['a', 'b'],
    );
    comprobar(
        'lo que ya está vivo no se vuelve a ejecutar',
        queActualizar(celdas, grafo, f, { vivas: new Set(['base', 'hija']), analisis }).orden,
        [],
    );
    comprobar(
        'si falta sólo la de arriba, la de abajo entra por arrastre',
        queActualizar(celdas, grafo, f, { vivas: new Set(['hija']), analisis }).orden,
        ['a', 'b'],
    );

    // ── reabrir el ARCHIVO sin cerrar la aplicación ──────────────────────
    // La sesión sigue entera, así que las vistas están vivas; los resultados
    // no, porque viven en memoria. Mirando sólo las vistas, «Actualizar» se
    // apagaba mientras todas las celdas decían «Sin ejecutar».
    comprobar(
        'la vista viva NO basta si la celda no enseña nada',
        queActualizar(celdas, grafo, f, {
            vivas: new Set(['base', 'hija']), analisis, conResultado: new Set(),
        }).orden,
        ['a', 'b'],
    );
    comprobar(
        'y con la vista viva y el resultado en pantalla, no hay nada que hacer',
        queActualizar(celdas, grafo, f, {
            vivas: new Set(['base', 'hija']), analisis, conResultado: new Set(['a', 'b']),
        }).orden,
        [],
    );
    comprobar(
        'la que enseña algo pero perdió su vista sigue entrando',
        queActualizar(celdas, grafo, f, {
            vivas: new Set(['hija']), analisis, conResultado: new Set(['a', 'b']),
        }).orden,
        ['a', 'b'],
    );
    comprobar(
        'y si sólo a una le falta el resultado, la de abajo entra por arrastre',
        queActualizar(celdas, grafo, f, {
            vivas: new Set(['base', 'hija']), analisis, conResultado: new Set(['b']),
        }).orden,
        ['a', 'b'],
    );
}
{
    const { celdas, grafo, analisis } = montar([['a', '', 'SELECT 1']]);
    comprobar(
        'una celda sin nombre no deja nada, así que no entra por faltar',
        queActualizar(celdas, grafo, frescura(celdas, grafo, {}), { vivas: new Set(), analisis }).orden,
        [],
    );
}

// ── lo que escribe en disco se aparta ───────────────────────────────────────
{
    // Aquí el código se inclina al REVÉS que en el marcado. Marcar de más cuesta
    // una ejecución; ejecutar de más un INSERT duplica filas, y eso no se
    // deshace cerrando el proyecto.
    const { celdas, grafo, analisis } = montar([
        ['a', 'base', 'SELECT 1'],
        ['b', '', 'INSERT INTO registro SELECT * FROM base'],
        ['c', 'hija', 'SELECT * FROM base'],
    ]);
    celdas[0].contenido = 'SELECT 2';
    const f = frescura(celdas, grafo, {
        a: { en: 1, sql: 'SELECT 1' },
        b: { en: 2, sql: 'INSERT INTO registro SELECT * FROM base' },
        c: { en: 3, sql: 'SELECT * FROM base' },
    });
    const r = queActualizar(celdas, grafo, f, { vivas: new Set(), analisis });
    comprobar('la que escribe en disco no se ejecuta sola', r.orden, ['a', 'c']);
    comprobar('pero se devuelve para poder decirlo', r.apartadas, [{ id: 'b', motivo: 'escribe' }]);
    comprobar('y sigue marcada como desfasada', f.get('b'), 'arriba');
}
{
    // Dejar una vista en la SESIÓN no es escribir en disco: eso sí se rehace sin
    // consecuencias, y por eso no se aparta.
    const { celdas, grafo, analisis } = montar([
        ['a', 'x', 'CREATE OR REPLACE TEMP VIEW mia AS SELECT 1'],
    ]);
    const r = queActualizar(celdas, grafo, frescura(celdas, grafo, {}), { vivas: new Set(), analisis });
    comprobar('una vista propia escrita a mano no se aparta', r.apartadas, []);
}

// ── cambiar un parámetro desactualiza sin tocar una letra de la celda ───────
{
    // Es el caso que más fácil se cuela: la celda está idéntica, el resultado en
    // pantalla es el de septiembre, y el parámetro ya dice agosto.
    const { celdas, grafo } = montar([
        ['a', 'ventas', 'SELECT * FROM v WHERE f >= {{desde}}'],
        ['b', 'hija', 'SELECT * FROM ventas'],
    ]);
    const ejecuciones = {
        a: { en: 1, sql: "SELECT * FROM v WHERE f >= '2026-09-01'" },
        b: { en: 2, sql: 'SELECT * FROM ventas' },
    };
    comprobar(
        'con el mismo valor, al día',
        est(frescura(celdas, grafo, ejecuciones, {
            a: "SELECT * FROM v WHERE f >= '2026-09-01'",
            b: 'SELECT * FROM ventas',
        })),
        { a: 'dia', b: 'dia' },
    );
    comprobar(
        'cambiado el parámetro, la celda y lo que cuelga de ella',
        est(frescura(celdas, grafo, ejecuciones, {
            a: "SELECT * FROM v WHERE f >= '2026-08-01'",
            b: 'SELECT * FROM ventas',
        })),
        { a: 'cambiada', b: 'arriba' },
    );
    comprobar(
        'sin los textos resueltos, el marcador NO se entera',
        est(frescura(celdas, grafo, ejecuciones)),
        { a: 'cambiada', b: 'arriba' },
    );
}

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
