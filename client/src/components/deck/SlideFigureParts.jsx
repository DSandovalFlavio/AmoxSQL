/**
 * Las piezas que suben de la figura a la lámina.
 *
 * Cuando la tarjeta de Story Flow se disuelve dentro de una diapositiva (ver
 * docs/dev/sistema_deck.html, apartado 05), sus piezas no desaparecen: cambian
 * de dueño. El título pasa a ser la afirmación de la lámina — pero sólo si la
 * lámina no tiene la suya —, el KPI se convierte en una métrica de la lámina,
 * la conclusión conserva su filete de acento, la nota al pie se une al pie de
 * procedencia y la firma desaparece, porque el pie ya la lleva y con más
 * información.
 *
 * El KPI llega ya formateado desde el DataVisualizer: la matriz de validez de
 * la comparación vive en `computeHeadline` y duplicarla aquí sería repetir un
 * error que ya costó una ronda de correcciones.
 */

/**
 * ¿La lámina escribe su propio encabezado? Si lo hace, el de la figura sobra —
 * nunca se enseñan los dos.
 *
 * Es una comprobación de texto, no un parseo: un `#` dentro de un bloque de
 * código cercado cuenta como encabezado. La consecuencia es leve (el título de
 * la figura no asciende) y no compensa montar un parser de markdown aquí para
 * cubrirlo. Cuatro espacios de sangría sí se descartan, porque eso ya es un
 * bloque de código indentado.
 */
export function tieneTituloPropio(markdown) {
    return /^ {0,3}#{1,6}\s+\S/m.test(markdown || '');
}

/** El título de la figura, ascendido a afirmación de la lámina. */
export function SlideTituloHeredado({ titulo }) {
    if (!titulo || !titulo.trim()) return null;
    return <h2 className="deck-slide-titulo-heredado">{titulo}</h2>;
}

/**
 * El KPI de la figura como métrica de la lámina. La pastilla de variación sólo
 * aparece cuando hay una comparación válida que nombrar: sin esa etiqueta un
 * "+7658 %" se puede leer como cualquier cosa.
 */
export function SlideKpi({ kpi }) {
    if (!kpi) return null;

    const signo = kpi.deltaPercent > 0 ? 'deck-kpi-delta--pos'
        : kpi.deltaPercent < 0 ? 'deck-kpi-delta--neg'
            : '';

    return (
        <div className="deck-kpi">
            {kpi.label && <u className="deck-kpi-etiqueta">{kpi.label}</u>}
            <div className="deck-kpi-linea">
                <b className="deck-kpi-valor">{kpi.value}</b>
                {kpi.deltaPercent !== null && kpi.deltaPercent !== undefined && kpi.compareLabel && (
                    <s className={`deck-kpi-delta ${signo}`}>
                        {kpi.deltaPercent >= 0 ? '+' : ''}{kpi.deltaPercent.toFixed(1)}%
                    </s>
                )}
            </div>
            {kpi.compareLabel && (
                <em className="deck-kpi-base">
                    {kpi.delta ? `(${kpi.delta}) ` : ''}{kpi.compareLabel}
                </em>
            )}
        </div>
    );
}

/** La conclusión de la figura, con el filete de acento que ya tenía. */
export function SlideTakeaway({ texto }) {
    if (!texto || !texto.trim()) return null;
    return <div className="deck-figura-takeaway">{texto}</div>;
}
