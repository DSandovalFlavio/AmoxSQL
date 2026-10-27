/**
 * El código manda (Dec-77, plan_graficos_vega_lite.md).
 *
 * Una figura es SIEMPRE: lo que generan los paneles (`deStoryFlow`) + los
 * «extras», lo que el usuario escribió en código y los paneles no saben
 * representar. Así nunca hay que elegir entre paneles y código:
 *
 *   spec = aplicar(deStoryFlow(paneles), extras)
 *
 * Al editar el código (`asimilarCodigo`):
 *   1. lo que los paneles SÍ representan vuelve a ellos (`leerPaneles`): el tipo,
 *      las columnas, los títulos de eje, la rejilla, el orden, la meta…;
 *   2. lo demás queda como `extras = diferencia(base, código)`.
 * La garantía: `aplicar(base, diferencia(base, código))` es EXACTAMENTE el código.
 *
 * Las capas que genera Story Flow llevan nombre (`amox_principal`, `amox_meta`…).
 * Con eso los extras sobreviven a un cambio en los paneles: un parche sobre la
 * capa principal se vuelve a aplicar sobre la nueva principal, una capa escrita
 * a mano se conserva, y una capa que el código quitó sigue quitada.
 *
 * Funciones PURAS, probadas en scripts/probarGraficos.mjs.
 */
import { DEFAULT_CONFIG } from '../constants';
import { deStoryFlow } from './deStoryFlow';

/** Igualdad profunda sin mirar el orden de las claves (el usuario las reordena al escribir). */
function igual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => igual(x, b[i]));
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && igual(a[k], b[k]));
}
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clonar = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
export const PREFIJO = 'amox_';
const esCapaNuestra = (c) => esObjeto(c) && typeof c.name === 'string' && c.name.startsWith(PREFIJO);
const sonCapas = (a) => Array.isArray(a) && a.some(esCapaNuestra);
const esOp = (p) => esObjeto(p) && ('$set' in p || '$del' in p || '$capas' in p);

/** El parche que lleva de `a` a `b`, o undefined si son iguales. */
export function diferencia(a, b) {
    if (igual(a, b)) return undefined;
    if (esObjeto(a) && esObjeto(b)) {
        const nodo = {};
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (!(k in b)) nodo[k] = { $del: true };
            else if (!(k in a)) nodo[k] = { $set: clonar(b[k]) };
            else {
                const d = diferencia(a[k], b[k]);
                if (d !== undefined) nodo[k] = d;
            }
        }
        return Object.keys(nodo).length ? nodo : undefined;
    }
    if (Array.isArray(b) && (sonCapas(a) || sonCapas(b))) {
        const previas = new Map((Array.isArray(a) ? a : []).filter(esCapaNuestra).map(c => [c.name, c]));
        const usadas = new Set();
        const entradas = b.map((capa) => {
            if (esCapaNuestra(capa) && previas.has(capa.name) && !usadas.has(capa.name)) {
                usadas.add(capa.name);
                const d = diferencia(previas.get(capa.name), capa);
                return d === undefined ? { $ref: capa.name } : { $ref: capa.name, parche: d };
            }
            return { $nueva: clonar(capa) };
        });
        const quitadas = [...previas.keys()].filter(n => !usadas.has(n));
        return { $capas: entradas, ...(quitadas.length ? { $quitadas: quitadas } : {}) };
    }
    return { $set: clonar(b) };
}

/** Aplica un parche de `diferencia`. */
export function aplicar(a, p) {
    if (p === undefined || p === null) return clonar(a);
    if (esObjeto(p) && '$set' in p) return clonar(p.$set);
    if (esObjeto(p) && '$capas' in p) {
        const base = Array.isArray(a) ? a : [];
        const porNombre = new Map(base.filter(esCapaNuestra).map(c => [c.name, c]));
        const quitadas = new Set(p.$quitadas || []);
        const vistas = new Set();
        const r = [];
        for (const e of p.$capas) {
            if (e.$ref) {
                vistas.add(e.$ref);
                // Una capa que los paneles ya no generan (se apagó la meta) se va,
                // aunque el código la hubiera retocado.
                if (porNombre.has(e.$ref)) r.push(aplicar(porNombre.get(e.$ref), e.parche));
            } else if (e.$nueva) r.push(clonar(e.$nueva));
        }
        // Capas que los paneles generan ahora y el código no conocía: al final.
        for (const c of base) {
            if (esCapaNuestra(c) && !vistas.has(c.name) && !quitadas.has(c.name)) r.push(clonar(c));
        }
        return r;
    }
    if (esObjeto(p) && !esOp(p)) {
        const r = esObjeto(a) ? clonar(a) : {};
        for (const [k, sub] of Object.entries(p)) {
            if (esObjeto(sub) && sub.$del) delete r[k];
            else r[k] = aplicar(r[k], sub);
        }
        return r;
    }
    return clonar(p);
}

