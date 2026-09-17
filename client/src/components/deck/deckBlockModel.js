/**
 * Los cinco bloques de dato de una lámina, como datos y no como texto.
 *
 * `kpis`, `metric`, `steps`, `actions` y `rank` son la única forma de meter
 * cifras estructuradas en una diapositiva, y hasta la fase 4 la única forma de
 * escribirlos era teclear YAML dentro de una cerca — con la ortografía exacta
 * de cada clave y sin saber cuáles existen. Era la distancia más larga entre lo
 * que el usuario quiere y lo que tiene que hacer.
 *
 * Este módulo es el puente: encuentra los bloques de un texto, los lee a un
 * modelo con nombres, y los vuelve a escribir. Puro, sin React y sin DOM, para
 * poder ejercitarlo desde Node.
 *
 * **Sobre reescribir el YAML.** Aquí sí se vuelca con `js-yaml`, a diferencia
 * del front-matter, y es una decisión consciente y no un descuido: el
 * front-matter es la cabecera de un archivo que alguien escribió a mano y suele
 * llevar comentarios, mientras que estos bloques son listas de registros que el
 * formulario va a reescribir enteras de todas formas. Aun así sólo se reescribe
 * el bloque que se toca, nunca el resto de la prosa — y quien prefiera el YAML
 * a mano lo sigue teniendo, porque el formulario es un camino más y no el único.
 */
import yaml from 'js-yaml';
import { bloquesCercados, cercadoEnCursor, reemplazarCercado } from '../markdown/fencedBlocks.js';

/** Los campos de cada bloque, en el orden en que se piden. */
export const BLOQUES = {
    kpis: {
        label: 'Metric strip',
        lista: true,
        tope: 5,
        campos: [
            { id: 'label', label: 'Label', ejemplo: 'Cost' },
            { id: 'value', label: 'Value', ejemplo: '$521,982' },
            { id: 'delta', label: 'Change', ejemplo: '-3.3%' },
            { id: 'trend', label: 'Reading', opciones: ['', 'good', 'flat', 'bad'] },
            { id: 'base', label: 'Compared with', ejemplo: 'vs. previous half' },
            { id: 'highlight', label: 'Highlight', booleano: true },
        ],
    },
    metric: {
        label: 'Anchor figure',
        lista: false,
        campos: [
            { id: 'value', label: 'Figure', ejemplo: '90' },
            { id: 'unit', label: 'Unit', ejemplo: '%' },
            { id: 'label', label: 'What it means', ejemplo: 'Of everything that is rising' },
        ],
    },
    steps: {
        label: 'Steps',
        lista: true,
        campos: [
            { id: 'title', label: 'Step', ejemplo: 'Freeze bids' },
            { id: 'when', label: 'When', ejemplo: 'WEEK 1' },
            { id: 'detail', label: 'Detail', ejemplo: 'Without touching the budget' },
            { id: 'state', label: 'In progress', valorFijo: 'active', booleano: true },
        ],
    },
    actions: {
        label: 'Actions',
        lista: true,
        campos: [
            { id: 'action', label: 'What to do', ejemplo: 'Cap the cost per click' },
            { id: 'why', label: 'Why', ejemplo: 'They hold 90 % of the increase' },
            { id: 'owner', label: 'Owner', ejemplo: 'Marketing' },
            { id: 'due', label: 'Due', ejemplo: 'Aug 21' },
        ],
    },
    rank: {
        label: 'Ranked table',
        lista: false,
        tabla: true,
    },
};

export const LENGUAJES = Object.keys(BLOQUES);

/**
 * Todos los bloques de dato que hay en un texto, en orden.
 *
 * El recorrido de cercas vive en `markdown/fencedBlocks.js` desde que
 * AmoxDiagram necesitó lo mismo para los bloques ` ```mermaid `. Aquí queda
 * sólo lo que es del deck: qué lenguajes cuentan como bloque de dato.
 */
export function bloquesDe(texto) {
    return bloquesCercados(texto, LENGUAJES);
}

/** El bloque donde está el cursor, si lo hay. Una sola expresión para los dos. */
export function bloqueEnCursor(texto, caret) {
    return cercadoEnCursor(texto, caret, LENGUAJES);
}

/** El cuerpo de un bloque, leído a un modelo con nombres. */
export function leerBloque(lang, cuerpo) {
    let datos = null;
    try {
        datos = yaml.load(cuerpo || '');
    } catch {
        return { error: 'el YAML de este bloque no se entiende', items: [], campos: {} };
    }

    if (lang === 'rank') {
        const columns = Array.isArray(datos?.columns) ? datos.columns.map(String) : [];
        const rows = Array.isArray(datos?.rows) ? datos.rows.map((f) => (Array.isArray(f) ? f : [f])) : [];
        return {
            error: null,
            columns,
            rows,
            bar: datos?.bar || '',
            status: datos?.status || '',
            highlight: Number(datos?.highlight) || 0,
        };
    }

    if (!BLOQUES[lang]?.lista) {
        return { error: null, campos: (datos && typeof datos === 'object') ? { ...datos } : {} };
    }

    const items = Array.isArray(datos) ? datos : (Array.isArray(datos?.items) ? datos.items : []);
    return { error: null, items: items.map((x) => ({ ...(x || {}) })) };
}

