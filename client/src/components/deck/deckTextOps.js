/**
 * Las operaciones de texto de una región: negrita, listas, enlaces y el menú
 * de inserción.
 *
 * Todo lo de aquí son **funciones puras sobre una cadena y un par de índices**.
 * No tocan el DOM, no saben que existe React y no dependen de un `textarea`.
 * Es deliberado: son la clase de código que se rompe en los bordes —una
 * selección vacía, una marca ya puesta, el cursor justo en el límite— y esos
 * bordes se prueban en un segundo desde Node y no se prueban nunca pinchando.
 *
 * El menú de inserción reaprovecha el catálogo del editor de documentos
 * (`markdownInsertables.js`, que no tiene ni una referencia a Monaco) pero NO
 * su widget: aquél está montado sobre el proveedor de completado de Monaco y
 * las regiones del deck son `<textarea>`. Lo que se reimplementa es el disparo,
 * el filtrado y la inserción — unas cien líneas, aquí abajo.
 */
import { INSERTABLES, GROUPS as GRUPOS_COMPARTIDOS, snippetFor } from '../markdown/markdownInsertables.js';

/* ── Marcas que envuelven ────────────────────────────────────────────────── */

/**
 * Pone o quita una marca alrededor de la selección.
 *
 * Quitar es tan importante como poner: una barra de formato que sólo sabe
 * añadir obliga a borrar a mano, y entonces la gente deja de usarla y vuelve a
 * escribir los asteriscos.
 *
 * Con la selección vacía deja el cursor ENTRE las dos marcas, que es lo que se
 * espera al pulsar Ctrl+B antes de escribir.
 */
export function alternarMarca(texto, ini, fin, marca) {
    const t = texto || '';
    const n = marca.length;

    // ¿La selección ya está envuelta, por dentro o por fuera?
    const dentro = t.slice(ini, fin);
    if (dentro.startsWith(marca) && dentro.endsWith(marca) && dentro.length >= n * 2) {
        const limpio = dentro.slice(n, -n);
        return { texto: t.slice(0, ini) + limpio + t.slice(fin), selDesde: ini, selHasta: ini + limpio.length };
    }
    if (t.slice(ini - n, ini) === marca && t.slice(fin, fin + n) === marca) {
        return {
            texto: t.slice(0, ini - n) + dentro + t.slice(fin + n),
            selDesde: ini - n,
            selHasta: ini - n + dentro.length,
        };
    }

    const nuevo = t.slice(0, ini) + marca + dentro + marca + t.slice(fin);
    return { texto: nuevo, selDesde: ini + n, selHasta: ini + n + dentro.length };
}

/* ── Prefijos de línea ───────────────────────────────────────────────────── */

/** Los límites de las líneas que toca la selección. */
function lineasTocadas(t, ini, fin) {
    const desde = t.lastIndexOf('\n', ini - 1) + 1;
    const corte = t.indexOf('\n', fin);
    const hasta = corte === -1 ? t.length : corte;
    return { desde, hasta };
}

/**
 * Pone o quita un prefijo en cada línea de la selección. Si TODAS lo llevan ya,
 * lo quita; si alguna no, lo pone en todas — que es lo que espera quien
 * selecciona un párrafo a medio convertir en lista.
 */
export function alternarPrefijo(texto, ini, fin, prefijo) {
    const t = texto || '';
    const { desde, hasta } = lineasTocadas(t, ini, fin);
    const bloque = t.slice(desde, hasta);
    const lineas = bloque.split('\n');
    const conAlgo = lineas.filter((l) => l.trim());
    const todasLoLlevan = conAlgo.length > 0 && conAlgo.every((l) => l.startsWith(prefijo));

    const nuevas = lineas.map((l) => {
        if (!l.trim()) return l;
        if (todasLoLlevan) return l.slice(prefijo.length);
        return prefijo + l;
    });
    const nuevoBloque = nuevas.join('\n');
    return {
        texto: t.slice(0, desde) + nuevoBloque + t.slice(hasta),
        selDesde: desde,
        selHasta: desde + nuevoBloque.length,
    };
}

