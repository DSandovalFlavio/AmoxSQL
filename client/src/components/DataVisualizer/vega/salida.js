/**
 * Sal con tu gráfico (5.18, Dec-74): la figura fuera de AmoxSQL.
 *
 *   - Vega-Lite con los datos dentro (`data.values`): abre en cualquier editor de
 *     Vega-Lite tal cual.
 *   - Plantilla con los datos por nombre (`dataset`): la convención de los
 *     visuales que reciben los datos de otro sitio (Deneb, en Power BI).
 *   - Un script de Python: la consulta en DuckDB y la figura con Altair.
 *
 * Lo único propio de AmoxSQL que puede quedar en un spec es el formato de número
 * (`formatType: "amoxNumero"` y la función `amoxNumero()` en expresiones): fuera
 * no existe, así que se traduce a un formato d3 equivalente. Funciones PURAS.
 */
import { FORMATO_AMOX } from './deStoryFlow';
import { esVegaCompleto } from './figura';

/** «compact|-1» → un formato d3. Lo que no tiene equivalente exacto se aproxima. */
export function formatoD3(formato) {
    const [tipo, dec] = String(formato || 'compact|-1').split('|');
    const d = Number(dec);
    const fijos = Number.isFinite(d) && d >= 0;
    switch (tipo) {
        case 'standard': return fijos ? `,.${d}f` : ',.2~f';
        case 'currency': return fijos ? `$,.${d}f` : '$,.0f';
        case 'percent': return fijos ? `,.${d}f` : ',.1~f';   // los valores ya vienen en %
        case 'raw': return fijos ? `.${d}f` : '';
        case 'thousands': case 'millions': case 'billions': case 'compact':
        default: return fijos ? `.${Math.max(1, d + 1)}~s` : '.3~s';
    }
}

const LLAMADA = new RegExp(`${FORMATO_AMOX}\\((datum(?:\\[[^\\]]+\\]|\\.[\\w$]+)),\\s*"([^"]*)"\\)`, 'g');

/** El spec sin nada que solo entienda AmoxSQL. */
export function paraFuera(spec) {
    const ir = (v) => {
        if (typeof v === 'string') return v.includes(FORMATO_AMOX) ? v.replace(LLAMADA, (_, arg, f) => `format(${arg}, '${formatoD3(f)}')`) : v;
        if (Array.isArray(v)) return v.map(ir);
        if (v && typeof v === 'object') {
            const r = {};
            for (const [k, x] of Object.entries(v)) {
                if (k === 'formatType' && x === FORMATO_AMOX) continue;
                if (k === 'format' && v.formatType === FORMATO_AMOX) {
                    const f = formatoD3(x);
                    if (f) r.format = f;
                    continue;
                }
                r[k] = ir(x);
            }
            return r;
        }
        return v;
    };
    return ir(spec);
}

/** El orden de claves de un spec legible: lo que se mira primero, arriba. */
function ordenado(spec) {
    const { $schema, title, description, data, ...resto } = spec;
    return { ...($schema ? { $schema } : {}), ...(title ? { title } : {}), ...(description ? { description } : {}), ...(data ? { data } : {}), ...resto };
}

/**
 * @param {object} archivo  El .amoxvis (lo que devuelve escribirAmoxvis).
 * @param {object} op
 * @param {'valores'|'nombre'} op.datos   Con los datos dentro o por nombre (`dataset`).
 * @param {object[]} [op.filas]           Las filas (ya preparadas) para `valores`.
 * @param {object} [op.config]            El aspecto de AmoxSQL como `config`, si se quiere llevar.
 */
export function specDeSalida(archivo, { datos = 'valores', filas = [], config = null } = {}) {
    const { usermeta, ...spec } = paraFuera(archivo);
    const consulta = usermeta?.amoxsql?.consulta;
    const vega = esVegaCompleto(spec);
    const conDatos = datos === 'valores';
    if (vega) {
        // Vega: `data` es una lista y la primera fuente es la de la consulta.
        spec.data = (spec.data || []).map(d => (d.name === 'dataset' && conDatos ? { name: 'dataset', values: filas } : d));
    } else {
        spec.data = conDatos ? { values: filas } : { name: 'dataset' };
    }
    if (config) spec.config = { ...config, ...(spec.config || {}) };
    if (consulta) spec.description = `${spec.description ? `${spec.description}\n` : ''}SQL: ${consulta}`;
    return ordenado(spec);
}

/** Python con DuckDB y Altair. Solo Vega-Lite: Altair no lee specs de Vega. */
export function scriptDePython(archivo, { base = 'base.duckdb', config = null } = {}) {
    if (esVegaCompleto(archivo)) return null;
    const consulta = (archivo.usermeta?.amoxsql?.consulta || '').trim().replace(/;+\s*$/, '');
    const spec = specDeSalida(archivo, { datos: 'nombre', config });
    delete spec.data;
    delete spec.description;
    const json = JSON.stringify(spec, null, 2).replace(/'''/g, "\\'\\'\\'");
    // Cada forma de spec es una clase distinta en Altair.
    const clase = spec.layer ? 'LayerChart' : spec.hconcat ? 'HConcatChart' : spec.vconcat ? 'VConcatChart'
        : spec.concat ? 'ConcatChart' : spec.facet ? 'FacetChart' : spec.repeat ? 'RepeatChart' : 'Chart';
    return `# Figura exportada de AmoxSQL: la consulta en DuckDB y la figura con Altair.
#   pip install duckdb altair pandas
import json

import altair as alt
import duckdb

con = duckdb.connect(${JSON.stringify(base)}, read_only=True)  # la base del proyecto
consulta = """
${consulta.replace(/"""/g, '\\"\\"\\"')}
"""
df = con.sql(consulta).df()

spec = json.loads(r'''
${json}
''')
spec["data"] = {"values": json.loads(df.to_json(orient="records", date_format="iso"))}

figura = alt.${clase}.from_dict(spec)
figura.save("figura.html")
`;
}
