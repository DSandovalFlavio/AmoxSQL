/**
 * La columna izquierda: la paleta de formas y el esquema del diagrama.
 *
 * ## Por qué la paleta se pulsa y no se arrastra
 *
 * El contrato visual dibujaba una paleta de la que se arrastra al lienzo, y al
 * implementarla se ve que **sería mentira**: mermaid decide dónde va cada caja,
 * así que el punto donde sueltas no significa nada. Arrastrar hasta un sitio
 * concreto y que la caja aparezca en otro es exactamente la promesa incumplida
 * que este editor evita en todo lo demás.
 *
 * Se pulsa. Y si hay una caja seleccionada, la nueva **se encadena a ella**, que
 * es la información que el gesto sí puede llevar.
 *
 * ## El esquema
 *
 * Con cuarenta cajas deja de servir para leer y empieza a servir para saltar: de
 * ahí el buscador, que filtra por texto sin acentos ni mayúsculas.
 */
import { LuSearch, LuX } from 'react-icons/lu';
import { FORMAS } from '../markdown/mermaidFlow';
import { buscarNodos } from './diagramOps';

const DiagramOutline = ({ grafo, seleccion, consulta, onConsulta, onElegir, onAnadirForma }) => {
    const encontrados = buscarNodos(grafo, consulta);
    const visibles = new Set(encontrados.map((n) => n.id));
    const sueltos = grafo.nodos.filter((n) => !grafo.subgrafos.some((s) => s.nodos.includes(n.id)));

    const fila = (n) => (
        <button
            key={n.id}
            type="button"
            className={`dgm-fila${seleccion?.tipo === 'nodo' && seleccion.id === n.id ? ' dgm-fila--on' : ''}`}
            onClick={() => onElegir(n.id)}
            title={n.texto}
        >
            <i className={`dgm-silueta dgm-silueta--${n.forma} dgm-silueta--mini`} />
            <span className="dgm-fila-txt">{n.texto}</span>
        </button>
    );

    return (
        <div className="dgm-izq">
            <div className="dgm-col-cab">Formas</div>
            <div className="dgm-paleta">
                {Object.entries(FORMAS).map(([id, { nombre, que }]) => (
                    <button
                        key={id}
                        type="button"
                        className="dgm-forma"
                        title={`${nombre} — ${que}`}
                        onClick={() => onAnadirForma(id)}
                    >
                        <i className={`dgm-silueta dgm-silueta--${id}`} />
                    </button>
                ))}
            </div>

            <div className="dgm-col-cab">
                Esquema <span className="dgm-spacer" />
                <span className="dgm-col-n">{grafo.nodos.length}</span>
            </div>

            <div className="dgm-buscador">
                <LuSearch size={12} strokeWidth={2.3} />
                <input
                    className="dgm-buscador-inp"
                    value={consulta}
                    placeholder="Buscar una caja…"
                    onChange={(e) => onConsulta(e.target.value)}
                />
                {consulta && (
                    <button type="button" className="dgm-buscador-x" onClick={() => onConsulta('')} title="Limpiar">
                        <LuX size={11} strokeWidth={2.4} />
                    </button>
                )}
            </div>

            <div className="dgm-lista">
                {grafo.subgrafos.map((sg) => {
                    const dentro = sg.nodos
                        .map((id) => grafo.nodos.find((n) => n.id === id))
                        .filter((n) => n && visibles.has(n.id));
                    if (!dentro.length) return null;
                    return (
                        <div key={sg.id}>
                            <div className="dgm-grupo-rot">{sg.titulo}</div>
                            {dentro.map(fila)}
                        </div>
                    );
                })}
                {sueltos.some((n) => visibles.has(n.id)) && (
                    <>
                        {grafo.subgrafos.length > 0 && <div className="dgm-grupo-rot">Sin grupo</div>}
                        {sueltos.filter((n) => visibles.has(n.id)).map(fila)}
                    </>
                )}
                {encontrados.length === 0 && (
                    <p className="dgm-lista-vacia">
                        {grafo.nodos.length ? 'Ninguna caja con ese texto.' : 'El diagrama está vacío.'}
                    </p>
                )}
            </div>
        </div>
    );
};

export default DiagramOutline;
