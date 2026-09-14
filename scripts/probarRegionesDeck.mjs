/**
 * Ejercita `deckRegions.js` — el modelo de regiones de una lámina.
 *
 *     node scripts/probarRegionesDeck.mjs
 *
 * El repositorio no tiene banco de pruebas y esto no pretende estrenarlo: es
 * un archivo suelto que se ejecuta a mano. Existe porque `leerParte` y
 * `escribirParte` son la bisagra por la que pasa **toda** edición de una
 * lámina, y un fallo ahí no se ve —se traga un trozo de prosa y el archivo
 * sigue siendo markdown válido—. Comprobarlo abriendo la aplicación y mirando
 * es justo lo que no funciona con un fallo silencioso.
 *
 * Lo que cubre, y por qué cada cosa:
 *   · CRLF, que es como llega un .amoxdeck guardado en Windows y que ya rompió
 *     el reparto en dos columnas una vez.
 *   · El ida y vuelta: leer una parte y volver a escribirla no cambia nada.
 *   · Que escribir una parte devuelva la prosa COMPLETA, que es lo que impide
 *     que una región parta el archivo.
 */
import {
    PARTES, leerParte, escribirParte, regionesDe, admiteFigura, partirCabecera,
} from '../client/src/components/deck/deckRegions.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};

// ── leer ────────────────────────────────────────────────────────────────────
const hallazgo = `## El coste mensual no tiene tendencia: tiene picos

Serie mensual del periodo completo. Lo que se mueve son meses sueltos.

> Este paga **$41,06** por cada mil clics.`;

eq('cabecera lleva título + bajada',
    leerParte(hallazgo, PARTES.CABECERA),
    '## El coste mensual no tiene tendencia: tiene picos\n\nSerie mensual del periodo completo. Lo que se mueve son meses sueltos.');
eq('resto es lo que queda',
    leerParte(hallazgo, PARTES.RESTO),
    '> Este paga **$41,06** por cada mil clics.');
eq('todo es todo', leerParte(hallazgo, PARTES.TODO), hallazgo);

const doscol = `## Si es de mezcla

- Público más caro

<!-- col -->

## Si es de puja

- Subimos pujas`;
eq('col-a', leerParte(doscol, PARTES.COL_A), '## Si es de mezcla\n\n- Público más caro');
eq('col-b', leerParte(doscol, PARTES.COL_B), '## Si es de puja\n\n- Subimos pujas');

// CRLF, que es lo que llega de un .amoxdeck guardado en Windows
const crlf = doscol.replace(/\n/g, '\r\n');
eq('col-a con CRLF', leerParte(crlf, PARTES.COL_A), '## Si es de mezcla\r\n\r\n- Público más caro');
eq('col-b con CRLF llega', leerParte(crlf, PARTES.COL_B).includes('Si es de puja'), true);

// ── escribir: la prosa vuelve COMPLETA ──────────────────────────────────────
eq('escribir cabecera conserva el resto',
    escribirParte(hallazgo, PARTES.CABECERA, '## Otro título'),
    '## Otro título\n\n> Este paga **$41,06** por cada mil clics.');
eq('escribir resto conserva la cabecera',
    escribirParte(hallazgo, PARTES.RESTO, 'Nuevo cuerpo.'),
    '## El coste mensual no tiene tendencia: tiene picos\n\nSerie mensual del periodo completo. Lo que se mueve son meses sueltos.\n\nNuevo cuerpo.');
eq('escribir col-a conserva col-b y el marcador',
    escribirParte(doscol, PARTES.COL_A, '## Izquierda nueva'),
    '## Izquierda nueva\n\n<!-- col -->\n\n## Si es de puja\n\n- Subimos pujas');

// ── ida y vuelta: leer y volver a escribir lo mismo no cambia nada ──────────
for (const [nombre, texto, partes] of [
    ['hallazgo', hallazgo, [PARTES.CABECERA, PARTES.RESTO]],
    ['dos columnas', doscol, [PARTES.COL_A, PARTES.COL_B]],
]) {
    for (const parte of partes) {
        const vuelta = escribirParte(texto, parte, leerParte(texto, parte));
        eq(`ida y vuelta ${nombre}/${parte}`, vuelta.replace(/\s+/g, ' ').trim(), texto.replace(/\s+/g, ' ').trim());
    }
}

// ── casos de borde ──────────────────────────────────────────────────────────
eq('sin título, la cabecera va vacía', leerParte('Sólo cuerpo.', PARTES.CABECERA), '');
eq('sin título, el resto es todo', leerParte('Sólo cuerpo.', PARTES.RESTO), 'Sólo cuerpo.');
eq('escribir cabecera donde no había la antepone',
    escribirParte('Sólo cuerpo.', PARTES.CABECERA, '## Nuevo'),
    '## Nuevo\n\nSólo cuerpo.');
eq('un ## a mitad NO es cabecera', partirCabecera('Texto\n\n## No es la afirmación').cabecera, '');
eq('vaciar una parte no deja huecos',
    escribirParte(hallazgo, PARTES.RESTO, ''),
    '## El coste mensual no tiene tendencia: tiene picos\n\nSerie mensual del periodo completo. Lo que se mueve son meses sueltos.');
eq('prosa nula no revienta', leerParte(null, PARTES.CABECERA), '');
eq('sin marcador, col-b va vacía', leerParte('Una sola columna', PARTES.COL_B), '');

// ── la tabla ────────────────────────────────────────────────────────────────
eq('hallazgo tiene 4 regiones', regionesDe('finding').length, 4);
eq('el orden del tabulador es de lectura',
    regionesDe('finding').map(r => r.id), ['eyebrow', 'claim', 'detalle', 'figura']);
eq('la portada no lleva antetítulo', regionesDe('cover').some(r => r.id === 'eyebrow'), false);
eq('una disposición desconocida cae en contenido',
    regionesDe('inventada').map(r => r.id), regionesDe('content').map(r => r.id));
eq('admiteFigura: hallazgo sí', admiteFigura('finding'), true);
eq('admiteFigura: rejilla sí', admiteFigura('chart-grid'), true);
eq('admiteFigura: sección no', admiteFigura('section'), false);
eq('la rejilla topa en 4', regionesDe('chart-grid').find(r => r.tipo === 'figuras').tope, 4);
eq('comparar topa en 2', regionesDe('compare').find(r => r.tipo === 'figuras').tope, 2);

// toda región de texto declara su parte, y toda parte es conocida
const conocidas = new Set(Object.values(PARTES));
let partesMal = [];
for (const [layout, regs] of Object.entries((await import('../client/src/components/deck/deckRegions.js')).REGIONES_POR_DISPOSICION)) {
    for (const r of regs) {
        if (r.tipo === 'texto' && !conocidas.has(r.parte)) partesMal.push(`${layout}/${r.id}`);
        if (!r.nombre || !r.id) partesMal.push(`${layout}/sin nombre o id`);
    }
}
eq('todas las regiones de texto declaran una parte conocida', partesMal, []);

console.log(`\n${ok} pasan, ${mal} fallan`);
process.exit(mal ? 1 : 0);