/* ── Enlace ──────────────────────────────────────────────────────────────── */

/**
 * `[texto](destino)`. Con algo seleccionado, lo seleccionado es el texto y
 * queda marcado el destino, que es lo que hay que teclear a continuación.
 */
export function insertarEnlace(texto, ini, fin) {
    const t = texto || '';
    const sel = t.slice(ini, fin);
    const etiqueta = sel || 'texto';
    const destino = 'https://';
    const nuevo = `${t.slice(0, ini)}[${etiqueta}](${destino})${t.slice(fin)}`;
    const abre = ini + 1 + etiqueta.length + 2;
    return { texto: nuevo, selDesde: abre, selHasta: abre + destino.length };
}

/* ── El menú de inserción ────────────────────────────────────────────────── */

/**
 * `/` más lo tecleado detrás, y sólo si antes hay principio de línea o espacio.
 * Igual que en el editor de documentos: así escribir una ruta (`docs/dev`) o
 * una fracción (`y/o`) no abre el menú.
 */
export const DISPARO_RE = /(?:^|\s)\/([\p{L}\d-]*)$/u;

/** ¿Hay un disparo justo antes del cursor? Devuelve dónde empieza y qué se ha tecleado. */
export function detectarDisparo(texto, caret) {
    const antes = (texto || '').slice(0, caret);
    const m = antes.match(DISPARO_RE);
    if (!m) return null;
    return { desde: caret - m[1].length - 1, consulta: m[1] };
}

/**
 * Las entradas que casan con lo tecleado, agrupadas y en el orden del catálogo.
 * El filtrado es por subcadena sobre etiqueta y palabras clave — sin difuso: un
 * menú que adivina demasiado enseña cosas que nadie pidió.
 */
export function filtrarInsertables(consulta) {
    const q = (consulta || '').trim().toLowerCase();
    const casa = (it) => !q
        || it.label.toLowerCase().includes(q)
        || (it.keywords || '').toLowerCase().includes(q)
        || it.id.toLowerCase().includes(q);

    const encontrados = INSERTABLES.filter(casa);
    return GRUPOS_COMPARTIDOS
        .map((g) => ({ ...g, items: encontrados.filter((it) => it.group === g.id) }))
        .filter((g) => g.items.length > 0);
}

/** Plana, que es lo que necesita la navegación con flechas. */
export function aplanar(grupos) {
    return grupos.flatMap((g) => g.items);
}

/**
 * Resuelve las paradas de tabulación de un snippet.
 *
 * Un `textarea` no sabe de paradas —eso lo daba gratis Monaco—, así que se
 * queda con el texto por defecto de cada una y se **selecciona la primera**:
 * el usuario escribe encima y sigue. Es menos que en el editor de documentos y
 * se dice aquí para que nadie lo descubra esperando el tabulador.
 *
 * Sólo cuentan las formas con llaves, `${'$'}{1}` y `${'$'}{1:texto}`. La forma
 * corta `${'$'}1` NO se toca, y eso no es una omisión: un deck habla de dinero
 * todo el rato y `${'$'}1.24M` es indistinguible de una parada. La versión que
 * la borraba convertía «$1.24M» en «.24M» —visto al insertar la tira de
 * métricas—, que es corromper un dato por ahorrarse una llave.
 */
export function resolverParadas(snippet) {
    const s = snippet || '';
    const quitarLlaves = (x) => x
        .replace(/\$\{\d+:([^}]*)\}/g, '$1')
        .replace(/\$\{\d+\}/g, '');

    const m = s.match(/\$\{(\d+):([^}]*)\}/);
    const limpio = quitarLlaves(s);
    if (!m) return { texto: limpio, offset: limpio.length, largo: 0 };

    // Dónde cae la primera parada una vez quitadas todas las llaves.
    return { texto: limpio, offset: quitarLlaves(s.slice(0, m.index)).length, largo: m[2].length };
}

/**
 * Sustituye el disparo por el snippet elegido y dice dónde dejar la selección.
 */
