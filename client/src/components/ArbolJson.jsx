/**
 * Un valor anidado (VARIANT, STRUCT, LIST, MAP, JSON) como árbol plegable (6.0, O5).
 * Con <details> nativos: el teclado y el lector de pantalla funcionan sin más. Los dos
 * primeros niveles abiertos; listas largas, las primeras 200.
 */
const MAX_HIJOS = 200;

function Hoja({ valor }) {
    if (valor === null || valor === undefined) return <span className="aj-nulo">null</span>;
    if (typeof valor === 'string') return <span className="aj-texto">"{valor}"</span>;
    if (typeof valor === 'boolean') return <span className="aj-logico">{String(valor)}</span>;
    return <span className="aj-numero">{String(valor)}</span>;
}

function Nodo({ nombre, valor, nivel }) {
    const esLista = Array.isArray(valor);
    const esObjeto = valor && typeof valor === 'object';
    if (!esObjeto) {
        return (
            <div className="aj-fila">
                {nombre !== undefined && <span className="aj-clave">{nombre}: </span>}
                <Hoja valor={valor} />
            </div>
        );
    }
    const entradas = esLista ? valor.map((v, i) => [i, v]) : Object.entries(valor);
    const resumen = esLista ? `[${entradas.length}]` : `{${entradas.length}}`;
    return (
        <details className="aj-nodo" open={nivel < 2}>
            <summary className="aj-fila">
                {nombre !== undefined && <span className="aj-clave">{nombre}: </span>}
                <span className="aj-resumen">{resumen}</span>
            </summary>
            <div className="aj-hijos">
                {entradas.slice(0, MAX_HIJOS).map(([k, v]) => <Nodo key={k} nombre={k} valor={v} nivel={nivel + 1} />)}
                {entradas.length > MAX_HIJOS && <div className="aj-fila aj-nulo">… {entradas.length - MAX_HIJOS} more</div>}
            </div>
        </details>
    );
}

export default function ArbolJson({ valor }) {
    return <div className="aj" role="tree"><Nodo valor={valor} nivel={0} /></div>;
}
