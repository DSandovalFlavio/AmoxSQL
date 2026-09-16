/**
 * Cuadernos de SQL — el recorrido de la primera vez.
 *
 * Describe el cuaderno tal y como es ahora: celdas de SQL que dejan su vista
 * puesta, celdas de texto, parametros en la barra derecha y «Actualizar».
 * Lo anterior hablaba de celdas «Input», de «ejecutar todo» y de exportar a
 * HTML, y ninguna de las tres existe ya.
 */
import { LuLayers, LuType, LuSlidersHorizontal, LuRefreshCw } from 'react-icons/lu';

export const NOTEBOOK_TOUR_STEPS = [
    {
        icon: LuLayers, title: 'Cada celda deja una vista', tagline: 'Sin escribir un CREATE',
        headline: 'La siguiente celda lee a la anterior por su nombre',
        desc: 'Al ejecutar una celda, su consulta queda puesta en la sesión con el nombre de la celda. '
            + 'La de abajo ya puede escribir FROM ese_nombre. Nadie escribe CREATE OR REPLACE TEMP VIEW.',
        points: [
            'El comentario de arriba de la consulta es la descripción de la vista',
            'Un interruptor la materializa cuando el paso es caro y cuelgan otros de él',
        ],
    },
    {
        icon: LuType, title: 'Celdas de texto', tagline: 'Contar el porqué',
        headline: 'El análisis se documenta al lado del análisis',
        desc: 'El contexto, la metodología y lo que se descartó van en celdas de texto, en Markdown. '
            + 'Sus encabezados construyen solos el índice de la barra derecha.',
        points: [
            'Doble clic para escribir; se ve compuesto al soltar',
            'Para la prosa larga, la celda ocupa la pestaña entera',
        ],
    },
    {
        icon: LuSlidersHorizontal, title: 'Parámetros', tagline: 'Sin tocar la consulta',
        headline: 'Un valor que cambia todo el cuaderno',
        desc: 'Escribe {{desde}} en una celda y en la barra derecha podrás darle valor. '
            + 'Un texto entra entrecomillado y un número tal cual, así que se escribe f >= {{desde}}.',
        points: [
            'La barra separa los que se usan de los que sólo están declarados',
            'Cambiar un valor marca como desactualizado lo que dependa de él',
        ],
    },
    {
        icon: LuRefreshCw, title: 'Actualizar', tagline: 'En orden de dependencia',
        headline: 'Lo que se quedó viejo, y sólo eso',
        desc: 'El cuaderno sabe qué celda lee a cuál, esté donde esté en el documento. '
            + 'Si editas una de la que cuelgan tres, marca las tres, y «Actualizar» las ejecuta en el '
            + 'orden correcto — que no es el de la pantalla.',
        points: [
            'Dice cuántas y en qué orden antes de empezar',
            'Lo que escribe en el disco se aparta: repetir un INSERT no es inofensivo',
        ],
    },
];
