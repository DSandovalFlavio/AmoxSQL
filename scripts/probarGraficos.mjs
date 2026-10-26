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
const { compilarFigura, prepararFilas } = await import(url('components/DataVisualizer/vega/motor.js'));
const { temaVega } = await import(url('components/DataVisualizer/vega/tema.js'));
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