/**
 * Las rutas del CÓDIGO (no de la base) que son extras: para contarlas y para
 * marcarlas en el editor. Una clave borrada se marca en su objeto padre.
 */
export function rutasDeExtras(p, ruta = []) {
    if (p === undefined) return [];
    if (esObjeto(p) && '$set' in p) return [ruta];
    if (esObjeto(p) && '$capas' in p) {
        const r = [];
        p.$capas.forEach((e, i) => {
            if (e.$nueva) r.push([...ruta, i]);
            else if (e.parche) r.push(...rutasDeExtras(e.parche, [...ruta, i]));
        });
        // Una capa quitada no está en el código: no hay línea que marcar (la nombra el aviso).
        return r;
    }
    if (esObjeto(p) && !esOp(p)) {
        return Object.entries(p).flatMap(([k, sub]) => (esObjeto(sub) && sub.$del ? [ruta] : rutasDeExtras(sub, [...ruta, k])));
    }
    return [ruta];
}

/** Una frase corta por extra, para el aviso de los paneles. */
export function describirExtras(p, codigo) {
    const rutas = rutasDeExtras(p);
    const vistas = new Set();
    const frases = [];
    for (const ruta of rutas) {
        let nodo = codigo;
        const partes = [];
        for (const k of ruta) {
            if (typeof k === 'number') {
                nodo = nodo?.[k];
                partes.push(nodo?.name && !String(nodo.name).startsWith(PREFIJO) ? `layer "${nodo.name}"` : nodo?.mark ? `${typeof nodo.mark === 'string' ? nodo.mark : nodo.mark.type} layer` : `#${k + 1}`);
            } else {
                nodo = nodo?.[k];
                if (k !== 'layer') partes.push(k);
            }
        }
        const f = partes.join(' › ') || 'top level';
        if (!vistas.has(f)) { vistas.add(f); frases.push(f); }
    }
    // Las capas de los paneles que el código quitó.
    const quitadas = (n) => (esObjeto(n) ? [...(n.$quitadas || []), ...Object.values(n).flatMap(quitadas), ...(n.$capas || []).flatMap(e => quitadas(e.parche))] : []);
    for (const q of new Set(quitadas(p))) frases.push(`removed: ${q.replace(PREFIJO, '').replace(/_/g, ' ')}`);
    return frases;
}

// ─── Del código a los paneles ───────────────────────────────

const sinEscape = (f) => (typeof f === 'string' ? f.replace(/\\(.)/g, '$1') : f);
/** Con pequeños múltiplos, la figura vive dentro de `spec`. */
const cuerpo = (spec) => (spec?.facet && spec.spec ? spec.spec : spec);
function principalDe(raiz) {
    const spec = cuerpo(raiz);
    if (!spec) return null;
    if (Array.isArray(spec.layer)) return spec.layer.find(c => c?.name === `${PREFIJO}principal`) || spec.layer.find(c => c?.mark) || null;
    return spec.mark ? spec : null;
}
const capaDe = (raiz, rol) => { const spec = cuerpo(raiz); return Array.isArray(spec?.layer) ? spec.layer.find(c => c?.name === `${PREFIJO}${rol}`) : null; };
const tipoMarca = (capa) => (typeof capa?.mark === 'string' ? capa.mark : capa?.mark?.type);
const ejeValor = (enc) => (enc?.y?.type === 'quantitative' && enc?.x?.type !== 'quantitative' ? 'y'
    : enc?.x?.type === 'quantitative' && enc?.y?.type !== 'quantitative' ? 'x' : 'y');

