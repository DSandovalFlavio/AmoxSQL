/**
 * Story Flow sobre Vega-Lite (5.16): cada tipo, cada capa y cada figura de la
 * galería se traduce, compila SIN avisos y se dibuja con los datos.
 *
 *     node scripts/probarGraficos.mjs
 *
 * También comprueba la ida y vuelta del archivo (.amoxvis = Vega-Lite + usermeta)
 * y lo que con el sistema anterior salía mal: la dispersión sumaba los puntos que
 * compartían X y `limit` cortaba una serie diaria en 50 días.
 */
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const CLIENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
// El código del cliente importa sin extensión (lo resuelve Vite) y sus paquetes
// viven en client/node_modules: un gancho de resolución hace lo mismo en Node.
register('data:text/javascript,' + encodeURIComponent(`
    const CLIENTE = ${JSON.stringify(pathToFileURL(CLIENTE + '/package.json').href)};
    export async function resolve(esp, ctx, sig) {
        if (/^\\.\\.?\\//.test(esp) && !/\\.[cm]?jsx?$/.test(esp)) {
            try { return await sig(esp + '.js', ctx); } catch { /* sigue */ }
        }
        if (!/^(node:|data:|file:|\\.|\\/)/.test(esp)) {
            try { return await sig(esp, ctx); } catch { return sig(esp, { ...ctx, parentURL: CLIENTE }); }
        }
        return sig(esp, ctx);
    }
`));

const url = (p) => pathToFileURL(path.join(CLIENTE, 'src', p)).href;
const { deStoryFlow } = await import(url('components/DataVisualizer/vega/deStoryFlow.js'));
const { leerAmoxvis, escribirAmoxvis, esSpecVega } = await import(url('components/DataVisualizer/vega/figura.js'));
const { compilarFigura, prepararFilas, resolverVariables } = await import(url('components/DataVisualizer/vega/motor.js'));
const { temaVega } = await import(url('components/DataVisualizer/vega/tema.js'));
const { anadirCapa, capaPosible } = await import(url('components/DataVisualizer/vega/capas.js'));
const { paraFuera, specDeSalida, scriptDePython, formatoD3 } = await import(url('components/DataVisualizer/vega/salida.js'));
const { sqlDeAgregado, consultaEnvolvible } = await import(url('components/DataVisualizer/vega/agregar.js'));
const { diferencia, aplicar, asimilarCodigo, especBase, especFinal, rutasDeExtras, describirExtras } = await import(url('components/DataVisualizer/vega/codigo.js'));
const { COLOR_PALETTES } = await import(url('components/DataVisualizer/constants.js'));
const { GALLERY_CHARTS } = await import(url('data/galleryChartDefinitions.js'));
const vega = await import(pathToFileURL(path.join(CLIENTE, 'node_modules/vega/build/vega.module.js')).href).catch(() => import('vega'));

let ok = 0, mal = 0;
const bien = (nombre, cond, detalle = '') => {
    cond ? ok++ : mal++;
    console.log(`${cond ? '  ok ' : '  MAL'} ${nombre}${cond || !detalle ? '' : ` → ${detalle}`}`);
};

const colores = COLOR_PALETTES.default;
const tema = temaVega(null, { fuente: 'sans-serif', colores });

/** Compila y dibuja; devuelve { avisos, svg, vista } o lanza. */
async function dibujar(spec, filas) {
    const avisos = [];
    const vg = compilarFigura(spec, { tema, ancho: 480, alto: 300, avisos });
    const vista = new vega.View(vega.parse(vg), { renderer: 'none', logLevel: vega.Error });
    try { vista.data('dataset', prepararFilas(filas)); } catch { /* datos propios */ }
    await vista.runAsync();
    const svg = await vista.toSVG();
    return { avisos, svg, vista };
}
const marcas = (svg, rol) => (svg.match(new RegExp(`aria-roledescription="${rol}"`, 'g')) || []).length;

// ── Datos de prueba ──
const meses = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01', '2024-05-01', '2024-06-01'];
const ventas = meses.flatMap((m, i) => ['Norte', 'Sur'].map((r, j) => ({ mes: m, region: r, venta: String(1000 + i * 120 + j * 300), costo: 600 + i * 50 })));
const categorias = ['Portátiles', 'Teléfonos', 'Tabletas', 'Audio', 'Accesorios', 'Monitores'].map((c, i) => ({ categoria: c, venta: 9000 - i * 1200, margen: 30 - i * 3 }));
const diarios = Array.from({ length: 153 }, (_, i) => ({ dia: new Date(Date.UTC(2025, 3, 1 + i)).toISOString().slice(0, 10), cvr: 0.017 + Math.sin(i / 7) * 0.003 }));
const dispersion = Array.from({ length: 100 }, (_, i) => ({ tv: i < 60 ? 0 : 100000 + i * 1000, ventas: 2000000 + i * 10000, temporada: i < 80 ? 'Baja' : 'Alta' }));
const cascada = [{ paso: 'Inicio', v: 500 }, { paso: 'Ventas', v: 320 }, { paso: 'Devoluciones', v: -80 }, { paso: 'Costos', v: -210 }];
const calor = ['tv', 'search', 'meta'].map((a, i) => ({ variable: a, tv: [1, 0.3, 0.33][i], search: [0.3, 1, 0.98][i], meta: [0.33, 0.98, 1][i] }));

