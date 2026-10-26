/**
 * El `.amoxvis` desde el servidor (5.16, plan_graficos_vega_lite.md, Dec-69).
 *
 * El archivo es un Vega-Lite válido con lo de AmoxSQL en `usermeta.amoxsql`
 * (consulta, origen y el estado de los paneles). El cliente tiene el traductor
 * completo (`client/src/components/DataVisualizer/vega/deStoryFlow.js`) y al
 * abrir la figura REHACE el spec desde los paneles; lo que escribe aquí el
 * servidor —el nodo de gráfico de Data Flow, la galería— es un spec sencillo
 * pero correcto, para que el archivo sirva fuera de AmoxSQL desde el primer
 * momento. Al guardarlo desde Story Flow se reescribe con el spec completo.
 *
 * `leer` acepta también el formato anterior (la configuración plana con `query`).
 */
const ESQUEMA_VL = 'https://vega.github.io/schema/vega-lite/v6.json';
const VERSION = 2;

function esSpecVega(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (typeof o.$schema === 'string' && /vega/i.test(o.$schema)) return true;
    return !!(o.usermeta && o.usermeta.amoxsql) || !!(o.mark || o.layer || o.marks);
}

/** Archivo (texto u objeto) → objeto plano: las claves de los paneles + query + source. */
function leer(entrada) {
    let o = entrada;
    if (typeof o === 'string') {
        try { o = JSON.parse(o); } catch { return {}; }
    }
    if (!o || typeof o !== 'object') return {};
    if (!esSpecVega(o)) return o.config && typeof o.config === 'object' ? { ...o.config, query: o.query } : o;
    const am = (o.usermeta && o.usermeta.amoxsql) || {};
    const plano = { ...(am.interfaz || {}), query: am.consulta || '', modo: am.modo === 'codigo' || !am.interfaz ? 'codigo' : 'interfaz' };
    if (am.origen) plano.source = am.origen;
    if (!plano.chartTitle && o.title) plano.chartTitle = typeof o.title === 'string' ? o.title : (o.title.text || '');
    return plano;
}

const campo = (n) => String(n).replace(/([.[\]\\])/g, '\\$1');

/** Un spec sencillo: la marca del tipo y X/Y. El cliente lo rehace completo al abrir. */
function specBasico(c) {
    const tipo = c.chartType || 'bar';
    const X = c.xAxisKey, Y = (c.yAxisKeys || [])[0];
    const spec = { $schema: ESQUEMA_VL };
    if (c.chartTitle) spec.title = { text: c.chartTitle, ...(c.chartSubtitle ? { subtitle: c.chartSubtitle } : {}) };
    spec.data = { name: 'dataset' };
    if (!X || !Y) return { ...spec, mark: 'bar' };
    const y = { aggregate: 'sum', field: campo(Y), type: 'quantitative' };
    const x = { field: campo(X), type: 'nominal' };
    if (tipo === 'donut' || tipo === 'pie') {
        return { ...spec, mark: { type: 'arc', ...(tipo === 'donut' ? { innerRadius: 60 } : {}) }, encoding: { theta: y, color: x } };
    }
    if (tipo === 'scatter' || tipo === 'bubble') {
        return { ...spec, mark: 'circle', encoding: { x: { field: campo(X), type: 'quantitative' }, y: { field: campo(Y), type: 'quantitative' } } };
    }
    const marca = tipo === 'line' ? 'line' : tipo === 'area' ? 'area' : 'bar';
    const horizontal = tipo.startsWith('bar-horizontal');
    return { ...spec, mark: marca, encoding: horizontal ? { y: x, x: y } : { x, y } };
}

/** Objeto plano → archivo. Mismo orden de claves que el cliente. */
function escribir(plano = {}) {
    const { query, source, modo, spec: propio, ...interfaz } = plano;
    const spec = propio && typeof propio === 'object' ? propio : specBasico(plano);
    const { usermeta, ...resto } = spec;
    return {
        ...resto,
        usermeta: {
            ...(usermeta || {}),
            amoxsql: {
                version: VERSION,
                modo: modo === 'codigo' ? 'codigo' : 'interfaz',
                consulta: query || '',
                ...(source ? { origen: source } : {}),
                interfaz,
            },
        },
    };
}

const texto = (plano) => JSON.stringify(escribir(plano), null, 2);

module.exports = { leer, escribir, texto, esSpecVega, ESQUEMA_VL };
