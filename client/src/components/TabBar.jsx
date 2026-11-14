import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { LuLoader, LuHourglass, LuPin, LuX, LuPlus, LuCode, LuFilePlus, LuFileText, LuChevronDown, LuGitBranch, LuPresentation, LuChartBar, LuShare2, LuLayoutDashboard, LuList } from 'react-icons/lu';
import { carpetasQueDistinguen } from '../utils/nombresDePestana';
import { useEscape } from '../hooks/useEscape';

const TabBar = ({ tabs, activeTabId, onTabClick, onTabClose, paneId, onDragStart, onReorder, onCreateNew, onTabContextMenu, onTabRename }) => {
    const [showNewMenu, setShowNewMenu] = useState(false);
    const menuRef = useRef(null);

    // ── 6.0 (M11): ver todas las pestañas ──────────────────────────────────
    // Dos con el mismo nombre enseñan su carpeta.
    const carpetas = useMemo(() => carpetasQueDistinguen(tabs), [tabs]);
    // Las que no caben: la rueda desplaza la barra, la activa siempre se ve, y
    // un botón dice cuántas quedan fuera y las lista todas.
    const tiraRef = useRef(null);
    const [fuera, setFuera] = useState(0);
    const medirFuera = useCallback(() => {
        const tira = tiraRef.current;
        if (!tira) return;
        const caja = tira.getBoundingClientRect();
        let n = 0;
        for (const el of tira.querySelectorAll('[data-tab-id]')) {
            const r = el.getBoundingClientRect();
            if (r.left < caja.left - 1 || r.right > caja.right + 1) n++;
        }
        setFuera(n);
    }, []);
    useEffect(() => {
        const tira = tiraRef.current;
        if (!tira) return undefined;
        medirFuera();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medirFuera) : null;
        ro?.observe(tira);
        return () => ro?.disconnect();
    }, [tabs, medirFuera]);
    useEffect(() => {
        const el = activeTabId && tiraRef.current?.querySelector(`[data-tab-id="${CSS.escape(activeTabId)}"]`);
        el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        medirFuera();
    }, [activeTabId, medirFuera]);
    const alRodar = (e) => {
        const tira = tiraRef.current;
        if (!tira || tira.scrollWidth <= tira.clientWidth) return;
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (d) tira.scrollLeft += d;
    };
    const [lista, setLista] = useState(false);
    const [filtro, setFiltro] = useState('');
    const listaRef = useRef(null);
    useEscape(() => setLista(false), lista);
    useEffect(() => {
        if (!lista) return undefined;
        const fueraDeLista = (e) => { if (listaRef.current && !listaRef.current.contains(e.target)) setLista(false); };
        document.addEventListener('mousedown', fueraDeLista);
        return () => document.removeEventListener('mousedown', fueraDeLista);
    }, [lista]);
    const enLista = useMemo(() => {
        const q = filtro.trim().toLowerCase();
        return q ? tabs.filter(t => `${t.name} ${t.path || ''}`.toLowerCase().includes(q)) : tabs;
    }, [tabs, filtro]);

    // Close dropdown on outside click
    useEffect(() => {
        if (!showNewMenu) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setShowNewMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showNewMenu]);

    const handleDragStart = (e, tabId) => {
        if (onDragStart) onDragStart(e, tabId, paneId);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e, targetTabId) => {
        e.preventDefault();
        e.stopPropagation();
        if (onReorder) onReorder(null, targetTabId, paneId);
    };

    // Drop on empty bar space (past the last tab, or an entirely empty bar —
    // e.g. an empty pane's bar with zero tabs and thus no per-tab drop
    // targets at all). Per-tab handleDrop above stops propagation, so this
    // only fires when the drop didn't land on a specific tab.
    const handleBarDrop = (e) => {
        e.preventDefault();
        if (onReorder) onReorder(null, null, paneId);
    };

    return (
        <div className="tab-bar">
            {/* New File Button — always first, like Chrome's "+" */}
            {onCreateNew && (
                <div className="tab-bar-new" ref={menuRef}>
                    <button
                        className="tab-bar-new-btn"
                        onClick={() => onCreateNew('sql')}
                        title="New SQL File"
                    >
                        <LuPlus size={14} />
                    </button>
                    <button
                        className="tab-bar-new-chevron"
                        onClick={() => setShowNewMenu(v => !v)}
                        title="New File Options"
                    >
                        <LuChevronDown size={10} />
                    </button>
                    {showNewMenu && (
                        <div className="tab-bar-new-menu">
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('sql'); setShowNewMenu(false); }}>
                                <LuCode size={13} /> SQL Query
                            </div>
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('notebook'); setShowNewMenu(false); }}>
                                <LuFilePlus size={13} /> Notebook
                            </div>
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('md'); setShowNewMenu(false); }}>
                                <LuFileText size={13} /> Markdown
                            </div>
                            {/* Los formatos que el menu se habia dejado atras. Los
                                iconos son los MISMOS que usa el explorador de
                                archivos para cada extension, para que un .sqlchain
                                se reconozca igual se cree aqui o se vea alli. */}
                            <div className="tab-bar-new-menu-separator" />
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('sqlchain'); setShowNewMenu(false); }}>
                                <LuGitBranch size={13} /> Data Flow
                            </div>
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('amoxcanvas'); setShowNewMenu(false); }}>
                                <LuLayoutDashboard size={13} /> Canvas
                            </div>
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('amoxdiagram'); setShowNewMenu(false); }}>
                                <LuShare2 size={13} /> Diagram
                            </div>
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('amoxdeck'); setShowNewMenu(false); }}>
                                <LuPresentation size={13} /> Report Flow
                            </div>
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('amoxvis'); setShowNewMenu(false); }}>
                                <LuChartBar size={13} /> Chart
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="tab-bar-tabs" ref={tiraRef} onDragOver={handleDragOver} onDrop={handleBarDrop} onWheel={alRodar} onScroll={medirFuera}>
                {tabs.map(tab => {
                    const isActive = tab.id === activeTabId;
                    return (
                        <div
                            key={tab.id}
                            data-tab-id={tab.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, tab.id)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, tab.id)}
                            onClick={() => onTabClick(tab.id)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onTabContextMenu && onTabContextMenu(e, tab.id, paneId);
                            }}
                            className={`tab-item${isActive ? ' active' : ''}${tab.fijada ? ' tab-item--fijada' : ''}`}
                        >
                            {/* La chincheta va DELANTE del nombre: es lo que hace
                                que se distinga de un vistazo cual no se va a
                                cerrar, sin tener que llegar al final del rotulo. */}
                            {tab.fijada && <LuPin size={10} className="tab-pin" />}
                            <span
                                className="tab-label"
                                onDoubleClick={(e) => { e.stopPropagation(); onTabRename && onTabRename(tab.id, paneId); }}
                                title={tab.type === 'datadiving' ? tab.name : 'Double-click to rename'}
                            >
                                {tab.name}
                            </span>
                            {carpetas.has(tab.id) && <span className="tab-carpeta" title={tab.path}>{carpetas.get(tab.id)}</span>}
                            {/* Deep Dive: el analista espera tu respuesta (una pregunta, o se
                                quedó sin ciclos). Se ve aunque estés en otra pestaña. */}
                            {tab.espera && <span className="tab-aviso tab-aviso--espera" title="The analyst is waiting for your answer" aria-label="Waiting for your answer" />}
                            {tab.ejecucion?.estado === 'corriendo' && <LuLoader size={11} className="spin tab-ejecucion" aria-label="Running" />}
                            {tab.ejecucion?.estado === 'en_espera' && <LuHourglass size={11} className="tab-ejecucion" aria-label={`Waiting for ${tab.ejecucion.tras}`} />}
                            {!tab.ejecucion && tab.avisoEjecucion && (
                                <span className={`tab-aviso tab-aviso--${tab.avisoEjecucion}`}
                                    title={tab.avisoEjecucion === 'error' ? 'The query failed' : 'The query finished'} />
                            )}
                            {tab.dirty && <span className="tab-dirty">●</span>}
                            {/* En una fijada no se pinta la X: un boton de cerrar
                                que no cierra es peor que no tener boton. */}
                            {!tab.fijada && (
                                <span
                                    className="tab-close"
                                    onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
                                    title="Close"
                                >
                                    <LuX size={12} />
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 6.0 (M11): todas las abiertas, cuando no caben. */}
            {(fuera > 0 || lista) && (
                <div className="tab-bar-lista" ref={listaRef}>
                    <button type="button" className="tab-bar-lista-btn" onClick={() => { setFiltro(''); setLista(v => !v); }}
                        title={`All open tabs (${tabs.length})`} aria-haspopup="menu" aria-expanded={lista}>
                        <LuList size={13} /> <span>{fuera}</span>
                    </button>
                    {lista && (
                        <div className="tab-bar-lista-menu" role="menu">
                            {tabs.length > 6 && (
                                <input autoFocus className="tab-bar-lista-filtro" placeholder="Find an open tab…" value={filtro}
                                    onChange={e => setFiltro(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && enLista[0]) { onTabClick(enLista[0].id); setLista(false); } }} />
                            )}
                            {enLista.map(t => (
                                <button key={t.id} type="button" role="menuitem"
                                    className={`tab-bar-lista-item${t.id === activeTabId ? ' tab-bar-lista-item--activa' : ''}`}
                                    onClick={() => { onTabClick(t.id); setLista(false); }} title={t.path || t.name}>
                                    {t.fijada && <LuPin size={10} />}
                                    <span className="tab-bar-lista-nombre">{t.name}</span>
                                    {carpetas.has(t.id) && <span className="tab-carpeta">{carpetas.get(t.id)}</span>}
                                    {t.dirty && <span className="tab-dirty">●</span>}
                                </button>
                            ))}
                            {!enLista.length && <div className="tab-bar-lista-vacia">No open tab matches.</div>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Memoized: App re-renders must not reconcile the tab chrome when props are stable.
export default React.memo(TabBar);