const casos = [
    ['columnas', { chartType: 'bar', xAxisKey: 'categoria', yAxisKeys: ['venta'], sortMode: 'y-desc' }, categorias, 'bar', 6],
    ['barras horizontales con etiquetas', { chartType: 'bar-horizontal', xAxisKey: 'categoria', yAxisKeys: ['venta'], showLabels: true }, categorias, 'bar', 6],
    ['columnas agrupadas por región', { chartType: 'bar', xAxisKey: 'mes', yAxisKeys: ['venta'], splitByKey: 'region', dateAggregation: 'month' }, ventas, 'bar', 12],
    ['columnas apiladas', { chartType: 'bar-stacked', xAxisKey: 'mes', yAxisKeys: ['venta'], splitByKey: 'region' }, ventas, 'bar', 12],
    ['100 % apiladas', { chartType: 'bar-100', xAxisKey: 'mes', yAxisKeys: ['venta'], splitByKey: 'region' }, ventas, 'bar', 12],
    ['barras apiladas horizontales', { chartType: 'bar-horizontal-stacked', xAxisKey: 'mes', yAxisKeys: ['venta', 'costo'] }, ventas, 'bar', 12],
    ['línea con dos Y', { chartType: 'line', xAxisKey: 'mes', yAxisKeys: ['venta', 'costo'] }, ventas, 'line mark', 2],
    ['área apilada', { chartType: 'area', xAxisKey: 'mes', yAxisKeys: ['venta'], splitByKey: 'region' }, ventas, 'area mark', 2],
    ['combo barras + línea', { chartType: 'combo', xAxisKey: 'mes', yAxisKeys: ['venta', 'costo'], comboLineKeys: ['costo'] }, ventas, 'line mark', 1],
    ['anillo', { chartType: 'donut', xAxisKey: 'categoria', yAxisKeys: ['venta'], showLabels: true }, categorias, 'arc mark', 6],
    ['pastel', { chartType: 'pie', xAxisKey: 'categoria', yAxisKeys: ['venta'] }, categorias, 'arc mark', 6],
    ['dispersión por temporada', { chartType: 'scatter', xAxisKey: 'tv', yAxisKeys: ['ventas'], splitByKey: 'temporada' }, dispersion, 'circle', 100],
    ['burbujas', { chartType: 'bubble', xAxisKey: 'venta', yAxisKeys: ['margen'], bubbleSizeKey: 'venta' }, categorias, 'circle', 6],
    ['mapa de calor', { chartType: 'heatmap', xAxisKey: 'variable', yAxisKeys: ['tv', 'search', 'meta'] }, calor, 'rect mark', 9],
    ['embudo', { chartType: 'funnel', xAxisKey: 'categoria', yAxisKeys: ['venta'], showLabels: true }, categorias, 'bar', 6],
    ['cascada', { chartType: 'waterfall', xAxisKey: 'paso', yAxisKeys: ['v'], sortMode: 'natural' }, cascada, 'bar', 4],
    ['mapa de rectángulos (Vega)', { chartType: 'treemap', xAxisKey: 'categoria', yAxisKeys: ['venta'] }, categorias, 'data:arbol', 6],
    ['capas: meta, referencia, banda, anotaciones, tendencia, resalte', {
        chartType: 'bar', xAxisKey: 'categoria', yAxisKeys: ['venta'],
        goalLine: { enabled: true, value: 6000, label: 'Meta', color: '#22c55e', style: 'dashed' },
        refLine: { value: 4000, label: 'Mínimo', color: '#ff4444', style: 'dotted' },
        refArea: { x1: 'Tabletas', x2: 'Audio', y1: '', y2: '', color: '#ffffff', opacity: 0.1 },
        annotations: [{ id: 'a', type: 'text', x: 'Audio', y: 5400, text: 'Campaña' }, { id: 'b', type: 'box', x: 'Teléfonos', x2: 'Tabletas', text: 'Rebajas' }],
        trendLine: { type: 'linear', color: '#fbbf24', windowSize: 3 },
        highlightConfig: { type: 'max', value: '', color: '#ef4444' },
    }, categorias, 'bar', 6],
    ['la misma columna en X y en Y', { chartType: 'bar', xAxisKey: 'margen', yAxisKeys: ['margen'] }, categorias, 'bar', 6],
    ['histograma con media y mediana', { chartType: 'histogram', xAxisKey: 'ventas', yAxisKeys: ['ventas'], binCount: 15, histogramStats: ['mean', 'median'] }, dispersion, 'bar', 5],
    ['caja y bigotes con una categoría resaltada', { chartType: 'boxplot', xAxisKey: 'temporada', yAxisKeys: ['ventas'], highlightConfig: { type: 'exact', value: 'Alta', color: '#ef4444' } }, dispersion, 'box', 2],
    ['barras con intervalo', { chartType: 'errorbar', xAxisKey: 'grupo', yAxisKeys: ['lift'], errorLowKey: 'bajo', errorHighKey: 'alto', highlightConfig: { type: 'exact', value: 'Ajustada', color: '#ef4444' } }, [{ grupo: 'Ingenua', lift: 9, bajo: 6.2, alto: 11.8 }, { grupo: 'Ajustada', lift: 4.2, bajo: 1.2, alto: 7.2 }], 'errorbar', 2],
    ['pendiente de 2023 a 2024', { chartType: 'slope', xAxisKey: 'anio', yAxisKeys: ['venta'], splitByKey: 'categoria' }, ['Audio', 'Tabletas'].flatMap((c, i) => [{ anio: '2023', categoria: c, venta: 100 + i * 30 }, { anio: '2024', categoria: c, venta: 140 - i * 20 }]), 'line mark', 2],
    ['barras bajo un umbral en otro color', { chartType: 'bar-horizontal', xAxisKey: 'categoria', yAxisKeys: ['margen'], highlightConfig: { type: 'below', value: 20, color: '#ef4444' }, refLine: { value: 20, label: 'Umbral', color: '#555', style: 'dashed' } }, categorias, 'bar', 6],
    ['tramo de una serie diaria resaltado', { chartType: 'line', xAxisKey: 'dia', yAxisKeys: ['cvr'], highlightConfig: { type: 'range', value: '2025-06-10', value2: '2025-06-26', color: '#ef4444' } }, diarios, 'line mark', 2],
    ['dispersión con recta de regresión', { chartType: 'scatter', xAxisKey: 'tv', yAxisKeys: ['ventas'], trendLine: { type: 'linear', color: '#ef4444' } }, dispersion, 'line mark', 1],
    ['dispersión con curva suavizada', { chartType: 'scatter', xAxisKey: 'tv', yAxisKeys: ['ventas'], trendLine: { type: 'loess', color: '#ef4444' } }, dispersion, 'line mark', 1],
    ['línea de referencia en la media', { chartType: 'bar', xAxisKey: 'categoria', yAxisKeys: ['venta'], refLine: { value: 'mean', label: 'Media', color: '#ef4444', style: 'dashed' } }, categorias, 'rule mark', 1],
    ['anillo con porciones pequeñas en «Others»', { chartType: 'donut', xAxisKey: 'categoria', yAxisKeys: ['venta'], donutGroupingThreshold: 15 }, categorias, 'arc mark', 1],
    ['piruleta', { chartType: 'lollipop', xAxisKey: 'categoria', yAxisKeys: ['venta'], sortMode: 'y-desc', showLabels: true }, categorias, 'circle', 6],
    ['mancuerna con dos medidas', { chartType: 'dumbbell', xAxisKey: 'mes', yAxisKeys: ['venta', 'costo'] }, ventas, 'circle', 12],
    ['densidad por región', { chartType: 'density', xAxisKey: 'venta', yAxisKeys: ['venta'], splitByKey: 'region' }, ventas, 'area mark', 2],
    ['franjas', { chartType: 'strip', xAxisKey: 'temporada', yAxisKeys: ['ventas'] }, dispersion, 'tick', 100],
    ['bump: el puesto por mes', { chartType: 'bump', xAxisKey: 'mes', yAxisKeys: ['venta'], splitByKey: 'region', endLabels: true }, ventas, 'line mark', 2],
    ['eje derecho para una de las Y', { chartType: 'line', xAxisKey: 'mes', yAxisKeys: ['venta', 'costo'], rightYAxisKey: 'costo' }, ventas, 'line mark', 2],
    ['columnas con la segunda Y a la derecha', { chartType: 'bar', xAxisKey: 'mes', yAxisKeys: ['venta', 'costo'], rightYAxisKey: 'costo' }, ventas, 'bar', 6],
    ['pequeños múltiplos por región', { chartType: 'bar', xAxisKey: 'mes', yAxisKeys: ['venta'], facetKey: 'region', facetColumns: 2 }, ventas, 'bar', 12],
    ['tooltip con % y columna extra', { chartType: 'bar', xAxisKey: 'categoria', yAxisKeys: ['venta'], tooltipShowPercent: true, tooltipFields: ['margen'] }, categorias, 'bar', 6],
    ['tooltip «rich» (Δ frente al anterior)', { chartType: 'line', xAxisKey: 'mes', yAxisKeys: ['venta'], tooltipMode: 'rich' }, ventas, 'line mark', 1],
    ['leyenda interactiva', { chartType: 'line', xAxisKey: 'mes', yAxisKeys: ['venta'], splitByKey: 'region', legendPosition: 'top', interactiveLegend: true }, ventas, 'line mark', 2],
    ['etiquetas al final de cada línea', { chartType: 'line', xAxisKey: 'mes', yAxisKeys: ['venta'], splitByKey: 'region', endLabels: true }, ventas, 'text mark', 2],
    ['banda de intervalo bajo la línea', { chartType: 'line', xAxisKey: 'mes', yAxisKeys: ['venta'], bandLowKey: 'costo', bandHighKey: 'venta' }, ventas, 'area mark', 1],
    ['escalón antes y raíz cuadrada', { chartType: 'line', xAxisKey: 'mes', yAxisKeys: ['venta'], lineType: 'stepBefore', yScaleType: 'sqrt', zeroBaseline: 'on' }, ventas, 'line mark', 1],
    ['anotación sin Y: va sobre el dato', { chartType: 'bar', xAxisKey: 'categoria', yAxisKeys: ['venta'], annotations: [{ id: 'a', type: 'text', x: 'Audio', y: '', text: 'Aquí' }] }, categorias, 'text mark', 1],
    ['etiquetas dentro de la barra', { chartType: 'bar', xAxisKey: 'categoria', yAxisKeys: ['venta'], showLabels: true, dataLabelPosition: 'inside-end' }, categorias, 'text mark', 6],
    ['nombres de serie en la leyenda', { chartType: 'line', xAxisKey: 'mes', yAxisKeys: ['venta', 'costo'], legendPosition: 'top', seriesConfig: { costo: { label: 'Costo total' } } }, ventas, 'legend', 1],
    ['línea con media móvil y punto resaltado', { chartType: 'line', xAxisKey: 'dia', yAxisKeys: ['cvr'], trendLine: { type: 'moving-average', windowSize: 7 }, highlightConfig: { type: 'exact', value: '2025-06-15', color: '#ef4444' } }, diarios, 'line mark', 2],
];

