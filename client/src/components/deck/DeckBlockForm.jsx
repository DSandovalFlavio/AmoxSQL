/**
 * Los formularios de los cinco bloques de dato.
 *
 * Fase 4. Meter cuatro métricas en una lámina era teclear veinte líneas de YAML
 * con la ortografía exacta de cada clave y sin saber cuáles existen.
 *
 * **Cuándo aparece, y por qué así.** El formulario trabaja sobre la prosa ya
 * confirmada y sale cuando la región está seleccionada pero NO se está
 * editando. Es un reparto deliberado: mientras escribes manda el cuadro de
 * texto, y al salir manda el formulario. La alternativa —seguir el cursor
 * dentro del `textarea` y editar el borrador desde el inspector— pone dos
 * escritores sobre la misma cadena, y el que pierde la carrera se lleva por
 * delante lo que el otro acababa de escribir.
 *
 * Toda la lectura y escritura del YAML vive en `deckBlockModel.js`, que es puro
 * y se ejercita desde Node. Aquí sólo hay campos.
 */
import { LuPlus, LuTrash2, LuTriangleAlert, LuChevronUp, LuChevronDown } from 'react-icons/lu';
import { BLOQUES, leerBloque, escribirBloque, avisosDe, reemplazarBloque } from './deckBlockModel';

