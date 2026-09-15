/**
 * La columna derecha. **Tres estados y sin pestañas**: refleja lo que hay
 * seleccionado — el diagrama, una caja o una flecha.
 *
 * Mismo criterio que el Studio del deck, y a propósito: izquierda navega y
 * suministra, derecha edita lo seleccionado. Quien aprende una de las dos
 * herramientas sabe usar la otra.
 *
 * Sin selección habla del **diagrama entero**, que es donde vive la dirección.
 * Ese estado existe porque si no, cambiar la dirección no tendría sitio: no es
 * propiedad de ninguna caja.
 */
import { LuShare2, LuBox, LuMoveRight, LuCopy, LuTrash2, LuPlus } from 'react-icons/lu';
import { FORMAS, ESTILOS_ARISTA, DIRECCIONES } from '../markdown/mermaidFlow';

const DIRECCION_FLECHA = { LR: '→', TB: '↓', TD: '↓', BT: '↑', RL: '←' };
const DIRECCION_NOMBRE = { LR: 'Izquierda a derecha', TB: 'Arriba abajo', BT: 'Abajo arriba', RL: 'Derecha a izquierda' };
// `LR` primero porque es la dirección por defecto y la que dibuja casi todo el
// mundo; `TD` no se lista porque es el mismo sitio que `TB` con otro nombre.
const VISIBLES = ['LR', 'TB', 'RL', 'BT'].filter((d) => DIRECCIONES.includes(d));

/** Una pastilla con la silueta de la forma. Las siete se dibujan en CSS. */
function BotonForma({ forma, activa, onClick, titulo }) {
    return (
        <button
            type="button"
            className={`dgm-forma${activa ? ' dgm-forma--on' : ''}`}
            onClick={onClick}
            title={titulo}
        >
            <i className={`dgm-silueta dgm-silueta--${forma}`} />
        </button>
    );
}

