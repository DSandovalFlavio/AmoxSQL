/**
 * Los acentos de la aplicación, en un solo sitio.
 *
 * Vivían dentro de `SettingsModal.jsx`, que son 97 KB de interfaz de ajustes.
 * Cuando el inspector del deck necesitó la misma lista había dos salidas —
 * importar el modal entero para leer dos arrays, o copiarlos— y las dos son
 * malas: la primera arrastra medio megabyte de dependencias a una columna
 * lateral, y la segunda garantiza que dentro de tres meses las dos listas
 * digan cosas distintas.
 *
 * El `color` de cada entrada es **la muestra del selector**, no el valor real
 * del tema: el acento se compone en CSS y cambia con el modo claro u oscuro.
 * Quien necesite el color de verdad —para medir contraste, por ejemplo— tiene
 * que resolverlo del DOM; ver `deck/deckColor.js`.
 */

// 6.0 (auditoría de color, docs/dev/auditoria_color_2026-11.md): diez vivos
// que recorren el círculo y seis sobrios que no repiten el tono de ninguno. Los
// ids retirados se traducen en theme.js → migrateAccent, así que quien tenía
// uno guardado (o un deck que lo nombra) sigue teniendo un acento.
// El acento «del tema» (`tema`) no está aquí: no es un color, es no elegir.
export const VIBRANT_ACCENTS = [
    { id: 'cyan', color: '#22d3ee', label: 'Cyan' },
    { id: 'blue', color: '#69a5fe', label: 'Blue' },
    { id: 'violet', color: '#ad8dfd', label: 'Violet' },
    { id: 'magenta', color: '#f46bdb', label: 'Magenta' },
    { id: 'pink', color: '#fe85a4', label: 'Pink' },
    { id: 'red', color: '#ff525b', label: 'Neon red' },
    { id: 'orange', color: '#ff8f4b', label: 'Orange' },
    { id: 'yellow', color: '#f7d22a', label: 'Yellow' },
    { id: 'lime', color: '#abe841', label: 'Lime' },
    { id: 'green', color: '#30d882', label: 'Green' },
];

export const SOBER_ACCENTS = [
    { id: 'sage', color: '#94b594', label: 'Sage', checkColor: '#000' },
    { id: 'sand', color: '#d4bb86', label: 'Sand', checkColor: '#000' },
    { id: 'clay', color: '#d28973', label: 'Clay', checkColor: '#000' },
    { id: 'mauve', color: '#c592b3', label: 'Mauve', checkColor: '#000' },
    { id: 'steel', color: '#85a2c0', label: 'Steel', checkColor: '#000' },
    { id: 'graphite', color: '#c1c4c9', label: 'Graphite', checkColor: '#000' },
];

/** Los dos grupos seguidos, para quien sólo necesita recorrerlos todos. */
export const ACCENTS = [...VIBRANT_ACCENTS, ...SOBER_ACCENTS];
