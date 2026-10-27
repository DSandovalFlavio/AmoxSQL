/**
 * Qué admite cada tipo de gráfico: la ÚNICA tabla que consultan los paneles para
 * decidir qué controles enseñar. Tiene que coincidir con lo que dibuja
 * vega/deStoryFlow.js: un control que se toca y no hace nada es peor que no tenerlo.
 */
export function capacidades(chartType = 'bar') {
    const t = chartType;
    const barra = t.startsWith('bar');
    const horizontal = t.startsWith('bar-horizontal');
    const linea = t === 'line' || t === 'area';
    const dispersion = t === 'scatter' || t === 'bubble';
    const anillo = t === 'donut' || t === 'pie';
    const es = (k) => t === k;
    const unaY = ['boxplot', 'strip', 'errorbar', 'lollipop', 'histogram', 'density'].includes(t);
    const suma = barra || linea || ['combo', 'donut', 'pie', 'funnel', 'treemap', 'waterfall', 'slope', 'lollipop', 'dumbbell', 'bump'].includes(t);
    const ejes = !['donut', 'pie', 'treemap', 'funnel', 'heatmap'].includes(t);
    return {
        barra, horizontal, linea, dispersion, anillo, ejes, suma, unaY,
        combo: es('combo'), cascada: es('waterfall'), embudo: es('funnel'), calor: es('heatmap'), treemap: es('treemap'),
        histograma: es('histogram'), densidad: es('density'), caja: es('boxplot'), franjas: es('strip'),
        intervalo: es('errorbar'), piruleta: es('lollipop'), mancuerna: es('dumbbell'), bump: es('bump'), pendiente: es('slope'),
        // Canales
        partir: !anillo && !['boxplot', 'strip', 'errorbar', 'lollipop', 'histogram', 'treemap', 'funnel', 'heatmap', 'waterfall', 'dumbbell'].includes(t),
        tamano: dispersion,
        derecha: ((linea || t === 'combo' || (barra && !horizontal))),
        banda: linea,
        orientable: ['boxplot', 'strip', 'errorbar', 'lollipop', 'dumbbell'].includes(t),
        // Dar forma a los datos
        ranking: barra || ['donut', 'pie', 'funnel', 'lollipop'].includes(t),
        acumulado: linea,
        facetas: barra || linea || dispersion || ['histogram', 'density', 'boxplot', 'strip', 'lollipop', 'combo', 'slope', 'bump'].includes(t),
        // Formato
        escala: ejes && !['histogram', 'density', 'bump'].includes(t),
        etiquetas: barra || linea || anillo || ['waterfall', 'funnel', 'lollipop', 'dumbbell', 'combo'].includes(t),
        tooltipExtra: suma || dispersion || ['strip'].includes(t),
        zoom: linea || dispersion,
        // Historia
        resalte: barra || linea || ['boxplot', 'strip', 'errorbar', 'lollipop'].includes(t),
        referencias: barra || linea || dispersion || ['combo', 'waterfall', 'errorbar', 'strip', 'lollipop'].includes(t),
        tendencia: barra || linea || dispersion,
        finales: linea || t === 'bump',
        anotaciones: barra || linea || dispersion || ['combo', 'waterfall', 'errorbar', 'lollipop'].includes(t),
    };
}
