/**
 * Los mandos para escribir dentro de una región: la barra de formato y el menú
 * de inserción.
 *
 * Fase 3 del rediseño. Hasta ahora poner una palabra en negrita era escribir
 * `**` y meter una tira de métricas era teclear YAML dentro de una cerca — la
 * interfaz no ayudaba, se limitaba a no estorbar.
 *
 * **La barra no flota sobre la selección**, y eso se desvía del mockup a
 * propósito. Colocar algo encima del cursor de un `<textarea>` exige duplicar
 * su contenido en un div espejo y medir ahí, que es frágil y se rompe con cada
 * salto de línea. Pero además la barra fija es MEJOR para este problema: el
 * diagnóstico de la auditoría es que el Studio esconde los mandos, y una barra
 * que sólo aparece si ya sabías que había que seleccionar algo los sigue
 * escondiendo. Estando siempre mientras editas, se ve sin buscarla.
 *
 * Toda la lógica de texto vive en `deckTextOps.js`, que son funciones puras y
 * se ejercitan desde Node. Aquí sólo queda el cableado.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { LuPlus, LuSearch } from 'react-icons/lu';
import { filtrarParaLamina, aplanar } from './deckTextOps';
import { ACCIONES, ejecutarAccion } from './deckWritingOps';

export function BarraFormato({ areaRef, onCambio, onAbrirMenu }) {
    return (
        <div className="deck-barra" role="toolbar" aria-label="Formato">
            {ACCIONES.map((a) => (
                <button
                    key={a.id}
                    type="button"
                    title={a.tecla ? `${a.titulo} (Ctrl+${a.tecla})` : a.titulo}
                    // `onMouseDown` y no `onClick`: el clic normal llega después
                    // del `blur` del cuadro, y para entonces la selección ya se
                    // ha perdido. Previniendo el evento por defecto, el foco no
                    // llega a salir.
                    onMouseDown={(e) => { e.preventDefault(); ejecutarAccion(areaRef.current, a, onCambio); }}
                >
                    <a.Icono size={13} />
                </button>
            ))}
            <span className="deck-barra-sep" />
            <button
                type="button"
                className="deck-barra-insertar"
                title="Insertar un bloque, una figura o una imagen ( / )"
                onMouseDown={(e) => { e.preventDefault(); onAbrirMenu(); }}
            >
                <LuPlus size={13} /> Insertar
                <kbd>/</kbd>
            </button>
        </div>
    );
}

/**
 * El menú de `/`. Se ancla al pie de la región y no al cursor, por la misma
 * razón que la barra.
 *
 * Reaprovecha el catálogo del editor de documentos pero no su widget: aquél
 * está montado sobre el proveedor de completado de Monaco. Lo que NO hereda son
 * las paradas de tabulación — un `textarea` no sabe de eso, así que se
 * selecciona la primera y el resto se queda con su texto de ejemplo.
 */
export function MenuInsercion({ consulta, onElegir, onCerrar }) {
    const grupos = useMemo(() => filtrarParaLamina(consulta), [consulta]);
    const planos = useMemo(() => aplanar(grupos), [grupos]);
    const [cursor, setCursor] = useState(0);
    const listaRef = useRef(null);

    useEffect(() => { setCursor(0); }, [consulta]);
    useEffect(() => {
        listaRef.current?.querySelector('[data-cursor]')?.scrollIntoView({ block: 'nearest' });
    }, [cursor]);

    // El teclado lo maneja el `textarea`, que es quien tiene el foco: si el
    // menú se lo robara, escribir para filtrar dejaría de funcionar.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(planos.length - 1, c + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (planos[cursor]) onElegir(planos[cursor]); }
            else if (e.key === 'Escape') { e.preventDefault(); onCerrar(); }
            else return;
            e.stopPropagation();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [planos, cursor, onElegir, onCerrar]);

    if (!grupos.length) {
        return (
            <div className="deck-menu">
                <div className="deck-menu-consulta"><LuSearch size={12} /> {consulta || '…'}</div>
                <div className="deck-menu-vacio">Nada que insertar con eso.</div>
            </div>
        );
    }

    // El índice plano se calcula ANTES de pintar, no mutando un contador dentro
    // del map: eso es escribir durante el render, que hoy funciona de casualidad
    // y deja de hacerlo en cuanto React reordena el trabajo. Lo señaló el linter.
    const indice = new Map();
    grupos.forEach((g) => g.items.forEach((it) => indice.set(it.id, indice.size)));

    return (
        <div className="deck-menu" ref={listaRef}>
            <div className="deck-menu-consulta"><LuSearch size={12} /> {consulta || 'escribe para filtrar…'}</div>
            <div className="deck-menu-lista">
                {grupos.map((g) => (
                    <div key={g.id}>
                        <div className="deck-menu-grupo">{g.label}</div>
                        {g.items.map((item) => {
                            const k = indice.get(item.id);
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={`deck-menu-item${k === cursor ? ' deck-menu-item--on' : ''}`}
                                    data-cursor={k === cursor ? '' : undefined}
                                    onMouseEnter={() => setCursor(k)}
                                    onMouseDown={(e) => { e.preventDefault(); onElegir(item); }}
                                >
                                    <span className="deck-menu-label">{item.label}</span>
                                    {item.detail && <span className="deck-menu-detalle">{item.detail}</span>}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