export function aplicarInsercion(texto, disparo, caret, item, contexto = {}) {
    const t = texto || '';
    const { texto: cuerpo, offset, largo } = resolverParadas(snippetFor(item, contexto));
    const nuevo = t.slice(0, disparo.desde) + cuerpo + t.slice(caret);
    return {
        texto: nuevo,
        selDesde: disparo.desde + offset,
        selHasta: disparo.desde + offset + largo,
    };
}

/* ── El catálogo de la lámina ────────────────────────────────────────────── */

/**
 * Lo que se puede insertar EN UNA LÁMINA, que no es lo mismo que en un
 * documento.
 *
 * El catálogo compartido (`markdownInsertables.js`) se reaprovecha, pero tal
 * cual mentía por los dos lados: ofrecía cosas que en una diapositiva no
 * significan nada —la cabecera del documento, el índice, las casillas de
 * tarea— y **no ofrecía los cinco bloques de dato del deck**, que son la única
 * forma de meter métricas en una lámina y hasta hoy había que teclearlos como
 * YAML dentro de una cerca. Escribir `/metr` y que no salga nada es peor que no
 * tener menú.
 */
const F = '`' + '`' + '`';

const SOLO_DOCUMENTO = new Set(['cabecera', 'indice', 'tarea', 'verificacion', 'fecha']);

export const INSERTABLES_LAMINA = [
    {
        id: 'kpis', label: 'Tira de métricas', group: 'dato', detail: '2 a 5',
        keywords: 'kpi metrica metricas cifra variacion delta resumen',
        snippet: `${F}kpis\n- label: \${1:Coste}\n  value: $1.24M\n  delta: +18.4%\n  trend: bad\n  base: vs. periodo anterior\n- label: Clics\n  value: 486K\n  delta: +6.1%\n${F}`,
    },
    {
        id: 'metric', label: 'Cifra ancla', group: 'dato', detail: 'una sola',
        keywords: 'metric numero grande dato ancla',
        snippet: `${F}metric\nvalue: \${1:64}\nunit: "%"\nlabel: Qué significa esta cifra\n${F}`,
    },
    {
        id: 'rank', label: 'Tabla clasificada', group: 'dato', detail: 'con barra',
        keywords: 'rank tabla ranking top barra semaforo',
        snippet: `${F}rank\ncolumns: [Nombre, Valor, Peso]\nbar: Peso\nhighlight: 1\nrows:\n  - [\${1:Primero}, $284K, 59]\n  - [Segundo, $231K, 41]\n${F}`,
    },
    {
        id: 'acciones', label: 'Acciones', group: 'dato', detail: 'con responsable',
        keywords: 'actions acciones decisiones responsable fecha',
        snippet: `${F}actions\n- action: \${1:Qué hay que hacer}\n  why: Por qué\n  owner: Quién\n  due: Cuándo\n${F}`,
    },
    {
        id: 'figura', label: 'Figura de Story Flow', group: 'contenido',
        keywords: 'grafico chart amoxvis figura visualizacion',
        snippet: `${F}amoxchart\nsrc: \${1:galeria_graficos/01_columnas.amoxvis}\n${F}`,
    },
];

const GRUPOS_LAMINA = [
    { id: 'dato', label: 'Dato' },
    { id: 'contenido', label: 'Contenido' },
    ...GRUPOS_COMPARTIDOS,
];

/** Igual que `filtrarInsertables`, pero con el catálogo de la lámina. */
export function filtrarParaLamina(consulta) {
    const q = (consulta || '').trim().toLowerCase();
    const casa = (it) => !q
        || it.label.toLowerCase().includes(q)
        || (it.keywords || '').toLowerCase().includes(q)
        || it.id.toLowerCase().includes(q);

    const compartidos = INSERTABLES.filter((it) => !SOLO_DOCUMENTO.has(it.id));
    const todos = [...INSERTABLES_LAMINA, ...compartidos];
    const encontrados = todos.filter(casa);

    return GRUPOS_LAMINA
        .map((g) => ({ ...g, items: encontrados.filter((it) => it.group === g.id) }))
        .filter((g) => g.items.length > 0);
}
