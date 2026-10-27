/**
 * Capas listas para el modo Código (5.17, Dec-72): lo que más se añade a mano a
 * una figura —la media, la mediana, las cifras sobre las marcas, una recta de
 * regresión— sin tener que escribirlo. Funciones PURAS: reciben el spec y
 * devuelven otro.
 *
 * Si la figura es de una sola vista (`mark` + `encoding`), se convierte primero en
 * capas: la vista original pasa a ser la primera capa, intacta.
 */

/** Los canales de posición de la primera capa con datos: cuál es la medida y cuál la categoría. */
export function ejesDe(spec) {
    const base = spec.layer ? spec.layer.find(c => c.encoding?.x || c.encoding?.y) : spec;
    const enc = { ...(spec.encoding || {}), ...(base?.encoding || {}) };
    const x = enc.x, y = enc.y;
    if (!x?.field && !y?.field) return null;
    // La medida es el canal cuantitativo; si los dos lo son (dispersión), la Y.
    const medida = y?.type === 'quantitative' ? 'y' : x?.type === 'quantitative' ? 'x' : 'y';
    const otra = medida === 'y' ? 'x' : 'y';
    return { medida, otra, encMedida: enc[medida], encOtra: enc[otra] };
}

/** Una vista suelta → capas, conservando lo que es de la figura entera. */
function enCapas(spec) {
    if (spec.layer) return { ...spec, layer: [...spec.layer] };
    const { mark, encoding, transform, params, selection, ...resto } = spec;
    const capa = { mark, ...(encoding ? { encoding } : {}), ...(params ? { params } : {}) };
    return { ...resto, ...(transform ? { transform } : {}), layer: [capa] };
}

export const CAPAS = [
    { id: 'media', etiqueta: 'Mean line' },
    { id: 'mediana', etiqueta: 'Median line' },
    { id: 'etiquetas', etiqueta: 'Value labels' },
    { id: 'regresion', etiqueta: 'Regression line' },
];

/** ¿Tiene sentido esta capa en esta figura? (para no ofrecer lo que no se puede). */
export function capaPosible(spec, id) {
    const e = spec && ejesDe(spec);
    if (!e || !e.encMedida?.field) return false;
    if (id === 'regresion') {
        // Fila a fila: con cubos o con una medida ya agregada no hay puntos que ajustar.
        const t = e.encOtra?.type;
        return !!e.encOtra?.field && (t === 'quantitative' || t === 'temporal')
            && !e.encOtra.bin && !e.encMedida.aggregate && !e.encOtra.aggregate;
    }
    return true;
}

export function anadirCapa(spec, id, { color = '#ef4444' } = {}) {
    const e = ejesDe(spec);
    if (!e || !capaPosible(spec, id)) return spec;
    const nuevo = enCapas(spec);
    const campoMedida = e.encMedida.field;
    if (id === 'media' || id === 'mediana') {
        const op = id === 'media' ? 'mean' : 'median';
        nuevo.layer.push({
            mark: { type: 'rule', color, strokeWidth: 2, ...(op === 'median' ? { strokeDash: [5, 3] } : {}) },
            // null en la otra posición y en el color: si la figura los define arriba,
            // la regla los heredaría y saldría una por categoría.
            encoding: { [e.medida]: { aggregate: op, field: campoMedida, type: 'quantitative' }, ...(spec.encoding ? { [e.otra]: null, color: null } : {}) },
        });
    } else if (id === 'etiquetas') {
        const horizontal = e.medida === 'x';
        nuevo.layer.push({
            mark: { type: 'text', ...(horizontal ? { align: 'left', dx: 4 } : { baseline: 'bottom', dy: -4 }) },
            encoding: {
                [e.otra]: e.encOtra,
                [e.medida]: { ...e.encMedida, stack: null },
                text: { field: campoMedida, type: 'quantitative', ...(e.encMedida.aggregate ? { aggregate: e.encMedida.aggregate } : {}), format: ',.4~g' },
            },
        });
    } else if (id === 'regresion') {
        nuevo.layer.push({
            transform: [{ regression: campoMedida, on: e.encOtra.field }],
            mark: { type: 'line', color, strokeWidth: 2 },
            encoding: { [e.otra]: { field: e.encOtra.field, type: e.encOtra.type }, [e.medida]: { field: campoMedida, type: 'quantitative' } },
        });
    }
    return nuevo;
}
