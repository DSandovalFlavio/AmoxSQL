/**
 * InsertMenu — el catálogo de bloques, anclado donde se pidió.
 *
 * Es el mismo catálogo que responde a `/` en el documento: una entrada nueva se
 * añade en markdownInsertables.js y aparece en los dos sitios. Antes vivía en
 * un desplegable de la barra superior, lejos del cursor; ahora se abre en la
 * manija del margen, a la altura de la línea en la que vas a escribir.
 *
 * Las cadenas del proyecto van al final, en su propio grupo: no son plantillas,
 * son diagramas generados a partir de un archivo real.
 */
import { useEffect, useRef } from 'react';
import {
    LuHash, LuList, LuListOrdered, LuListTodo, LuQuote, LuTable, LuMinus,
    LuSquareTerminal, LuShield, LuInfo, LuLightbulb, LuCircleAlert,
    LuTriangleAlert, LuOctagonAlert, LuFileCode2, LuWorkflow, LuImage,
    LuUser, LuClock, LuListTree, LuPlus,
} from 'react-icons/lu';

const ICONS = {
    hash: LuHash, list: LuList, listOrdered: LuListOrdered, todo: LuListTodo,
    quote: LuQuote, table: LuTable, minus: LuMinus, terminal: LuSquareTerminal,
    shield: LuShield, info: LuInfo, bulb: LuLightbulb, circleAlert: LuCircleAlert,
    warning: LuTriangleAlert, danger: LuOctagonAlert, code: LuFileCode2,
    workflow: LuWorkflow, image: LuImage, user: LuUser, clock: LuClock, tree: LuListTree,
};

export default function InsertMenu({ groups, chains = [], onInsert, onChain, onClose, style }) {
    const ref = useRef(null);

    useEffect(() => {
        const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
        const escape = (e) => { if (e.key === 'Escape') onClose?.(); };
        // En `mousedown` para cerrarse antes de que el clic llegue al editor.
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('mousedown', fuera);
            document.removeEventListener('keydown', escape);
        };
    }, [onClose]);

    return (
        <div className="mde-insert-menu" ref={ref} style={style}>
            <div className="mde-insert-hint">
                Escribe <kbd>/</kbd> en el documento para lo mismo sin soltar el teclado
            </div>

            {groups.map(group => (
                <div key={group.id}>
                    <div className="mde-insert-group">{group.label}</div>
                    {group.items.map(item => {
                        const Icon = ICONS[item.icon] || LuPlus;
                        return (
                            <div
                                key={item.id}
                                className="mde-insert-item"
                                title={item.detail || item.label}
                                onClick={() => onInsert?.(item)}
                            >
                                <Icon size={12} />
                                <span className="mde-insert-item-label">{item.label}</span>
                                <span className="mde-insert-hint-key">/{item.id}</span>
                            </div>
                        );
                    })}
                </div>
            ))}

            {chains.length > 0 && (
                <>
                    <div className="mde-insert-group">Desde el proyecto</div>
                    {chains.map(ruta => (
                        <div
                            key={ruta}
                            className="mde-insert-item"
                            title={`Genera el diagrama de ${ruta}`}
                            onClick={() => onChain?.(ruta)}
                        >
                            <LuWorkflow size={12} />
                            <span className="mde-insert-item-label">{ruta.split('/').pop().replace(/\.sqlchain$/, '')}</span>
                            <span className="mde-insert-hint-key">diagrama</span>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
