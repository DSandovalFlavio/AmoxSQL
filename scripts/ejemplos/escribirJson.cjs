/**
 * Escribe los archivos JSON del proyecto de ejemplo (gráficos, procesos de
 * Data Flow y el Canvas) en `scripts/ejemplos/proyectos/tienda-electronica/`.
 *
 *     node scripts/ejemplos/escribirJson.cjs
 *
 * Van en JSON a mano y no como archivos sueltos para poder comentarlos aquí;
 * el resultado se versiona igual que el resto del ejemplo.
 */
const fs = require('fs');
const path = require('path');

const B = path.join(__dirname, 'proyectos', 'tienda-electronica');
const w = (r, o) => {
    fs.mkdirSync(path.dirname(path.join(B, r)), { recursive: true });
    fs.writeFileSync(path.join(B, r), JSON.stringify(o, null, 2) + '\n');
};
const p = (x, y) => ({ x, y });

// ── Gráficos (.amoxvis): lo esencial; Story Flow completa el resto al abrir ──
w('charts/venta_mensual.amoxvis', {
    chartType: 'area', xAxisKey: 'mes', yAxisKeys: ['venta'], numberFormat: 'compact', colorTheme: 'ocean',
    chartTitle: 'Venta mensual', chartSubtitle: 'Enero 2023 a octubre 2024 (octubre incompleto)',
    chartFootnote: 'Fuente: archivos mensuales de ventas · tienda.duckdb',
    query: "SELECT date_trunc('month', fecha)::DATE AS mes, round(sum(importe), 2) AS venta FROM ventas GROUP BY ALL ORDER BY mes",
});
w('charts/mezcla_categorias.amoxvis', {
    chartType: 'donut', xAxisKey: 'categoria', yAxisKeys: ['venta'], numberFormat: 'compact', colorTheme: 'ocean',
    chartTitle: 'Mezcla por categoría, 2024',
    chartSubtitle: 'Portátiles y teléfonos son más de la mitad de la venta',
    query: "SELECT categoria, round(sum(importe), 2) AS venta FROM ventas WHERE fecha >= DATE '2024-01-01' GROUP BY ALL ORDER BY venta DESC",
});
w('charts/top_productos.amoxvis', {
    chartType: 'bar-horizontal', xAxisKey: 'producto', yAxisKeys: ['venta'], numberFormat: 'compact', colorTheme: 'ocean',
    sortMode: 'desc', showLabels: true, highlightConfig: { type: 'max', value: '', color: '#22c55e' },
    chartTitle: 'Los 10 productos que más venden', chartSubtitle: '2024, en pesos',
    query: "SELECT producto, round(sum(importe), 2) AS venta FROM ventas WHERE fecha >= DATE '2024-01-01' GROUP BY ALL ORDER BY venta DESC LIMIT 10",
});

// ── Data Flow: el cierre mensual, de la carpeta al Excel de Dirección ──
w('flujos/cierre_mensual.sqlchain', {
    name: 'Cierre mensual',
    description: 'Lee los archivos de ventas, calcula la venta por mes y categoría y los productos líderes, y deja el libro para Dirección.',
    variables: { desde: '2024-01-01' },
    parametros: [{ nombre: 'desde', tipo: 'fecha', etiqueta: 'Desde qué fecha' }],
    config: { base: 'memoria' },
    nodes: [
        { id: 'fuente', type: 'fuente', label: 'Ventas mensuales', position: p(0, 150), config: { fuente: 'ventas-mensuales' } },
        { id: 'importe', type: 'add_column', label: 'Importe y mes', position: p(300, 150), config: { newColumns: [
            { name: 'importe', expression: 'round("Quantity Ordered" * "Price Each", 2)::DECIMAL(12,2)' },
            { name: 'mes', expression: 'date_trunc(\'month\', "Order Date")::DATE' }] } },
        { id: 'periodo', type: 'filter', label: 'Desde ${desde}', position: p(600, 150), config: { conditions: [{ column: 'Order Date', operator: '>=', value: '${desde}' }] } },
        { id: 'por_mes', type: 'group_aggregate', label: 'Por mes y categoría', position: p(900, 30), config: { groupColumns: ['mes', 'Category'], aggregations: [
            { column: 'importe', func: 'SUM', alias: 'venta' }, { column: 'Quantity Ordered', func: 'SUM', alias: 'unidades' }] } },
        { id: 'orden_mes', type: 'sort', label: 'Por fecha', position: p(1200, 30), config: { sortColumns: [{ column: 'mes', direction: 'ASC' }, { column: 'venta', direction: 'DESC' }] } },
        { id: 'por_producto', type: 'group_aggregate', label: 'Por producto', position: p(900, 270), config: { groupColumns: ['Product', 'Category'], aggregations: [
            { column: 'importe', func: 'SUM', alias: 'venta' }, { column: 'Quantity Ordered', func: 'SUM', alias: 'unidades' }] } },
        { id: 'orden_producto', type: 'sort', label: 'Mayor primero', position: p(1200, 270), config: { sortColumns: [{ column: 'venta', direction: 'DESC' }] } },
        { id: 'libro', type: 'excel', label: 'Libro para Dirección', position: p(1500, 150), config: {
            outputPath: 'cierre_{fecha:AAAA-MM}.xlsx', destino: 'entregas-direccion',
            hojas: [{ desde: 'orden_mes', nombre: 'Por mes y categoría' }, { desde: 'orden_producto', nombre: 'Productos' }] } },
    ],
    edges: [
        { id: 'e1', source: 'fuente', target: 'importe' }, { id: 'e2', source: 'importe', target: 'periodo' },
        { id: 'e3', source: 'periodo', target: 'por_mes' }, { id: 'e4', source: 'por_mes', target: 'orden_mes' },
        { id: 'e5', source: 'periodo', target: 'por_producto' }, { id: 'e6', source: 'por_producto', target: 'orden_producto' },
        { id: 'e7', source: 'orden_mes', target: 'libro' }, { id: 'e8', source: 'orden_producto', target: 'libro' },
    ],
});
w('flujos/publicar_ventas.sqlchain', {
    name: 'Publicar ventas limpias',
    description: 'Deja un Parquet con las ventas ya limpias para que otros proyectos lo lean por su nombre.',
    config: { base: 'memoria' },
    nodes: [
        { id: 'fuente', type: 'fuente', label: 'Ventas mensuales', position: p(40, 120), config: { fuente: 'ventas-mensuales' } },
        { id: 'columnas', type: 'select_columns', label: 'Columnas en español', position: p(330, 120), config: { columns: [
            { name: 'Order Date', alias: 'fecha' }, { name: 'Product', alias: 'producto' }, { name: 'Category', alias: 'categoria' },
            { name: 'Quantity Ordered', alias: 'cantidad' }, { name: 'Price Each', alias: 'precio_unitario' }] } },
        { id: 'publicar', type: 'publicar', label: 'Publicar ventas-limpias', position: p(640, 120), config: { fuente: 'ventas-limpias', carpeta: 'publicado', formato: 'parquet' } },
    ],
    edges: [{ id: 'e1', source: 'fuente', target: 'columnas' }, { id: 'e2', source: 'columnas', target: 'publicar' }],
});

