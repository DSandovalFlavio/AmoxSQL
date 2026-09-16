/**
 * Cuadernos de SQL — el recorrido de la primera vez.
 *
 * Describe el cuaderno tal y como es ahora: celdas de SQL que dejan su vista
 * puesta, celdas de texto, parametros en la barra derecha y «Actualizar».
 * Lo anterior hablaba de celdas «Input», de «ejecutar todo» y de exportar a
 * HTML, y ninguna de las tres existe ya.
 *
 * El texto va en ingles porque es interfaz; los comentarios, en espanol, como
 * en el resto del proyecto.
 */
import { LuLayers, LuType, LuSlidersHorizontal, LuRefreshCw } from 'react-icons/lu';

export const NOTEBOOK_TOUR_STEPS = [
    {
        icon: LuLayers, title: 'Every cell leaves a view', tagline: 'Without writing a CREATE',
        headline: 'The next cell reads the previous one by its name',
        desc: 'When a cell runs, its query is left in the session under the cell\'s name. '
            + 'The one below can already write FROM that_name. Nobody writes CREATE OR REPLACE TEMP VIEW.',
        points: [
            'The query\'s leading comment becomes the view\'s description',
            'A switch materializes it when the step is expensive and others hang off it',
        ],
    },
    {
        icon: LuType, title: 'Text cells', tagline: 'Telling the why',
        headline: 'The analysis is documented next to the analysis',
        desc: 'The context, the method and what you ruled out go in text cells, in Markdown. '
            + 'Their headings build the outline in the right sidebar on their own.',
        points: [
            'Double-click to write; it composes when you click away',
            'For long prose, the cell takes the whole tab',
        ],
    },
    {
        icon: LuSlidersHorizontal, title: 'Parameters', tagline: 'Without touching the query',
        headline: 'One value that changes the whole notebook',
        desc: 'Write {{desde}} in a cell and the right sidebar lets you give it a value. '
            + 'Text goes in quoted and a number goes in raw, so you write f >= {{desde}}.',
        points: [
            'The sidebar separates the ones in use from the ones only declared',
            'Changing a value marks whatever depends on it as out of date',
        ],
    },
    {
        icon: LuRefreshCw, title: 'Refresh', tagline: 'In dependency order',
        headline: 'What went stale, and only that',
        desc: 'The notebook knows which cell reads which, wherever they sit in the document. '
            + 'Edit one that three others hang off and it marks all three, and Refresh runs them in the '
            + 'right order — which is not the order on screen.',
        points: [
            'It says how many and in what order before starting',
            'Anything that writes to disk is set aside: repeating an INSERT is not harmless',
        ],
    },
];
