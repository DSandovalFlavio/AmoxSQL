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

// 6.0 (M9): ocho tonos que recorren el círculo cromático. Los ids viejos
// (amox-2…10, linear, islands: siete azules) se traducen en theme.js →
// migrateAccent, así que quien tenía uno guardado sigue teniendo un acento.
export const VIBRANT_ACCENTS = [
    { id: 'cyan', color: '#22d3ee', label: 'Cyan (Default)' },
    { id: 'blue', color: '#69a5fe', label: 'Blue' },
    { id: 'violet', color: '#ad8dfd', label: 'Violet' },
    { id: 'magenta', color: '#f968d0', label: 'Magenta' },
    { id: 'red', color: '#fd736d', label: 'Red' },
    { id: 'orange', color: '#ff9138', label: 'Orange' },
    { id: 'lime', color: '#b3e635', label: 'Lime' },
    { id: 'green', color: '#30d882', label: 'Green' },
];

export const SOBER_ACCENTS = [
    { id: 'sage', color: '#7dab8a', label: 'Sage', checkColor: '#000' },
    { id: 'amber', color: '#d4a853', label: 'Amber', checkColor: '#000' },
    { id: 'rose', color: '#c97878', label: 'Rose', checkColor: '#000' },
    { id: 'lavender', color: '#a88ec4', label: 'Lavender', checkColor: '#000' },
    { id: 'steel', color: '#8a9bb0', label: 'Steel', checkColor: '#000' },
    { id: 'copper', color: '#c4956a', label: 'Copper', checkColor: '#000' },
];

/** Los dos grupos seguidos, para quien sólo necesita recorrerlos todos. */
export const ACCENTS = [...VIBRANT_ACCENTS, ...SOBER_ACCENTS];