// ── Canvas: cómo va el año, de la tabla a dos ramas ──
w('canvas/exploracion_2024.amoxcanvas', {
    formato: 'amoxcanvas', version: 1, titulo: '¿Cómo va 2024?', parametros: { anio: '2024' },
    tarjetas: [
        { id: 'texto_1', tipo: 'text', x: 20, y: -170, w: 560, h: 120, texto: '# ¿Cómo va 2024?\n\nDe la tabla de ventas a dos ramas: por categoría y por mes.' },
        { id: 'ventas_src', tipo: 'source', x: 20, y: 40, w: 260, h: 220, origen: { tipo: 'tabla', nombre: 'ventas' } },
        { id: 'ventas_anio', tipo: 'query', x: 330, y: 40, w: 360, h: 260, sql: ['SELECT * FROM ventas_src', 'WHERE year(fecha) = {{anio}}'] },
        { id: 'marco_categorias', tipo: 'frame', x: 740, y: -20, w: 820, h: 380, titulo: 'Por categoría' },
        { id: 'por_categoria', tipo: 'query', x: 770, y: 30, w: 360, h: 300, marco: 'marco_categorias', sql: ['SELECT categoria, round(sum(importe), 0) AS venta', 'FROM ventas_anio', 'GROUP BY categoria', 'ORDER BY venta DESC'] },
        { id: 'grafico_categorias', tipo: 'chart', x: 1170, y: 30, w: 360, h: 300, marco: 'marco_categorias', desde: 'por_categoria', grafico: { chartType: 'bar-horizontal', xAxisKey: 'categoria', yAxisKeys: ['venta'], numberFormat: 'compact' } },
        { id: 'marco_meses', tipo: 'frame', x: 740, y: 400, w: 820, h: 380, titulo: 'Por mes' },
        { id: 'por_mes', tipo: 'query', x: 770, y: 450, w: 360, h: 300, marco: 'marco_meses', sql: ["SELECT date_trunc('month', fecha)::DATE AS mes, round(sum(importe), 0) AS venta", 'FROM ventas_anio', 'GROUP BY mes', 'ORDER BY mes'] },
        { id: 'grafico_meses', tipo: 'chart', x: 1170, y: 450, w: 360, h: 300, marco: 'marco_meses', desde: 'por_mes', grafico: { chartType: 'line', xAxisKey: 'mes', yAxisKeys: ['venta'], numberFormat: 'compact' } },
        { id: 'cifra_total', tipo: 'number', x: 360, y: 360, w: 300, h: 170, desde: 'ventas_anio', cifra: { columna: 'importe', agregado: 'sum', etiqueta: 'Venta del año' } },
        { id: 'nota_1', tipo: 'note', x: 380, y: 580, w: 260, h: 150, texto: 'Octubre está incompleto: el archivo llega el día 5 del mes siguiente.' },
    ],
});
console.log('ok');