function Campo({ campo, valor, onCambio }) {
    if (campo.booleano) {
        const puesto = campo.valorFijo ? valor === campo.valorFijo : !!valor;
        return (
            <label className="dki-casilla">
                <input
                    type="checkbox"
                    checked={puesto}
                    onChange={() => onCambio(campo.valorFijo
                        ? (puesto ? '' : campo.valorFijo)
                        : !puesto)}
                />
                <i>{puesto && <span className="dkb-tic" />}</i>
                {campo.label}
            </label>
        );
    }

    if (campo.opciones) {
        return (
            <div className="dki-texto">
                <span className="dki-campo-etiqueta">{campo.label}</span>
                <select className="dki-select" value={valor ?? ''} onChange={(e) => onCambio(e.target.value)}>
                    <option value="">del signo</option>
                    <option value="good">buena</option>
                    <option value="flat">plana</option>
                    <option value="bad">mala</option>
                </select>
            </div>
        );
    }

    return (
        <div className="dki-texto">
            <span className="dki-campo-etiqueta">{campo.label}</span>
            <input
                type="text"
                value={valor ?? ''}
                placeholder={campo.ejemplo}
                onChange={(e) => onCambio(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
            />
        </div>
    );
}

/** Una tabla clasificada: columnas, filas, y qué columna hace de barra. */
function FormRank({ modelo, onModelo }) {
    const { columns = [], rows = [] } = modelo;

    const setCelda = (f, c, v) => onModelo({
        ...modelo,
        rows: rows.map((fila, i) => (i === f ? fila.map((x, j) => (j === c ? v : x)) : fila)),
    });

    return (
        <>
            <div className="dki-grupo">
                <div className="dki-grupo-titulo">Columnas</div>
                <div className="dki-texto">
                    <input
                        type="text"
                        value={columns.join(', ')}
                        placeholder="Campaña, Coste, Peso"
                        onChange={(e) => onModelo({ ...modelo, columns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                        onKeyDown={(e) => e.stopPropagation()}
                    />
                </div>
                <div className="dki-campo">
                    <span className="dki-campo-etiqueta">Barra</span>
                    <select className="dki-select" value={modelo.bar || ''} onChange={(e) => onModelo({ ...modelo, bar: e.target.value })}>
                        <option value="">ninguna</option>
                        {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="dki-campo">
                    <span className="dki-campo-etiqueta">Semáforo</span>
                    <select className="dki-select" value={modelo.status || ''} onChange={(e) => onModelo({ ...modelo, status: e.target.value })}>
                        <option value="">ninguno</option>
                        {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="dki-campo">
                    <span className="dki-campo-etiqueta">Filas destacadas</span>
                    <input
                        className="dki-select dkb-num"
                        type="number"
                        min="0"
                        value={modelo.highlight || 0}
                        onChange={(e) => onModelo({ ...modelo, highlight: Number(e.target.value) || 0 })}
                        onKeyDown={(e) => e.stopPropagation()}
                    />
                </div>
            </div>

            <div className="dki-grupo">
                <div className="dki-grupo-titulo">Filas · {rows.length}</div>
                {rows.map((fila, f) => (
                    <div key={f} className="dkb-fila">
                        <div className="dkb-fila-cab">
                            <span>{String(f + 1).padStart(2, '0')}</span>
                            <button type="button" title="Quitar la fila" onClick={() => onModelo({ ...modelo, rows: rows.filter((_, i) => i !== f) })}>
                                <LuTrash2 size={11} />
                            </button>
                        </div>
                        {columns.map((c, j) => (
                            <div key={c} className="dki-texto">
                                <span className="dki-campo-etiqueta">{c}</span>
                                <input
                                    type="text"
                                    value={fila[j] ?? ''}
                                    onChange={(e) => setCelda(f, j, e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                />
                            </div>
                        ))}
                    </div>
                ))}
                <button
                    type="button"
                    className="dkb-anadir"
                    onClick={() => onModelo({ ...modelo, rows: [...rows, columns.map(() => '')] })}
                >
                    <LuPlus size={12} /> Añadir fila
                </button>
            </div>
        </>
    );
}

/** Una lista de registros: métricas, pasos o acciones. */
function FormLista({ lang, modelo, onModelo }) {
    const def = BLOQUES[lang];
    const items = modelo.items || [];

    const setCampo = (i, id, v) => onModelo({
        ...modelo,
        items: items.map((it, k) => (k === i ? { ...it, [id]: v } : it)),
    });
    const mover = (i, paso) => {
        const j = i + paso;
        if (j < 0 || j >= items.length) return;
        const copia = [...items];
        [copia[i], copia[j]] = [copia[j], copia[i]];
        onModelo({ ...modelo, items: copia });
    };

    return (
        <>
            {items.map((item, i) => (
                <div key={i} className="dki-grupo dkb-registro">
                    <div className="dkb-fila-cab">
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        <button type="button" title="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><LuChevronUp size={11} /></button>
                        <button type="button" title="Bajar" disabled={i === items.length - 1} onClick={() => mover(i, 1)}><LuChevronDown size={11} /></button>
                        <button type="button" title="Quitar" onClick={() => onModelo({ ...modelo, items: items.filter((_, k) => k !== i) })}><LuTrash2 size={11} /></button>
                    </div>
                    {def.campos.map((campo) => (
                        <Campo
                            key={campo.id}
                            campo={campo}
                            valor={item[campo.id]}
                            onCambio={(v) => setCampo(i, campo.id, v)}
                        />
                    ))}
                </div>
            ))}
            <button
                type="button"
                className="dkb-anadir"
                onClick={() => onModelo({ ...modelo, items: [...items, {}] })}
            >
                <LuPlus size={12} /> Añadir {def.label.toLowerCase()}
            </button>
        </>
    );
}

/** Un bloque de campos sueltos: la cifra ancla. */
function FormCampos({ lang, modelo, onModelo }) {
    const def = BLOQUES[lang];
    return (
        <div className="dki-grupo">
            {def.campos.map((campo) => (
                <Campo
                    key={campo.id}
                    campo={campo}
                    valor={modelo.campos?.[campo.id]}
                    onCambio={(v) => onModelo({ ...modelo, campos: { ...modelo.campos, [campo.id]: v } })}
                />
            ))}
        </div>
    );
}

/**
 * El formulario de un bloque. `onEscribir` recibe la prosa COMPLETA de la
 * región con el bloque sustituido — igual que las regiones de texto, para que
 * un formulario nunca pueda partir el archivo.
 */
export default function DeckBlockForm({ prosa, bloque, onEscribir }) {
    const modelo = leerBloque(bloque.lang, bloque.cuerpo);
    const def = BLOQUES[bloque.lang];

    if (modelo.error) {
        return (
            <div className="dki-grupo">
                <div className="dki-grupo-titulo">{def.label}</div>
                <p className="dki-nota dki-nota--aviso">
                    <LuTriangleAlert size={10} /> {modelo.error}. Arréglalo en el texto y el
                    formulario vuelve.
                </p>
            </div>
        );
    }

    const aplicar = (nuevo) => onEscribir(reemplazarBloque(prosa, bloque, escribirBloque(bloque.lang, nuevo)));
    const avisos = avisosDe(bloque.lang, modelo);

    return (
        <>
            <div className="dki-grupo">
                <div className="dki-grupo-titulo">{def.label}</div>
                {avisos.map((a) => (
                    <p key={a} className="dki-nota dki-nota--aviso">
                        <LuTriangleAlert size={10} /> {a}
                    </p>
                ))}
            </div>

            {def.tabla
                ? <FormRank modelo={modelo} onModelo={aplicar} />
                : def.lista
                    ? <FormLista lang={bloque.lang} modelo={modelo} onModelo={aplicar} />
                    : <FormCampos lang={bloque.lang} modelo={modelo} onModelo={aplicar} />}
        </>
    );
}