/** Lo que dice el spec sobre cada panel. Solo se usa lo que CAMBIÓ respecto a la base. */
function lentes(spec) {
    const p = principalDe(spec) || {};
    const enc = { ...(spec?.encoding || {}), ...(p.encoding || {}) };
    const val = ejeValor(enc), cat = val === 'y' ? 'x' : 'y';
    const marca = p.mark && typeof p.mark === 'object' ? p.mark : {};
    const meta = capaDe(spec, 'meta'), ref = capaDe(spec, 'referencia');
    const valorRegla = (capa) => {
        if (!capa) return undefined;
        const e = capa.encoding || {};
        const pos = e.y || e.x || {};
        return pos.aggregate ? pos.aggregate : pos.datum;
    };
    return {
        marca: tipoMarca(p),
        interior: marca.innerRadius,
        x: sinEscape(enc[cat]?.field),
        y: sinEscape(enc[val]?.field),
        color: sinEscape(enc.color?.field),
        tituloX: enc[cat]?.axis === null ? null : enc[cat]?.axis?.title,
        tituloY: enc[val]?.axis === null ? null : enc[val]?.axis?.title,
        angulo: enc[cat]?.axis?.labelAngle,
        gridX: enc[cat]?.axis?.grid, gridY: enc[val]?.axis?.grid,
        lineasEje: enc[val]?.axis?.domain,
        log: enc[val]?.scale?.type,
        cero: enc[val]?.scale?.zero,
        faceta: sinEscape(spec?.facet?.field),
        columnas: spec?.columns,
        finales: !!capaDe(spec, 'etiquetas_fin'),
        viva: !!(p.params || []).some(x => x?.name === 'serie_elegida'),
        zoom: !!(p.params || []).some(x => x?.name === 'zoom'),
        dominio: enc[val]?.scale?.domain,
        orden: enc[cat]?.sort,
        interpolar: marca.interpolate,
        radio: marca.cornerRadiusEnd,
        puntos: !!marca.point,
        colorMarca: marca.color,
        leyenda: enc.color ? (enc.color.legend === null ? null : enc.color.legend?.orient) : undefined,
        meta: valorRegla(meta), metaColor: meta?.mark?.color,
        ref: valorRegla(ref), refColor: ref?.mark?.color,
        etiquetas: !!capaDe(spec, 'etiquetas'),
        tendencia: !!capaDe(spec, 'tendencia'),
        resalte: !!capaDe(spec, 'resalte') || !!enc.color?.condition,
        pliegue: Array.isArray(spec?.transform) ? spec.transform.find(t => t.fold)?.fold : undefined,
        titulo: spec?.title,
    };
}

const MARCA_A_TIPO = { line: 'line', area: 'area', circle: 'scatter', point: 'scatter', square: 'scatter', rect: 'heatmap', boxplot: 'boxplot', tick: 'strip' };
const ORDEN = (s) => (s === 'ascending' ? 'x-asc' : s === 'descending' ? 'x-desc' : s === null ? 'natural'
    : esObjeto(s) ? (s.order === 'ascending' ? 'y-asc' : 'y-desc') : undefined);

/**
 * El estado de los paneles que mejor dice este código, partiendo del anterior:
 * solo cambian los paneles cuya lente vio un cambio frente a la base.
 */