/**
 * El modelo, de vuelta a YAML.
 *
 * Las claves vacías se tiran: dejar `delta: ''` en el archivo hace que el
 * renderizador pinte una pastilla de variación en blanco, que es peor que no
 * pintar nada.
 */
export function escribirBloque(lang, modelo) {
    const limpiar = (o) => Object.fromEntries(
        Object.entries(o || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false),
    );

    const opciones = { lineWidth: -1, flowLevel: -1 };

    if (lang === 'rank') {
        // La tabla se compone a mano y no con un volcado entero, porque su forma
        // tiene DOS profundidades que hay que tratar distinto y `flowLevel` sólo
        // sabe de una: `columns` va en línea, y `rows` va en bloque pero con
        // cada fila en línea. Con `flowLevel: 1` la tabla entera cabía en un
        // renglón —ilegible en cuanto hay diez filas— y con `2` las columnas se
        // desplegaban una por renglón.
        //
        // El entrecomillado de cada celda sigue siendo cosa de js-yaml: es quien
        // sabe que `y` es un booleano en YAML 1.1 y hay que protegerla.
        const enLinea = (arr) => yaml.dump(arr, { ...opciones, flowLevel: 0 }).replace(/\s*$/, '');
        const lineas = [`columns: ${enLinea(modelo.columns || [])}`];
        if (modelo.bar) lineas.push(`bar: ${modelo.bar}`);
        if (modelo.status) lineas.push(`status: ${modelo.status}`);
        if (modelo.highlight) lineas.push(`highlight: ${modelo.highlight}`);
        lineas.push('rows:');
        for (const fila of modelo.rows || []) lineas.push(`  - ${enLinea(fila)}`);
        return lineas.join('\n');
    }

    if (!BLOQUES[lang]?.lista) {
        return yaml.dump(limpiar(modelo.campos), opciones).replace(/\s*$/, '');
    }

    // Los registros vacíos se CONSERVAN, aunque el YAML quede con un `- {}`.
    //
    // La primera versión los descartaba por limpieza, y el efecto era que
    // «Añadir métrica» no hacía nada: el formulario creaba el registro, el
    // serializador lo tiraba por no tener claves, y al releer volvían a ser
    // cuatro. Un botón que no responde es peor que una línea fea en el archivo,
    // y la línea dura lo que tarde el usuario en escribir encima.
    const items = (modelo.items || []).map(limpiar);
    if (!items.length) return '';
    return yaml.dump(items, opciones).replace(/\s*$/, '');
}

/**
 * Las reglas del contrato visual, dichas donde se están rompiendo.
 *
 * Van aquí y no en la documentación a propósito: nadie lee el contrato visual
 * antes de añadir la sexta métrica. Son avisos, no prohibiciones — el autor
 * puede tener un motivo y la lámina se seguirá pintando.
 */
export function avisosDe(lang, modelo) {
    const avisos = [];

    if (lang === 'kpis') {
        const n = (modelo.items || []).length;
        if (n > 5) avisos.push('Past five, each metric drops below 240 design units and stops being readable.');
        if (n === 1) avisos.push('A single metric is an anchor figure: that layout shows it far better.');
        const destacadas = (modelo.items || []).filter((k) => k.highlight).length;
        if (destacadas > 1) avisos.push('Highlighting more than one is highlighting none.');
    }

    if (lang === 'actions') {
        const sinDueno = (modelo.items || []).filter((a) => !a.owner).length;
        if (sinDueno) {
            avisos.push(`${sinDueno === 1 ? 'One action has' : `${sinDueno} actions have`} no owner. With no owner it is not an action, it is a wish.`);
        }
    }

    if (lang === 'steps') {
        const activos = (modelo.items || []).filter((p) => p.state === 'active').length;
        if (activos > 1) avisos.push('More than one step is in progress. The process reads worse when nobody can tell where we are.');
    }

    if (lang === 'rank') {
        if (modelo.bar && !(modelo.columns || []).includes(modelo.bar)) {
            avisos.push(`The bar column ("${modelo.bar}") is not among the columns.`);
        }
        if (modelo.status && !(modelo.columns || []).includes(modelo.status)) {
            avisos.push(`The status column ("${modelo.status}") is not among the columns.`);
        }
        const anchos = new Set((modelo.rows || []).map((f) => f.length));
        if (anchos.size > 1) avisos.push('Some rows have a different number of cells than there are columns.');
    }

    return avisos;
}

/** Sustituye el cuerpo de un bloque dentro de la prosa, dejándolo todo igual. */
export function reemplazarBloque(texto, bloque, cuerpoNuevo) {
    return reemplazarCercado(texto, bloque, cuerpoNuevo);
}
