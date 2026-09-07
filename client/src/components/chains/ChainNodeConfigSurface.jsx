/**
 * ChainNodeConfigSurface — configurar un nodo a fondo.
 *
 * Sustituye al popover anclado al nodo (fase 3 de auditoria_dataflow_ux.md).
 * Aquel nacia pegado a la tarjeta, asi que su posicion dependia de donde
 * estuviera el nodo: contra el borde del lienzo se cortaba, y para que cupiera
 * habia que encogerlo. De ahi salio una tercera forma de configurar el mismo
 * nodo, encima de la compacta y la de campos en linea, y con tres ya no se
 * entendia cual tocaba.
 *
 * La correccion (fase 9 de plan_rediseno_visual.md) es que no hay un sitio
 * nuevo: es el MISMO nodo, expandido y centrado sobre el lienzo, con el flujo
 * atenuado detras. Al centrarlo el tamano deja de importar — puede ser todo lo
 * grande que la configuracion necesite — y ya nunca se corta.
 *
 * Se cierra con Esc, pulsando fuera, o con Listo. El Esc de aqui se registra en
 * captura y detiene la propagacion: si hay un nodo expandido tiene que cerrarlo
 * a el antes que a la paleta de comandos o cualquier otro menu de detras.
 */
import { useEffect, useRef } from 'react';
import { LuPlay, LuX } from 'react-icons/lu';
import ChainNodeConfigPanel from './ChainNodeConfigPanel';
import { NODE_TYPES } from './chainNodeTypes';

const ChainNodeConfigSurface = ({
    node, onUpdate, onCreateSqlFile, onOpenFile, sqlFiles,
    chainDefinition, chainFile, onRunOnly, onClose,
}) => {
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            // Un campo abierto (un desplegable, un autocompletado) se queda con
            // su propio Esc; solo cerramos la superficie si nadie lo reclamo.
            if (e.defaultPrevented) return;
            e.stopPropagation();
            closeRef.current?.();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, []);

    if (!node) return null;

    const nodeType = NODE_TYPES[node.data.nodeType] || NODE_TYPES.sql_file;
    const Icon = nodeType.icon;

    return (
        <div
            className="chain-config-backdrop"
            onClick={() => onClose?.()}
            onWheel={(e) => e.stopPropagation()}
        >
            <div
                className="chain-config-surface"
                style={{ '--node-accent': nodeType.color.accent }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={`Configure ${node.data.label || nodeType.label}`}
            >
                <div className="chain-config-surface-head">
                    <span className="chain-config-surface-icon">
                        <Icon size={15} />
                    </span>
                    <span className="chain-config-surface-name">{node.data.label || nodeType.label}</span>
                    <span className="chain-config-surface-type">{nodeType.label}</span>
                    <button className="chain-config-surface-x" onClick={() => onClose?.()} title="Close (Esc)">
                        <LuX size={14} />
                    </button>
                </div>

                {node.data.description && (
                    <div className="chain-config-surface-desc">{node.data.description}</div>
                )}

                <div className="chain-config-surface-body">
                    <ChainNodeConfigPanel
                        node={node}
                        onUpdate={onUpdate}
                        onCreateSqlFile={onCreateSqlFile}
                        onOpenFile={onOpenFile}
                        sqlFiles={sqlFiles}
                        chainDefinition={chainDefinition}
                        chainFile={chainFile}
                    />
                </div>

                <div className="chain-config-surface-foot">
                    {onRunOnly && (
                        <button
                            className="chain-config-surface-test"
                            onClick={() => onRunOnly(node.id)}
                            title="Run only this node with the settings above"
                        >
                            <LuPlay size={11} /><span>Test</span>
                        </button>
                    )}
                    <span className="chain-config-surface-hint">Esc to go back</span>
                    <button className="chain-config-surface-done" onClick={() => onClose?.()}>Done</button>
                </div>
            </div>
        </div>
    );
};

export default ChainNodeConfigSurface;
