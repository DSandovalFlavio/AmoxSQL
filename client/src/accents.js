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

export const VIBRANT_ACCENTS = [
    { id: 'cyan', color: '#00FFFF', label: 'Cyan (Default)' },
    { id: 'amox-2', color: '#00F5FF', label: 'Aqua' },
    { id: 'amox-4', color: '#00DAFF', label: 'Sky' },
    { id: 'amox-6', color: '#00B6FF', label: 'Azure' },
    { id: 'amox-8', color: '#0090FF', label: 'Blue' },
    { id: 'amox-10', color: '#0068FF', label: 'Cobalt' },
    { id: 'linear', color: '#5E6AD2', label: 'Linear Blue' },
    { id: 'islands', color: '#548af7', label: 'Islands Blue' },
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
