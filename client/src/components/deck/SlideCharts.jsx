/**
 * Varias figuras en una lámina, con la escala vertical igualada.
 *
 * Es la parte cara de las láminas `chart-grid` y `compare`: cada `.amoxvis`
 * calcula su propio dominio, así que cuatro small multiples salen con cuatro
 * escalas distintas y la comparación miente — justo lo contrario de para lo
 * que existe una rejilla de figuras.
 *
 * El reparto es en dos tiempos y no hay forma de evitarlo: primero cada figura
 * dice hasta dónde llega, y sólo entonces se puede calcular el dominio común y
 * devolvérselo. La alternativa —pedirle al autor que cuadre a mano el eje de
 * cuatro archivos— es pedirle que se equivoque.
 *
 * Aquí la tarjeta VUELVE (docs/dev/sistema_deck.html, apartado 05): con dos o
 * más figuras el borde deja de competir y hace un trabajo real, decir que esto
 * es una unidad y aquello otra. Sin él, cuatro dibujos contiguos se leen como
 * un solo gráfico raro.
 */
import { useCallback, useMemo, useState } from 'react';
import { LuX, LuPlus, LuTriangleAlert } from 'react-icons/lu';
import AmoxChartEmbed from './AmoxChartEmbed';

// Tipos que se apoyan en una base: sin el cero, una barra miente sobre su
// propia magnitud. Una línea, en cambio, no necesita cero — forzarlo aplana
// justo las diferencias que unos small multiples existen para enseñar.
const CON_BASE = new Set([
    'bar', 'bar-horizontal', 'bar-stacked', 'bar-100',
    'bar-horizontal-stacked', 'bar-horizontal-100',
    'area', 'waterfall', 'funnel', 'combo',
]);

// Tipos sin eje vertical: un anillo o un treemap no tienen escala que igualar,
// y sus valores no deben arrastrar la de los demás.
const SIN_EJE = new Set(['donut', 'pie', 'treemap', 'heatmap']);

// Cuánto puede separarse la figura mayor de la menor antes de que una escala
// común deje de ayudar. Con más de esto, la pequeña se aplana contra el eje y
// deja de decir nada — que es peor que dos escalas distintas bien etiquetadas.
const RAZON_MAXIMA = 25;

/**
 * El dominio que comparten las figuras hermanas, o `null` con el motivo.
 *
 * Compartir escala sólo ayuda si lo que se compara es comparable. Igualar el
 * eje de unas barras de coste (cientos de miles) con uno de impresiones
 * (cientos de millones) no hace honesta la comparación: hace invisible la
 * primera. Cuando no se puede justificar, no se impone y se dice por qué.
 */
export function dominioComun(medidas) {
    const conEje = (medidas || []).filter(
        (m) => m && Number.isFinite(m.min) && Number.isFinite(m.max) && !SIN_EJE.has(m.chartType),
    );
    if (conEje.length < 2) return { dominio: null, motivo: null };

    const rangos = conEje.map((m) => Math.abs(m.max - m.min)).filter((r) => r > 0);
    if (rangos.length >= 2) {
        const razon = Math.max(...rangos) / Math.min(...rangos);
        if (razon > RAZON_MAXIMA) {
            return {
                dominio: null,
                motivo: `las figuras se diferencian en ${Math.round(razon)}×: con una escala común la más pequeña se aplana contra el eje`,
            };
        }
    }

    let min = Math.min(...conEje.map((m) => m.min));
    let max = Math.max(...conEje.map((m) => m.max));
    if (!(max > min)) return { dominio: null, motivo: null };

    if (conEje.some((m) => CON_BASE.has(m.chartType))) {
        min = Math.min(0, min);
        max = Math.max(0, max);
    }

    // Un respiro arriba para que la serie más alta no toque el borde.
    const margen = (max - min) * 0.05;
    return { dominio: [min === 0 ? 0 : min - margen, max + margen], motivo: null };
}

/** Una figura de la rejilla, con su tarjeta y su título. */
function Figura({ chart, variables, refreshToken, yDomain, onMedida, onProcedencia, onQuitar }) {
    const [piezas, setPiezas] = useState(null);
    const recibirPiezas = useCallback((p) => setPiezas(p), []);
    // En una rejilla la tarjeta es el defecto; `card: false` la quita.
    const conTarjeta = chart.card !== false;

    return (
        <div className={`deck-figura${conTarjeta ? ' deck-figura--tarjeta' : ''}`}>
            {onQuitar && (
                <button type="button" className="deck-chart-remove" title="Remove chart" onClick={onQuitar}>
                    <LuX size={13} />
                </button>
            )}
            {piezas?.title && <div className="deck-figura-titulo">{piezas.title}</div>}
            <AmoxChartEmbed
                src={chart.src}
                card={false}
                variables={variables}
                refreshToken={refreshToken}
                yDomain={yDomain}
                onMedida={onMedida}
                onPiezas={recibirPiezas}
                onProcedencia={onProcedencia}
            />
        </div>
    );
}

const SlideCharts = ({ charts = [], variables, refreshToken, onProcedencia, modo = 'grid', onQuitar, onAnadir }) => {
    const [medidas, setMedidas] = useState({});

    const anotarMedida = useCallback((i) => (m) => {
        setMedidas((prev) => (prev[i] === m ? prev : { ...prev, [i]: m }));
    }, []);

    const { dominio, motivo } = useMemo(
        () => dominioComun(charts.map((_, i) => medidas[i])),
        [charts, medidas],
    );

    // En el diseñador siempre hay un hueco libre a la vista, hasta el tope:
    // cuatro en una rejilla, dos en una comparación (que es lo que es).
    const tope = modo === 'compare' ? 2 : 4;
    const puedeAnadir = !!onAnadir && charts.length < tope;
    if (!charts.length && !puedeAnadir) return null;

    // Dos figuras se leen mejor una al lado de otra; a partir de tres, en
    // cuadrícula. Una fila de cuatro deja cada dibujo demasiado estrecho para
    // que sus etiquetas quepan.
    const total = charts.length + (puedeAnadir ? 1 : 0);
    const columnas = modo === 'compare' ? 2 : (total <= 2 ? Math.max(total, 1) : 2);

    return (
        <>
        {motivo && (
            <span className="deck-aviso">
                <LuTriangleAlert size={11} />
                Escala sin igualar: {motivo}.
            </span>
        )}
        <div className="deck-figuras" style={{ '--cols': columnas }}>
            {charts.map((chart, i) => (
                <Figura
                    key={`${chart.src}-${chart.slot || i}`}
                    chart={chart}
                    variables={variables}
                    refreshToken={refreshToken}
                    yDomain={dominio}
                    onMedida={anotarMedida(i)}
                    onProcedencia={i === 0 ? onProcedencia : undefined}
                    onQuitar={onQuitar ? () => onQuitar(i) : undefined}
                />
            ))}
            {puedeAnadir && (
                <button type="button" className="deck-chart-slot deck-chart-slot--empty" onClick={onAnadir}>
                    <LuPlus size={20} />
                    <span>Add a chart</span>
                    <span className="deck-chart-slot-sub">Pick one from the Charts panel</span>
                </button>
            )}
        </div>
        </>
    );
};

export default SlideCharts;
