// Las 12 figuras escritas en Vega-Lite tal cual las pegaría alguien en Deneb:
// los datos llegan por nombre ("dataset") y el aspecto lo pone el tema, no la figura.
const GRIS = '#b8bcc4', ROJO = '#f2545b', AZUL = '#2a7ab9';
const D = { name: 'dataset' };
const $schema = 'https://vega.github.io/schema/vega-lite/v6.json';

export const specs = {
  '01_cvr_diario': {
    $schema, data: D, datos: 'cvr_diario', width: 460, height: 240,
    encoding: {
      x: { field: 'fecha', type: 'temporal', timeUnit: 'yearmonthdate', axis: { format: '%b', title: null } },
      y: { field: 'cvr', type: 'quantitative', axis: { format: '.1%', title: 'CVR diario de Meta' } },
    },
    layer: [
      { mark: { type: 'line', color: GRIS } },
      { transform: [{ filter: { field: 'fecha', range: [{ year: 2025, month: 6, date: 10 }, { year: 2025, month: 6, date: 26 }] } }], mark: { type: 'line', color: ROJO, strokeWidth: 2.5 } },
    ],
  },

  '02_histograma_cpa': {
    $schema, data: D, datos: 'cpa_mes', width: 460, height: 240,
    layer: [
      { mark: { type: 'bar', color: GRIS, binSpacing: 1 },
        encoding: { x: { field: 'cpa', bin: { maxbins: 20 }, title: 'CPA del mes (MXN)' }, y: { aggregate: 'count', title: 'Campañas-mes' } } },
      { mark: { type: 'rule', strokeWidth: 2 }, encoding: { x: { aggregate: 'mean', field: 'cpa' }, color: { datum: 'Media' } } },
      { mark: { type: 'rule', strokeWidth: 2 }, encoding: { x: { aggregate: 'median', field: 'cpa' }, color: { datum: 'Mediana' } } },
    ],
    encoding: { color: { scale: { domain: ['Media', 'Mediana'], range: [ROJO, AZUL] }, legend: { orient: 'top', title: null } } },
  },

  '03_peso_calculo': {
    $schema, data: D, datos: 'peso', width: 420,
    mark: 'bar',
    encoding: {
      y: { field: 'canal', type: 'nominal', sort: { op: 'max', field: 'peso', order: 'descending' }, title: null },
      yOffset: { field: 'calculo', sort: ['Promedio simple', 'CPA del cliente'] },
      x: { field: 'peso', type: 'quantitative', axis: { format: '.0%' }, title: 'Peso en el cálculo' },
      color: { field: 'calculo', scale: { domain: ['Promedio simple', 'CPA del cliente'], range: [GRIS, ROJO] }, legend: { orient: 'top', title: null } },
    },
  },

  '04_caja_cpa': {
    $schema, data: D, datos: 'cpa_diario', width: 460,
    mark: { type: 'boxplot', extent: 1.5, size: 16, median: { color: '#333' } },
    encoding: {
      y: { field: 'campana', type: 'nominal', title: null, sort: ['Search - Marca', 'Meta - Prospección', 'Meta - Retargeting', 'Search - Genérica'] },
      x: { field: 'cpa', type: 'quantitative', title: 'CPA diario (MXN)' },
      color: { condition: { test: "datum.campana === 'Meta - Retargeting'", value: ROJO }, value: GRIS },
    },
  },

  '05_histograma_ingresos': {
    $schema, data: D, datos: 'ingresos', width: 460, height: 240,
    layer: [
      { mark: { type: 'bar', color: GRIS, binSpacing: 1 },
        encoding: { x: { field: 'ingresos', bin: { maxbins: 40 }, title: 'Ingresos del día (MXN)' }, y: { aggregate: 'count', title: 'Días' } } },
      { mark: { type: 'rule', color: ROJO, strokeWidth: 2 }, encoding: { x: { aggregate: 'mean', field: 'ingresos' }, strokeDash: { datum: 'Media' } } },
      { mark: { type: 'rule', color: ROJO, strokeWidth: 2 }, encoding: { x: { aggregate: 'median', field: 'ingresos' }, strokeDash: { datum: 'Mediana' } } },
    ],
    encoding: { strokeDash: { scale: { domain: ['Media', 'Mediana'], range: [[1, 0], [5, 3]] }, legend: { orient: 'top', title: null } } },
  },

  '06_cupones_gasto': {
    $schema, data: D, datos: 'cupones', width: 320, height: 260,
    transform: [
      { fold: ['cupones', 'gasto'], as: ['serie', 'valor'] },
      { joinaggregate: [{ op: 'min', field: 'valor', as: 'mn' }, { op: 'max', field: 'valor', as: 'mx' }], groupby: ['serie'] },
      { calculate: '(datum.valor - datum.mn) / (datum.mx - datum.mn)', as: 'escala' },
    ],
    mark: { type: 'line', point: true },
    encoding: {
      x: { field: 'mes', type: 'ordinal', title: 'Mes de 2025' },
      y: { field: 'escala', type: 'quantitative', title: 'Escala min-max (0 = mes más bajo)' },
      color: { field: 'serie', scale: { range: [AZUL, ROJO] }, legend: { orient: 'top', title: null } },
    },
  },

  '07_roas_meta': {
    $schema, data: D, datos: 'roas_meta', width: 360, height: 260,
    encoding: { x: { field: 'mes', type: 'ordinal', title: 'Mes de 2025', axis: { labelAngle: 0 } }, y: { field: 'roas', type: 'quantitative', scale: { zero: false }, title: 'ROAS de Meta' } },
    layer: [
      { mark: { type: 'line', color: GRIS } },
      { mark: { type: 'point', filled: true },
        encoding: { color: { condition: { test: 'datum.mes === 10', value: ROJO }, value: '#6b7079' }, size: { condition: { test: 'datum.mes === 10', value: 120 }, value: 30 } } },
    ],
  },

  '08_tv_ventas': {
    $schema, data: D, datos: 'tv_semana', width: 440, height: 280,
    mark: { type: 'circle', size: 60, opacity: 0.9 },
    encoding: {
      x: { field: 'tv', type: 'quantitative', title: 'Inversión semanal en TV (MXN)' },
      y: { field: 'ventas', type: 'quantitative', title: 'Ventas de la semana (MXN)' },
      color: { field: 'temporada', scale: { domain: ['Baja', 'Alta'], range: [GRIS, ROJO] }, legend: { orient: 'top', title: 'Temporada' } },
    },
  },

  '09_correlaciones': {
    $schema, data: D, datos: 'correlaciones', width: 340, height: 300,
    encoding: {
      x: { field: 'b', type: 'nominal', sort: null, axis: { orient: 'top', labelAngle: 0 }, title: null },
      y: { field: 'a', type: 'nominal', sort: null, title: null },
    },
    layer: [
      { mark: 'rect', encoding: { color: { field: 'r', type: 'quantitative', scale: { domain: [-1, 1], domainMid: 0, range: [AZUL, '#f4f6f8', ROJO] }, legend: { orient: 'top', direction: 'horizontal' } } } },
      { mark: { type: 'text', fontSize: 12 }, encoding: { text: { field: 'r', format: '.2f' } } },
    ],
  },

  '10_roas_campanas': {
    $schema, data: D, datos: 'roas', width: 440,
    title: { text: 'Tres campañas no recuperan lo que cuestan', subtitle: 'ROAS de Moda Nube, 2025. Línea punteada: ROAS = 1', anchor: 'start' },
    encoding: {
      y: { field: 'campana', type: 'nominal', sort: { field: 'roas', op: 'sum', order: 'descending' }, title: null },
      x: { field: 'roas', type: 'quantitative', axis: null },
    },
    layer: [
      { mark: 'bar', encoding: { color: { condition: { test: 'datum.roas < 1', value: ROJO }, value: GRIS } } },
      { mark: { type: 'text', align: 'left', dx: 4 }, encoding: { text: { field: 'roas', format: '.2f' } } },
      { mark: { type: 'rule', strokeDash: [3, 3], color: '#555' }, encoding: { x: { datum: 1 }, y: null } },
    ],
  },

  '11_lift_intervalos': {
    $schema, data: D, datos: 'lift', width: 440,
    encoding: { y: { field: 'grupo', type: 'nominal', sort: null, title: null } },
    layer: [
      { mark: 'bar', encoding: { x: { field: 'lift', type: 'quantitative', title: 'Lift en recuerdo de marca (pp)' }, color: { condition: { test: "datum.grupo === 'Ajustada'", value: ROJO }, value: GRIS } } },
      { mark: { type: 'errorbar', color: '#333', thickness: 1.5 }, encoding: { x: { field: 'bajo', type: 'quantitative' }, x2: { field: 'alto' } } },
    ],
  },

  '12_inversion_ventas': {
    $schema, data: D, datos: 'inversion', width: 440, height: 280,
    encoding: {
      x: { field: 'inversion', type: 'quantitative', title: 'Inversión semanal (MXN)' },
      y: { field: 'ventas', type: 'quantitative', title: 'Ventas de la semana (MXN)' },
    },
    layer: [
      { mark: { type: 'circle', color: GRIS, size: 50 } },
      { mark: { type: 'line', color: ROJO, strokeWidth: 2 }, transform: [{ regression: 'ventas', on: 'inversion' }] },
    ],
  },
};

// La capa AmoxSQL: un `config` de Vega-Lite. Es lo único que hace que la figura
// "se vea nuestra"; quitarla deja un Vega-Lite estándar que se ve correcto igual.
export const tema = {
  font: 'Segoe UI, system-ui, sans-serif',
  background: '#ffffff',
  padding: 12,
  view: { stroke: null },
  axis: { domainColor: '#c9ccd2', tickColor: '#c9ccd2', gridColor: '#eceef1', gridDash: [2, 4], labelColor: '#3c4048', titleColor: '#7a3e3e', titleFontWeight: 'normal', labelFontSize: 11, titleFontSize: 11 },
  axisY: { domain: false, ticks: false },
  axisBand: { grid: false },
  legend: { labelColor: '#3c4048', symbolType: 'stroke' },
  title: { fontSize: 15, subtitleColor: '#6b7079', color: '#1f2228' },
  range: { category: ['#2a7ab9', '#f2545b', '#b8bcc4', '#e4a43a', '#25a08d'] },
  numberFormat: ',.0f',
};