export function leerPaneles(codigo, previo, { base }) {
    const a = lentes(base), b = lentes(codigo);
    const c = { ...previo };
    const cambio = (k) => !igual(a[k], b[k]);

    if (cambio('titulo') && b.titulo !== undefined) {
        const t = typeof b.titulo === 'string' ? { text: b.titulo } : (b.titulo || {});
        c.chartTitle = Array.isArray(t.text) ? t.text.join(' ') : (t.text || '');
        c.chartSubtitle = Array.isArray(t.subtitle) ? t.subtitle.join(' ') : (t.subtitle || '');
    }
    if (cambio('marca') && b.marca) {
        if (b.marca === 'bar') {
            if (!String(c.chartType).startsWith('bar')) c.chartType = 'bar';
        } else if (b.marca === 'arc') c.chartType = b.interior ? 'donut' : 'pie';
        else if (MARCA_A_TIPO[b.marca]) c.chartType = MARCA_A_TIPO[b.marca];
    }
    if (cambio('x') && b.x) c.xAxisKey = b.x;
    if (cambio('pliegue') && Array.isArray(b.pliegue)) c.yAxisKeys = [...b.pliegue];
    else if (cambio('y') && b.y && !['valor', '__inicio', '__a'].includes(b.y)) c.yAxisKeys = [b.y];
    if (cambio('color') && b.color !== 'serie') {
        c.splitByKey = b.color && b.color !== c.xAxisKey ? b.color : '';
    }
    if (cambio('tituloX')) {
        c.showXAxisTitle = !!b.tituloX;
        if (typeof b.tituloX === 'string') c.customAxisTitles = { ...(c.customAxisTitles || {}), x: b.tituloX === c.xAxisKey ? '' : b.tituloX };
    }
    if (cambio('tituloY')) {
        c.showYAxisTitle = !!b.tituloY;
        if (typeof b.tituloY === 'string') c.customAxisTitles = { ...(c.customAxisTitles || {}), y: b.tituloY === (c.yAxisKeys || []).join(', ') ? '' : b.tituloY };
    }
    if (cambio('angulo')) c.xAxisLabelAngle = b.angulo ? -Number(b.angulo) : 0;
    if (cambio('gridX') || cambio('gridY')) {
        const horizontal = String(c.chartType).startsWith('bar-horizontal');
        const h = horizontal ? b.gridX : b.gridY, v = horizontal ? b.gridY : b.gridX;
        c.gridMode = h && v ? 'both' : h ? 'horizontal' : v ? 'vertical' : 'none';
    }
    if (cambio('lineasEje')) c.showAxisLines = !!b.lineasEje;
    if (cambio('log')) { c.yScaleType = ['log', 'sqrt'].includes(b.log) ? b.log : 'linear'; c.yLogScale = b.log === 'log'; }
    if (cambio('cero')) c.zeroBaseline = b.cero === true ? 'on' : b.cero === false ? 'off' : 'auto';
    if (cambio('faceta')) c.facetKey = b.faceta || '';
    if (cambio('columnas') && b.columnas) c.facetColumns = Number(b.columnas);
    if (cambio('finales')) c.endLabels = b.finales;
    if (cambio('viva')) c.interactiveLegend = b.viva;
    if (cambio('zoom')) c.zoomMode = b.zoom ? 'on' : 'off';
    if (cambio('dominio')) c.yAxisDomain = Array.isArray(b.dominio) ? b.dominio.map(String) : ['auto', 'auto'];
    if (cambio('orden') && ORDEN(b.orden)) c.sortMode = ORDEN(b.orden);
    if (cambio('interpolar') && b.interpolar) c.lineType = b.interpolar.startsWith('step') ? 'step' : b.interpolar;
    if (cambio('radio')) c.barRadius = Number(b.radio) || 0;
    if (cambio('puntos')) c.showDots = b.puntos;
    if (cambio('colorMarca') && typeof b.colorMarca === 'string' && c.yAxisKeys?.[0]) {
        c.seriesConfig = { ...(c.seriesConfig || {}), [c.yAxisKeys[0]]: { ...(c.seriesConfig?.[c.yAxisKeys[0]] || {}), color: b.colorMarca } };
    }
    if (cambio('leyenda')) c.legendPosition = b.leyenda === null ? (c.legendPosition === 'inline' ? 'inline' : 'none') : (b.leyenda || 'top');
    if (cambio('meta')) {
        if (b.meta === undefined) c.goalLine = { ...c.goalLine, enabled: false };
        else c.goalLine = { ...c.goalLine, enabled: true, value: String(b.meta) };
    }
    if (cambio('metaColor') && b.metaColor) c.goalLine = { ...c.goalLine, color: b.metaColor };
    if (cambio('ref')) c.refLine = { ...c.refLine, value: b.ref === undefined ? '' : String(b.ref) };
    if (cambio('refColor') && b.refColor) c.refLine = { ...c.refLine, color: b.refColor };
    if (cambio('etiquetas')) c.showLabels = b.etiquetas;
    if (cambio('tendencia') && !b.tendencia) c.trendLine = { ...c.trendLine, type: 'none' };
    if (cambio('resalte') && !b.resalte) c.highlightConfig = { ...c.highlightConfig, type: 'none' };
    return c;
}

/** Lo que genera Story Flow para dibujar (sin título: lo pone la tarjeta). */
export const especBase = (config, op) => deStoryFlow({ ...config, chartTitle: '', chartSubtitle: '', extras: null }, op);

/**
 * El código que escribió el usuario → { cambios en los paneles, extras }.
 * El título del código pasa a la tarjeta y no cuenta como extra.
 */
export function asimilarCodigo(codigo, estado, op) {
    const base = especBase(estado, op);
    const paneles = leerPaneles(codigo, { ...DEFAULT_CONFIG, ...estado }, { base });
    const { title, usermeta, ...resto } = codigo;
    const nuevaBase = especBase(paneles, op);
    const extras = diferencia(nuevaBase, resto) ?? null;
    return { ...paneles, extras, modo: 'interfaz', spec: null };
}

/** La figura que se dibuja y se guarda. */
export const especFinal = (estado, op) => aplicar(especBase(estado, op), estado.extras || undefined);
