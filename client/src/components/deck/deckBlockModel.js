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
        label: 'Tira de métricas',
        lista: true,
        tope: 5,
        campos: [
            { id: 'label', label: 'Etiqueta', ejemplo: 'Coste' },
            { id: 'value', label: 'Valor', ejemplo: '$521,982' },
            { id: 'delta', label: 'Variación', ejemplo: '-3.3%' },
            { id: 'trend', label: 'Lectura', opciones: ['', 'good', 'flat', 'bad'] },
            { id: 'base', label: 'Base de comparación', ejemplo: 'vs. semestre anterior' },
            { id: 'highlight', label: 'Destacar', booleano: true },
        ],
    },
    metric: {
        label: 'Cifra ancla',
        lista: false,
        campos: [
            { id: 'value', label: 'Cifra', ejemplo: '90' },
            { id: 'unit', label: 'Unidad', ejemplo: '%' },
            { id: 'label', label: 'Qué significa', ejemplo: 'De todo lo que sube' },
        ],
    },
    steps: {
        label: 'Pasos',
        lista: true,
        campos: [
            { id: 'title', label: 'Paso', ejemplo: 'Congelar pujas' },
            { id: 'when', label: 'Cuándo', ejemplo: 'SEMANA 1' },
            { id: 'detail', label: 'Detalle', ejemplo: 'Sin tocar presupuesto' },
            { id: 'state', label: 'En curso', valorFijo: 'active', booleano: true },
        ],
    },
    actions: {
        label: 'Acciones',
        lista: true,
        campos: [
            { id: 'action', label: 'Qué hacer', ejemplo: 'Poner tope de coste por clic' },
            { id: 'why', label: 'Por qué', ejemplo: 'Concentran el 90 % del aumento' },
            { id: 'owner', label: 'Responsable', ejemplo: 'Marketing' },
            { id: 'due', label: 'Para cuándo', ejemplo: '21 ago' },
        ],
    },
    rank: {
        label: 'Tabla clasificada',
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
        if (n > 5) avisos.push('Con más de cinco, cada métrica baja de 240 unidades de diseño y deja de leerse.');
        if (n === 1) avisos.push('Una métrica sola es una cifra ancla: esa disposición la enseña mucho mejor.');
        const destacadas = (modelo.items || []).filter((k) => k.highlight).length;
        if (destacadas > 1) avisos.push('Destacar más de una es no destacar ninguna.');
    }

    if (lang === 'actions') {
        const sinDueno = (modelo.items || []).filter((a) => !a.owner).length;
        if (sinDueno) {
            avisos.push(`${sinDueno === 1 ? 'Una acción no tiene' : `${sinDueno} acciones no tienen`} responsable. Sin responsable no es una acción, es un deseo.`);
        }
    }

    if (lang === 'steps') {
        const activos = (modelo.items || []).filter((p) => p.state === 'active').length;
        if (activos > 1) avisos.push('Hay más de un paso en curso. El proceso se lee peor si no se sabe dónde estamos.');
    }

    if (lang === 'rank') {
        if (modelo.bar && !(modelo.columns || []).includes(modelo.bar)) {
            avisos.push(`La columna de la barra («${modelo.bar}») no está entre las columnas.`);
        }
        if (modelo.status && !(modelo.columns || []).includes(modelo.status)) {
            avisos.push(`La columna del semáforo («${modelo.status}») no está entre las columnas.`);
        }
        const anchos = new Set((modelo.rows || []).map((f) => f.length));
        if (anchos.size > 1) avisos.push('Hay filas con distinto número de celdas que las columnas.');
    }

    return avisos;
}

/** Sustituye el cuerpo de un bloque dentro de la prosa, dejándolo todo igual. */
export function reemplazarBloque(texto, bloque, cuerpoNuevo) {
    return reemplazarCercado(texto, bloque, cuerpoNuevo);
}