const DiagramInspector = ({
    grafo, seleccion, onRenombrar, onForma, onEtiqueta, onEstiloArista,
    onDireccion, onDuplicar, onBorrar, onAnadir,
}) => {
    const nodo = seleccion?.tipo === 'nodo' ? grafo.nodos.find((n) => n.id === seleccion.id) : null;
    const arista = seleccion?.tipo === 'arista' ? grafo.aristas[seleccion.indice] : null;

    // ── una flecha ──────────────────────────────────────────────────────────
    if (arista) {
        const de = grafo.nodos.find((n) => n.id === arista.desde)?.texto || arista.desde;
        const a = grafo.nodos.find((n) => n.id === arista.hasta)?.texto || arista.hasta;
        return (
            <div className="dgm-insp">
                <div className="dgm-insp-cab">
                    <LuMoveRight size={13} strokeWidth={2.3} />
                    <div>
                        <div className="dgm-insp-tipo">Flecha</div>
                        <div className="dgm-insp-que" title={`${de} → ${a}`}>{de} → {a}</div>
                    </div>
                </div>
                <div className="dgm-campo">
                    <label className="dgm-campo-lab" htmlFor="dgm-etiq">Etiqueta</label>
                    <input
                        id="dgm-etiq"
                        className="dgm-inp"
                        value={arista.etiqueta}
                        placeholder="sin etiqueta"
                        onChange={(e) => onEtiqueta(seleccion.indice, e.target.value)}
                    />
                </div>
                <div className="dgm-campo">
                    <span className="dgm-campo-lab">Cómo corre</span>
                    {/* Nombradas por lo que significan, no por su sintaxis: quien
                        dibuja una arquitectura no piensa «línea punteada», piensa
                        «esto va evento a evento». */}
                    <div className="dgm-flechas">
                        {Object.entries(ESTILOS_ARISTA).map(([id, { nombre }]) => (
                            <button
                                key={id}
                                type="button"
                                className={`dgm-flecha${arista.estilo === id ? ' dgm-flecha--on' : ''}`}
                                onClick={() => onEstiloArista(seleccion.indice, id)}
                            >
                                <i className={`dgm-trazo dgm-trazo--${id}`} />
                                <span>{nombre}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="dgm-campo dgm-campo--acciones">
                    <button type="button" className="dgm-btn" onClick={() => onBorrar()}>
                        <LuTrash2 size={12} strokeWidth={2.3} /> Quitar la flecha
                    </button>
                </div>
            </div>
        );
    }

    // ── una caja ────────────────────────────────────────────────────────────
    if (nodo) {
        const entran = grafo.aristas.filter((x) => x.hasta === nodo.id).length;
        const salen = grafo.aristas.filter((x) => x.desde === nodo.id).length;
        const grupo = grafo.subgrafos.find((s) => s.nodos.includes(nodo.id));
        return (
            <div className="dgm-insp">
                <div className="dgm-insp-cab">
                    <LuBox size={13} strokeWidth={2.3} />
                    <div>
                        <div className="dgm-insp-tipo">Caja</div>
                        <div className="dgm-insp-que" title={nodo.texto}>{nodo.texto}</div>
                    </div>
                </div>
                <div className="dgm-campo">
                    <label className="dgm-campo-lab" htmlFor="dgm-texto">Texto</label>
                    <input
                        id="dgm-texto"
                        className="dgm-inp"
                        value={nodo.texto}
                        onChange={(e) => onRenombrar(nodo.id, e.target.value)}
                    />
                </div>
                <div className="dgm-campo">
                    <span className="dgm-campo-lab">Forma</span>
                    <div className="dgm-formas">
                        {Object.entries(FORMAS).map(([id, { nombre }]) => (
                            <BotonForma
                                key={id}
                                forma={id}
                                titulo={nombre}
                                activa={nodo.forma === id}
                                onClick={() => onForma(nodo.id, id)}
                            />
                        ))}
                    </div>
                </div>
                <div className="dgm-campo">
                    <span className="dgm-campo-lab">Grupo</span>
                    <div className="dgm-inp dgm-inp--lectura">
                        {grupo ? grupo.titulo : <span className="dgm-ph">sin grupo</span>}
                    </div>
                </div>
                <div className="dgm-campo">
                    <span className="dgm-campo-lab">Conexiones</span>
                    <div className="dgm-dato">{entran} entran · {salen} salen</div>
                </div>
                <div className="dgm-campo dgm-campo--acciones">
                    <button type="button" className="dgm-btn" onClick={() => onDuplicar(nodo.id)}>
                        <LuCopy size={12} strokeWidth={2.3} /> Duplicar
                    </button>
                    <button type="button" className="dgm-btn" onClick={() => onBorrar()}>
                        <LuTrash2 size={12} strokeWidth={2.3} /> Borrar
                    </button>
                </div>
            </div>
        );
    }

    // ── el diagrama ─────────────────────────────────────────────────────────
    return (
        <div className="dgm-insp">
            <div className="dgm-insp-cab">
                <LuShare2 size={13} strokeWidth={2.3} />
                <div>
                    <div className="dgm-insp-tipo">Diagrama</div>
                    <div className="dgm-insp-que">nada seleccionado</div>
                </div>
            </div>
            <div className="dgm-campo">
                <span className="dgm-campo-lab">Dirección</span>
                <div className="dgm-dirs">
                    {VISIBLES.map((d) => (
                        <button
                            key={d}
                            type="button"
                            className={`dgm-dir${(grafo.direccion === d || (d === 'TB' && grafo.direccion === 'TD')) ? ' dgm-dir--on' : ''}`}
                            onClick={() => onDireccion(d)}
                            title={DIRECCION_NOMBRE[d]}
                        >
                            {DIRECCION_FLECHA[d]}
                        </button>
                    ))}
                </div>
            </div>
            <div className="dgm-campo">
                <span className="dgm-campo-lab">Cuenta</span>
                <div className="dgm-dato">
                    {grafo.nodos.length} cajas · {grafo.aristas.length} flechas
                    {grafo.subgrafos.length > 0 && ` · ${grafo.subgrafos.length} grupos`}
                </div>
            </div>
            {grafo.conservado.length > 0 && (
                <div className="dgm-campo">
                    <span className="dgm-campo-lab">Se conserva sin tocar</span>
                    {/* No es una advertencia: es una promesa. Dice «esto no lo toco». */}
                    <div className="dgm-dato dgm-dato--warn">
                        {grafo.conservado.length} {grafo.conservado.length === 1 ? 'línea' : 'líneas'} de estilo o enlace
                    </div>
                </div>
            )}
            <div className="dgm-campo dgm-campo--acciones">
                <button type="button" className="dgm-btn" onClick={() => onAnadir()}>
                    <LuPlus size={12} strokeWidth={2.3} /> Añadir una caja
                </button>
            </div>
        </div>
    );
};

export default DiagramInspector;
