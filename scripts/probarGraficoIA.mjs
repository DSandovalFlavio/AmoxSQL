/**
 * La herramienta `display_chart` del asistente (5.17): los tipos nuevos y el
 * Vega-Lite escrito por el modelo, que se compila en el servidor.
 *
 *     node scripts/probarGraficoIA.mjs
 *
 * No toca ninguna base: el resultado de la consulta se pone a mano en el mapa
 * `queryResults`, que es de donde la herramienta lo lee.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createTools } = require(path.join(RAIZ, 'server/ai/tools.js'));

let ok = 0, mal = 0;
const bien = (nombre, cond, detalle = '') => {
    cond ? ok++ : mal++;
    console.log(`${cond ? '  ok ' : '  MAL'} ${nombre}${cond || !detalle ? '' : ` → ${detalle}`}`);
};

const queryResults = new Map();
queryResults.set('qr_1', {
    query: 'SELECT …',
    columns: [{ name: 'campana' }, { name: 'roas' }, { name: 'bajo' }, { name: 'alto' }],
    data: [{ campana: 'Search', roas: 5.2, bajo: 4, alto: 6 }, { campana: 'TikTok', roas: 0.5, bajo: 0.2, alto: 0.9 }],
    rowCount: 2,
});
const tools = createTools({ dbManager: null, queryResults, projectPath: null });
const dibujar = (args) => tools.display_chart.execute({ query_id: 'qr_1', title: 'T', ...args }, {});

{
    const r = await dibujar({ chart_type: 'errorbar', x_axis_key: 'campana', y_axis_keys: ['roas'], error_low_key: 'bajo', error_high_key: 'alto', orientation: 'horizontal' });
    bien('barras con intervalo: pasan las columnas del intervalo', r.chartConfig?.errorLowKey === 'bajo' && r.chartConfig.errorHighKey === 'alto' && r.chartConfig.orientation === 'horizontal', JSON.stringify(r).slice(0, 200));
}
{
    const r = await dibujar({ chart_type: 'errorbar', x_axis_key: 'campana', y_axis_keys: ['roas'], error_low_key: 'nada', error_high_key: 'alto' });
    bien('una columna de intervalo que no existe es un error', !!r.error);
}
{
    const r = await dibujar({ chart_type: 'bar-horizontal', x_axis_key: 'campana', y_axis_keys: ['roas'], highlight: { type: 'below', value: '1', color: '#ef4444' }, ref_line: { value: 1, label: 'ROAS = 1' } });
    bien('umbral: «below» con su valor', r.chartConfig?.highlightConfig?.type === 'below' && r.chartConfig.highlightConfig.value === '1');
}
{
    const r = await dibujar({ chart_type: 'bar', x_axis_key: 'campana', y_axis_keys: ['roas'], ref_line: { value: 'mean', label: 'Media' } });
    bien('línea de referencia en la media', r.chartConfig?.refLine?.value === 'mean');
}
{
    const r = await dibujar({ chart_type: 'histogram', x_axis_key: 'roas', y_axis_keys: ['roas'], bin_count: 10, histogram_stats: ['mean', 'median'] });
    bien('histograma con cubos y estadísticos', r.chartConfig?.binCount === 10 && r.chartConfig.histogramStats.length === 2);
}
{
    const spec = { mark: 'bar', encoding: { y: { field: 'campana', type: 'nominal' }, x: { field: 'roas', type: 'quantitative' } } };
    const r = await dibujar({ chart_type: 'bar-horizontal', x_axis_key: 'campana', y_axis_keys: ['roas'], vega_lite: { ...spec, title: 'no va aquí', data: { values: [] } } });
    bien('vega_lite válido → modo código', r.chartConfig?.modo === 'codigo' && r.chartConfig.spec.mark === 'bar', JSON.stringify(r).slice(0, 200));
    bien('los datos se reemplazan por «dataset» y el título se quita', r.chartConfig?.spec?.data?.name === 'dataset' && !r.chartConfig.spec.title);
}
{
    const r = await dibujar({ chart_type: 'bar', x_axis_key: 'campana', y_axis_keys: ['roas'], vega_lite: { mark: 'bar', encoding: { x: { field: 'gasto', type: 'nominal' } } } });
    bien('vega_lite con una columna que no existe → error', !!r.error && /gasto/.test(r.error), JSON.stringify(r));
}
{
    const r = await dibujar({ chart_type: 'bar', x_axis_key: 'campana', y_axis_keys: ['roas'], vega_lite: { transform: [{ calculate: 'datum.roas * 2', as: 'doble' }], mark: 'bar', encoding: { x: { field: 'campana', type: 'nominal' }, y: { field: 'doble', type: 'quantitative' } } } });
    bien('vega_lite con un campo calculado en el spec es válido', !r.error, JSON.stringify(r).slice(0, 200));
}
{
    const r = await dibujar({ chart_type: 'bar', x_axis_key: 'campana', y_axis_keys: ['roas'], vega_lite: { layer: 'no es una lista' } });
    bien('vega_lite que no compila → error con pista', !!r.error && !!r.hint, JSON.stringify(r).slice(0, 200));
}

{
    const r = await dibujar({ chart_type: 'lollipop', x_axis_key: 'campana', y_axis_keys: ['roas'], facet_by: 'campana', end_labels: true, tooltip_fields: ['bajo'] });
    bien('tipo nuevo con facetas, etiquetas al final y campos de tooltip', r.chartConfig?.chartType === 'lollipop' && r.chartConfig.facetKey === 'campana' && r.chartConfig.endLabels === true && r.chartConfig.tooltipFields[0] === 'bajo', JSON.stringify(r).slice(0, 200));
    const r2 = await dibujar({ chart_type: 'bar', x_axis_key: 'campana', y_axis_keys: ['roas'], facet_by: 'region' });
    bien('facet_by con una columna que no existe es un error', !!r2.error);
}

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
