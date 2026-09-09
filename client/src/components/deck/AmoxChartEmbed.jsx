/**
 * AmoxChartEmbed — renders a live `.amoxvis` chart inside a Report Flow slide.
 *
 * Loads the chart config + query from disk, substitutes `{{var}}` deck
 * variables into the query (same convention as SQL Notebooks), runs it
 * against DuckDB, and renders the result with DataVisualizer in report mode
 * (no editing controls). Bumping `refreshToken` re-runs the whole pipeline —
 * this is what powers the deck's "Refresh all" button: re-executing the SQL
 * brings the chart current without redoing the underlying analysis.
 */
import { API_BASE } from '../../api.js';
import { useState, useEffect, useCallback, useRef } from 'react';
import { LuLoaderCircle, LuTriangleAlert } from 'react-icons/lu';
import DataVisualizer from '../DataVisualizer';
import { injectEnvironmentVariables } from '../../utils/injectEnvironmentVariables';

/**
 * Min y max de las series verticales de una figura. Sin esto, cuatro small
 * multiples salen con cuatro escalas distintas y la comparación miente — que
 * es justo lo contrario de para lo que existe una rejilla de figuras.
 */
function extensionVertical(filas, config) {
    const claves = Array.isArray(config?.yAxisKeys) ? config.yAxisKeys : [];
    if (!claves.length || !Array.isArray(filas) || !filas.length) return null;

    let min = Infinity;
    let max = -Infinity;
    const apilado = /stacked|100/.test(config?.chartType || '');

    for (const fila of filas) {
        // Apilado: lo que hay que comparar es la altura de la pila, no cada
        // serie por separado.
        if (apilado) {
            let suma = 0;
            for (const k of claves) {
                const v = Number(fila?.[k]);
                if (Number.isFinite(v)) suma += v;
            }
            if (suma < min) min = suma;
            if (suma > max) max = suma;
            continue;
        }
        for (const k of claves) {
            const v = Number(fila?.[k]);
            if (!Number.isFinite(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max, chartType: config?.chartType || '' };
}

const AmoxChartEmbed = ({ src, variables = {}, refreshToken = 0, onProcedencia, onPiezas, onMedida, yDomain = null, palette = null, card = false }) => {
    const [state, setState] = useState({ status: 'loading', data: null, config: null, query: '', error: null });
    // Por referencia: el callback no debe entrar en las dependencias de `load`,
    // o un padre que lo redefina en cada render relanzaría la consulta en bucle.
    const onProcedenciaRef = useRef(onProcedencia);
    useEffect(() => { onProcedenciaRef.current = onProcedencia; }, [onProcedencia]);
    const onMedidaRef = useRef(onMedida);
    useEffect(() => { onMedidaRef.current = onMedida; }, [onMedida]);

    const load = useCallback(async () => {
        setState((s) => ({ ...s, status: 'loading', error: null }));
        try {
            if (!src) throw new Error('No chart path specified (missing "src" in ```amoxchart block)');
            const cleanPath = src.replace(/^(\.\/|\/)/, '');

            const fileRes = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(cleanPath)}`);
            const fileData = await fileRes.json();
            if (fileData.error) throw new Error(fileData.error);

            const config = JSON.parse(fileData.content);
            const query = injectEnvironmentVariables(config.query || '', variables);
            if (!query.trim()) throw new Error(`"${src}" has no stored query`);

            const queryRes = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });
            const queryData = await queryRes.json();
            if (!queryRes.ok) throw new Error(queryData.error || 'Query failed');

            setState({ status: 'ready', data: queryData.data, config, query, error: null });

            // La procedencia sube a la lámina para el pie: de qué archivo salió,
            // qué consulta, cuántas filas devolvió, si vino truncada y cuándo se
            // ejecutó. Todo esto ya viajaba por la red y se tiraba a la basura.
            onProcedenciaRef.current?.({
                src,
                source: config.chartSource || null,
                rows: queryData.rowCount ?? (Array.isArray(queryData.data) ? queryData.data.length : null),
                limited: !!queryData.truncated,
                rowLimit: queryData.rowLimit ?? null,
                at: Date.now(),
            });

            // La extensión vertical de esta figura, para que quien tenga varias
            // al lado pueda igualarles la escala. Se calcula aquí y no dentro
            // del DataVisualizer porque hace falta ANTES de pintar: el dominio
            // común es una entrada del dibujo, no un resultado suyo.
            onMedidaRef.current?.(extensionVertical(queryData.data, config));
        } catch (err) {
            setState({ status: 'error', data: null, config: null, query: '', error: err.message });
            onProcedenciaRef.current?.(null);
        }
    }, [src, variables]);

    useEffect(() => { load(); }, [load, refreshToken]);

    if (state.status === 'loading') {
        return (
            <div className="amoxchart-embed amoxchart-embed--status">
                <LuLoaderCircle size={20} className="spin" />
                <span>Loading {src || 'chart'}…</span>
            </div>
        );
    }

    if (state.status === 'error') {
        return (
            <div className="amoxchart-embed amoxchart-embed--status amoxchart-embed--error">
                <LuTriangleAlert size={16} />
                <span>{src ? `${src} — ` : ''}{state.error}</span>
            </div>
        );
    }

    // El dominio compartido entra como si el .amoxvis lo trajera escrito: es
    // exactamente el campo que ya existe para fijar el eje a mano.
    // La paleta del deck manda sobre la que traiga cada .amoxvis: si no, dos
    // figuras guardadas en sesiones distintas discrepan dentro de la misma
    // lámina y no hay forma de arreglarlo sin abrir los archivos uno a uno.
    let configConDominio = state.config;
    if (configConDominio && palette) configConDominio = { ...configConDominio, colorTheme: palette };
    if (configConDominio && yDomain) {
        configConDominio = { ...configConDominio, yAxisDomain: [String(yDomain[0]), String(yDomain[1])] };
    }

    if (!state.data || state.data.length === 0) {
        return <div className="amoxchart-embed amoxchart-embed--status">No data returned for {src}</div>;
    }

    return (
        <div className="amoxchart-embed">
            {/* La tarjeta se disuelve: la lámina YA es la tarjeta. `card: true`
                en el bloque ```amoxchart la recupera para quien la quiera, pero
                nunca es el valor de fábrica. */}
            <DataVisualizer
                data={state.data}
                query={state.query}
                initialChartConfig={configConDominio}
                isReportMode
                chrome={card ? 'card' : 'none'}
                onPiezas={onPiezas}
            />
        </div>
    );
};

export default AmoxChartEmbed;
