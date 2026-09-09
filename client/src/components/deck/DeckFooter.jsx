/**
 * DeckFooter — la capa de credibilidad de una lámina.
 *
 * Es lo que hace que esto sea un deck de AmoxSQL y no una plantilla bonita: el
 * gráfico YA sabe de qué archivo salió, con qué consulta, cuántas filas devolvió
 * y con qué variables se ejecutó. Todo eso viaja en el `.amoxvis` y en la
 * respuesta de `/api/query`; hasta ahora se tiraba a la basura al pintar la
 * lámina.
 *
 * Regla del contrato (docs/dev/sistema_deck.html, apartado 07): se elige QUÉ
 * campos aparecen, pero su contenido se deriva. Un pie que se pueda teclear es
 * un pie en el que no se puede confiar.
 */
import { LuTriangleAlert } from 'react-icons/lu';

const DIA_MS = 24 * 60 * 60 * 1000;
// Pasada una semana, la fecha de refresco se marca: un número viejo presentado
// como fresco es el peor fallo que puede tener una herramienta de análisis.
const DIAS_RANCIO = 7;

/** `charts/coste_region.amoxvis` → `coste_region.amoxvis` */
function nombreDeArchivo(ruta) {
    if (!ruta) return '';
    const limpia = String(ruta).replace(/\\/g, '/');
    const i = limpia.lastIndexOf('/');
    return i >= 0 ? limpia.slice(i + 1) : limpia;
}

function formatearFecha(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatearFilas(rows, limited) {
    if (rows === null || rows === undefined) return '';
    const n = rows.toLocaleString();
    // `limited` importa tanto como el conteo: un resultado truncado presentado
    // como completo es exactamente el fallo que este pie existe para evitar.
    return limited ? `${n} rows (truncated)` : `${n} rows`;
}

const DeckFooter = ({ fields = [], figure = null, variables = {}, slideNumber, refreshedAt, caveat }) => {
    if (!fields.length) return null;

    const quiere = (campo) => fields.includes(campo);
    const izquierda = [];

    const fuente = figure?.source;
    if (quiere('source') && fuente) {
        izquierda.push(<span key="source" className="deck-foot-dato">{fuente}</span>);
    }
    const consulta = nombreDeArchivo(figure?.src);
    if (quiere('query') && consulta) {
        izquierda.push(<b key="query" className="deck-foot-consulta">{consulta}</b>);
    }
    if (quiere('rows') && figure && figure.rows !== null && figure.rows !== undefined) {
        izquierda.push(
            <span key="rows" className={`deck-foot-dato${figure.limited ? ' deck-foot-dato--aviso' : ''}`}>
                {formatearFilas(figure.rows, figure.limited)}
            </span>,
        );
    }

    const entradasVars = quiere('vars') ? Object.entries(variables || {}) : [];

    const sello = figure?.at || refreshedAt;
    const rancio = sello ? (Date.now() - sello) > DIAS_RANCIO * DIA_MS : false;

    return (
        <div className="deck-slide-foot">
            <div className="deck-foot-izq">
                {izquierda.length > 0 && (
                    <span className="deck-foot-procedencia">
                        {izquierda.map((el, i) => (
                            <span key={el.key} className="deck-foot-parte">
                                {i > 0 && <span className="deck-foot-sep">·</span>}
                                {el}
                            </span>
                        ))}
                    </span>
                )}
                {entradasVars.map(([k, v]) => (
                    <span key={k} className="deck-foot-chip"><i />{k} = {String(v)}</span>
                ))}
                {caveat && <span className="deck-foot-salvedad">{caveat}</span>}
            </div>

            <div className="deck-foot-der">
                {quiere('refreshed') && sello && (
                    <span className={`deck-foot-sello${rancio ? ' deck-foot-sello--rancio' : ''}`}>
                        {rancio && <LuTriangleAlert size={11} />}
                        Updated {formatearFecha(sello)}
                    </span>
                )}
                {quiere('number') && slideNumber !== undefined && (
                    <span className="deck-foot-num">{String(slideNumber).padStart(2, '0')}</span>
                )}
            </div>
        </div>
    );
};

export default DeckFooter;