console.log('Cada tipo y cada capa');
// Para el mensaje de error: qué marcas sí salieron.
globalThis.__roles = (svg) => [...new Set(svg.match(/aria-roledescription="[^"]*"/g))].join(" ");
for (const [nombre, config, filas, rol, minimo] of casos) {
    try {
        const spec = deStoryFlow(config, { filas, colores });
        const { avisos, svg, vista } = await dibujar(spec, filas);
        // Vega sin «-Lite» no pone descripciones a cada marca: se cuentan los datos que dibuja.
        const n = rol.startsWith('data:') ? vista.data(rol.slice(5)).length : marcas(svg, rol);
        // SALIDA=<carpeta>: deja el SVG de cada caso para mirarlo.
        if (process.env.SALIDA) (await import('node:fs')).writeFileSync(path.join(process.env.SALIDA, `${nombre.replace(/[^\p{L}\d]+/gu, '_')}.svg`), svg);
        bien(`${nombre}: compila sin avisos`, avisos.length === 0, avisos.join(' | '));
        bien(`${nombre}: dibuja ${minimo}+ «${rol}»`, n >= minimo, `dibujó ${n} · ${globalThis.__roles(svg)}`);
    } catch (e) {
        bien(nombre, false, e.message);
    }
}

console.log('Lo que antes salía mal');
{
    const spec = deStoryFlow({ chartType: 'scatter', xAxisKey: 'tv', yAxisKeys: ['ventas'] }, { filas: dispersion, colores });
    const { svg } = await dibujar(spec, dispersion);
    bien('la dispersión dibuja las 100 filas (antes 41)', marcas(svg, 'circle') === 100, `dibujó ${marcas(svg, 'circle')}`);
    const linea = deStoryFlow({ chartType: 'line', xAxisKey: 'dia', yAxisKeys: ['cvr'], limit: 50 }, { filas: diarios, colores });
    const { vista } = await dibujar(linea, diarios);
    // data_0: la fuente ya transformada que alimenta la línea.
    const n = vista.data('data_0')?.length;
    bien('una serie diaria no se corta en 50 días', n === 153, `llegaron ${n}`);
    const top = deStoryFlow({ chartType: 'bar', xAxisKey: 'categoria', yAxisKeys: ['venta'], limit: 3, sortMode: 'y-desc' }, { filas: categorias, colores });
    const r = await dibujar(top, categorias);
    bien('un ranking sí respeta el límite (3 de 6)', marcas(r.svg, 'bar') === 3, `dibujó ${marcas(r.svg, 'bar')}`);
    const pend = deStoryFlow({ chartType: 'slope', xAxisKey: 'anio', yAxisKeys: ['venta'], splitByKey: 'categoria' }, { filas: [{ anio: '2023', categoria: 'Tabletas', venta: 1 }], colores });
    bien('una serie con «T» mayúscula conserva su nombre', JSON.stringify(pend.layer[0].encoding.color.scale.domain) === '["Tabletas"]');
    const rv = resolverVariables({ mark: { color: 'var(--accent-primary)' }, x: ['var(--nada, #123456)'] }, (n) => (n === '--accent-primary' ? '#00d4ff' : ''));
    bien('un color var(--token) se resuelve antes de dibujar', rv.mark.color === '#00d4ff' && rv.x[0] === '#123456');
    const centro = await dibujar(deStoryFlow({ chartType: 'donut', xAxisKey: 'categoria', yAxisKeys: ['venta'], donutCenterKpi: 'average' }, { filas: categorias, colores }), categorias);
    bien('anillo: el centro muestra el promedio (6K), no la suma (36K)', centro.svg.includes('>6K<') && !centro.svg.includes('>36K<'));
    bien('BIGINT/DECIMAL llegan como texto y se dibujan como número', typeof prepararFilas(ventas)[0].venta === 'number');
    bien('un código con ceros delante sigue siendo texto', typeof prepararFilas([{ cp: '01234' }, { cp: '04510' }])[0].cp === 'string');
}

console.log('El archivo: Vega-Lite + usermeta');
{
    const plano = { chartType: 'bar', xAxisKey: 'categoria', yAxisKeys: ['venta'], chartTitle: 'Portátiles lidera', takeaway: 'Dos categorías son la mitad', query: 'SELECT 1', source: 'q/ventas.sql' };
    const archivo = escribirAmoxvis(plano, { filas: categorias });
    bien('lleva $schema de Vega-Lite v6', /vega-lite\/v6/.test(archivo.$schema));
    bien('datos por nombre «dataset» (convención de Deneb)', archivo.data?.name === 'dataset');
    bien('el título va en `title` del spec', archivo.title?.text === 'Portátiles lidera');
    bien('la consulta y el origen van en usermeta.amoxsql', archivo.usermeta?.amoxsql?.consulta === 'SELECT 1' && archivo.usermeta.amoxsql.origen === 'q/ventas.sql');
    bien('usermeta guarda solo lo que difiere de fábrica', !('gridMode' in archivo.usermeta.amoxsql.interfaz) && archivo.usermeta.amoxsql.interfaz.takeaway === plano.takeaway);
    bien('es un spec de Vega', esSpecVega(archivo) && !esSpecVega(plano));
    const vuelta = leerAmoxvis(JSON.stringify(archivo));
    bien('ida y vuelta: los paneles, la consulta y el origen', vuelta.chartType === 'bar' && vuelta.query === 'SELECT 1' && vuelta.source === 'q/ventas.sql' && vuelta.takeaway === plano.takeaway && vuelta.modo === 'interfaz');
    const { usermeta, ...puro } = archivo;
    const { avisos } = await dibujar(puro, categorias);
    bien('sin usermeta sigue siendo un Vega-Lite que compila', avisos.length === 0, avisos.join(' | '));

    const codigo = { ...plano, modo: 'codigo', spec: { $schema: archivo.$schema, data: { name: 'dataset' }, mark: 'point', encoding: { x: { field: 'venta', type: 'quantitative' } } } };
    const a2 = escribirAmoxvis(codigo);
    const v2 = leerAmoxvis(a2);
    bien('modo código: el spec del usuario se guarda tal cual', a2.mark === 'point' && v2.modo === 'codigo' && v2.spec?.mark === 'point' && !v2.spec.usermeta && !v2.spec.title);
    const ajeno = leerAmoxvis({ $schema: archivo.$schema, title: 'De fuera', data: { values: [{ a: 1 }] }, mark: 'bar' });
    bien('un Vega-Lite de fuera abre en modo código con su título', ajeno.modo === 'codigo' && ajeno.chartTitle === 'De fuera' && ajeno.spec.mark === 'bar');
    bien('el formato anterior se lee como estaba', leerAmoxvis({ chartType: 'line', query: 'x' }).chartType === 'line');
}

console.log('Capas del modo Código');
{
    const suelta = { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', data: { name: 'dataset' }, mark: 'bar', encoding: { x: { field: 'categoria', type: 'nominal' }, y: { field: 'venta', type: 'quantitative' } } };
    for (const id of ['media', 'mediana', 'etiquetas']) {
        const s2 = anadirCapa(suelta, id);
        const { avisos, svg } = await dibujar(s2, categorias);
        bien(`«${id}» sobre una vista suelta: capas y compila`, s2.layer?.length === 2 && avisos.length === 0, avisos.join(' | '));
        if (id !== 'etiquetas') bien(`«${id}»: UNA regla`, marcas(svg, 'rule mark') === 1, `${marcas(svg, 'rule mark')}`);
    }
    bien('regresión no se ofrece con una X de categorías', !capaPosible(suelta, 'regresion'));
    const disp = deStoryFlow({ chartType: 'scatter', xAxisKey: 'tv', yAxisKeys: ['ventas'] }, { filas: dispersion, colores });
    const conRecta = anadirCapa(disp, 'regresion');
    const { avisos, svg } = await dibujar(conRecta, dispersion);
    bien('regresión sobre la dispersión de Story Flow', avisos.length === 0 && marcas(svg, 'line mark') === 1, avisos.join(' | '));
    const barras = deStoryFlow({ chartType: 'bar', xAxisKey: 'mes', yAxisKeys: ['venta'], splitByKey: 'region' }, { filas: ventas, colores });
    const conMedia = anadirCapa(barras, 'media');
    const r2 = await dibujar(conMedia, ventas);
    bien('media sobre barras agrupadas de Story Flow: una sola regla', r2.avisos.length === 0 && marcas(r2.svg, 'rule mark') === 1, `${marcas(r2.svg, 'rule mark')} · ${r2.avisos.join(' | ')}`);
}

console.log('Salir con el gráfico');
{
    const anillo = deStoryFlow({ chartType: 'donut', xAxisKey: 'categoria', yAxisKeys: ['venta'], showLabels: true, donutLabelContent: 'name_value' }, { filas: categorias, colores });
    const fuera = paraFuera(anillo);
    bien('fuera de AmoxSQL no queda ningún formato propio', !JSON.stringify(fuera).includes('amoxNumero'));
    const r = await dibujar(fuera, categorias);
    bien('…y la figura sigue compilando y dibujando', r.avisos.length === 0 && marcas(r.svg, 'arc mark') === 6, r.avisos.join(' | '));
    bien('formatos d3: compacto, moneda, decimales fijos', formatoD3('compact|-1') === '.3~s' && formatoD3('currency|-1') === '$,.0f' && formatoD3('standard|2') === ',.2f');

    const archivo = escribirAmoxvis({ chartType: 'bar', xAxisKey: 'categoria', yAxisKeys: ['venta'], chartTitle: 'Ventas', query: 'SELECT * FROM ventas', goalLine: { enabled: true, value: 5000, label: 'Meta', color: '#22c55e', style: 'dashed' } }, { filas: categorias });
    const conValores = specDeSalida(archivo, { datos: 'valores', filas: prepararFilas(categorias) });
    bien('Vega-Lite con los datos dentro', conValores.data.values?.length === 6 && !conValores.usermeta && /SQL: SELECT/.test(conValores.description));
    const rv2 = await dibujar(conValores, []);
    bien('…dibuja solo, sin AmoxSQL que le pase datos', rv2.avisos.length === 0 && marcas(rv2.svg, 'bar') === 6, rv2.avisos.join(' | '));
    const plantilla = specDeSalida(archivo, { datos: 'nombre' });
    bien('plantilla con los datos por nombre «dataset»', plantilla.data?.name === 'dataset' && !plantilla.data.values);
    const py = scriptDePython(archivo, { base: 'tienda.duckdb' });
    bien('script de Python: la consulta, la base y la clase de Altair', py.includes('SELECT * FROM ventas') && py.includes('"tienda.duckdb"') && py.includes('alt.LayerChart.from_dict'));
    const arbol = escribirAmoxvis({ chartType: 'treemap', xAxisKey: 'categoria', yAxisKeys: ['venta'], query: 'SELECT 1' });
    bien('un treemap (Vega) sale con sus datos y sin script de Python', specDeSalida(arbol, { filas: [{ a: 1 }] }).data[0].values?.length === 1 && scriptDePython(arbol) === null);
}

console.log('La suma la hace DuckDB');
{
    const { DuckDBInstance } = createRequire(import.meta.url)('@duckdb/node-api');
    const db = await DuckDBInstance.create(':memory:');
    const con = await db.connect();
    const q = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson();
    await con.run(`CREATE TABLE ventas AS SELECT DATE '2024-01-01' + (i % 365)::INTEGER AS fecha, ['Norte','Sur','Este'][1 + i % 3] AS region, (i % 97)::DECIMAL(10,2) AS importe FROM range(30000) t(i)`);
    const consulta = 'SELECT * FROM ventas -- todas las filas\n;';
    const sql = sqlDeAgregado({ chartType: 'bar', xAxisKey: 'fecha', yAxisKeys: ['importe'], splitByKey: 'region', dateAggregation: 'month' }, consulta, { xEsFecha: true });
    const filas = await q(sql);
    const total = (await q('SELECT sum(importe) AS t FROM ventas'))[0].t;
    const suma = filas.reduce((a, f) => a + Number(f.importe), 0);
    bien('la agregación corre en DuckDB: un mes por región', filas.length === 12 * 3, `${filas.length} filas`);
    bien('…y suma TODAS las filas, no las primeras 10 000', Math.abs(suma - Number(total)) < 0.01, `${suma} vs ${total}`);
    const spec = deStoryFlow({ chartType: 'bar', xAxisKey: 'fecha', yAxisKeys: ['importe'], splitByKey: 'region', dateAggregation: 'month' }, { filas, colores });
    const r = await dibujar(spec, filas);
    bien('el mismo spec dibuja las filas agregadas', r.avisos.length === 0 && marcas(r.svg, 'bar') === 36, `${marcas(r.svg, 'bar')} barras`);
    bien('modo código: no se agrega (el spec es del usuario)', sqlDeAgregado({ chartType: 'bar', modo: 'codigo', xAxisKey: 'x', yAxisKeys: ['y'] }, 'SELECT 1') === null);
    bien('dispersión: no se agrega (cada fila es un punto)', sqlDeAgregado({ chartType: 'scatter', xAxisKey: 'x', yAxisKeys: ['y'] }, 'SELECT 1') === null);
    bien('una consulta con variables o con dos sentencias no se envuelve', consultaEnvolvible('SELECT * FROM t WHERE a = ${x}') === null && consultaEnvolvible('SELECT 1; SELECT 2') === null && consultaEnvolvible("SELECT ';' AS s;") !== null);
    con.closeSync?.(); db.closeSync?.();
}

console.log('El código manda');
{
    // Igual sin mirar el orden de las claves.
    const igualJ = (x, y) => diferencia(x, y) === undefined;
    const op = { filas: categorias, colores };
    const inicio = { chartType: 'bar', xAxisKey: 'categoria', yAxisKeys: ['venta'], goalLine: { enabled: true, value: 6000, label: 'Meta', color: '#22c55e', style: 'dashed' } };
    const base = especBase(inicio, op);
    const editar = (f) => { const c = JSON.parse(JSON.stringify(base)); f(c); return c; };
    const principal = (sp) => sp.layer.find(l => l.name === 'amox_principal');

    // La garantía, sobre cualquier edición: lo dibujado es EXACTAMENTE el código.
    const ediciones = {
        'cambiar la marca a línea': (c) => { principal(c).mark = { type: 'line' }; },
        'una capa propia': (c) => { c.layer.push({ name: 'mi_capa', mark: 'rule', encoding: { y: { datum: 3000 } } }); },
        'quitar la meta': (c) => { c.layer = c.layer.filter(l => !l.name.startsWith('amox_meta')); },
        'opacidad en la marca': (c) => { principal(c).mark.opacity = 0.5; },
        'título del eje X': (c) => { principal(c).encoding.x.axis.title = 'Categoría'; },
        'otra columna en X': (c) => { principal(c).encoding.x.field = 'margen'; },
        'un config propio': (c) => { c.config = { axis: { labelColor: 'red' } }; },
        'null donde había valor': (c) => { principal(c).encoding.x.axis = null; },
    };
    for (const [nombre, f] of Object.entries(ediciones)) {
        const codigo = editar(f);
        const nuevo = asimilarCodigo(codigo, inicio, op);
        bien(`«${nombre}»: la figura es exactamente el código`, igualJ(especFinal(nuevo, op), codigo), String(JSON.stringify(diferencia(codigo, especFinal(nuevo, op)))).slice(0, 200));
    }

    // Lo que los paneles representan vuelve a ellos, sin extras.
    const t1 = asimilarCodigo(editar(ediciones['título del eje X']), inicio, op);
    bien('título de eje en código → panel, sin extras', t1.showXAxisTitle === true && t1.customAxisTitles.x === 'Categoría' && t1.extras === null, JSON.stringify(t1.extras));
    const t2 = asimilarCodigo(editar(ediciones['otra columna en X']), inicio, op);
    // Solo se cambió el `field`: la agrupación y el tooltip del código siguen en la columna anterior, y eso
    // queda como extra (el código manda). El panel sí muestra la columna nueva.
    bien('columna X en código → el panel la muestra', t2.xAxisKey === 'margen');
    const t3 = asimilarCodigo(editar(ediciones['quitar la meta']), inicio, op);
    bien('quitar la capa de meta apaga la meta en el panel', t3.goalLine.enabled === false && t3.extras === null, JSON.stringify(t3.extras));
    const t4 = asimilarCodigo(editar(ediciones['cambiar la marca a línea']), inicio, op);
    bien('marca de línea en código → tipo «line» en el panel', t4.chartType === 'line');

    // Lo que no representan queda como extra, y sobrevive a los paneles.
    const t5 = asimilarCodigo(editar(ediciones['una capa propia']), inicio, op);
    bien('una capa propia es UN extra', rutasDeExtras(t5.extras).length === 1 && describirExtras(t5.extras, especFinal(t5, op))[0].includes('mi_capa'), JSON.stringify(rutasDeExtras(t5.extras)));
    const tras = especFinal({ ...t5, barRadius: 9, goalLine: { ...t5.goalLine, value: 7000 } }, op);
    bien('…y sobrevive a un cambio en los paneles (radio y meta nuevos)', tras.layer.some(l => l.name === 'mi_capa') && principal(tras).mark.cornerRadiusEnd === 9 && tras.layer.find(l => l.name === 'amox_meta').encoding.y.datum === 7000);
    const t6 = asimilarCodigo(editar(ediciones['opacidad en la marca']), inicio, op);
    const tras6 = especFinal({ ...t6, xAxisKey: 'margen' }, op);
    bien('un retoque en la capa principal sigue aplicado tras cambiar la X', principal(tras6).mark.opacity === 0.5 && principal(tras6).encoding.x.field === 'margen');
    const t7 = asimilarCodigo(editar(ediciones['quitar la meta']), inicio, op);
    bien('una capa que el código quitó no vuelve sola', !especFinal(t7, op).layer.some(l => l.name === 'amox_meta'));
    const { avisos } = await dibujar(especFinal(t5, op), categorias);
    bien('la figura con extras compila sin avisos', avisos.length === 0, avisos.join(' | '));
    const titulo = asimilarCodigo({ ...base, title: { text: 'Hola', subtitle: 'Sub' } }, inicio, op);
    bien('un título escrito en código pasa a la tarjeta y no es extra', titulo.chartTitle === 'Hola' && titulo.chartSubtitle === 'Sub' && titulo.extras === null);
    const sinCero = asimilarCodigo(editar((c) => { principal(c).encoding.y.scale = { zero: false }; }), inicio, op);
    bien('«zero: false» en código → panel «Start at zero: off», sin extras', sinCero.zeroBaseline === 'off' && sinCero.extras === null, JSON.stringify(sinCero.extras));
    const raiz = asimilarCodigo(editar((c) => { principal(c).encoding.y.scale = { type: 'sqrt' }; }), inicio, op);
    bien('escala «sqrt» en código → panel', raiz.yScaleType === 'sqrt' && raiz.extras === null, JSON.stringify(raiz.extras));
    const fuera = { $schema: base.$schema, data: { name: 'dataset' }, mark: 'bar', encoding: { x: { field: 'categoria', type: 'nominal' }, y: { field: 'venta', type: 'quantitative', aggregate: 'mean' } } };
    const deFuera = asimilarCodigo(fuera, { chartType: 'line', xAxisKey: '', yAxisKeys: [] }, op);
    bien('un Vega-Lite de fuera: los paneles leen tipo y columnas, y se dibuja tal cual', deFuera.chartType === 'bar' && deFuera.xAxisKey === 'categoria' && igualJ(especFinal(deFuera, op), fuera));
}

console.log('La galería');
for (const g of GALLERY_CHARTS) {
    try {
        const spec = deStoryFlow(g.amoxvis, { filas: g.data, colores: COLOR_PALETTES[g.amoxvis.colorTheme] || colores });
        const { avisos } = await dibujar(spec, g.data);
        bien(`${g.id}`, avisos.length === 0, avisos.join(' | '));
    } catch (e) {
        bien(g.id, false, e.message);
    }
}

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
