/**
 * NodeTypePicker — the "+" quick-add menu on a node's output handle
 * (Fase 4 of docs/dev/auditoria_dataflow_ux.md). A searchable, categorized
 * list of node types to add and connect in one gesture. Sources are excluded
 * — they don't take upstream input, so they never make sense as "the next
 * step after this node."
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { LuSearch } from 'react-icons/lu';
import { NODE_TYPES, NODE_CATEGORIES } from './chainNodeTypes';

const SUGGESTED_CATEGORIES = NODE_CATEGORIES.filter(c => c.id !== 'sources');

const NodeTypePicker = ({ x, y, onPick, onClose }) => {
    const [query, setQuery] = useState('');
    const ref = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
        const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDocClick, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onClose, true);
        window.addEventListener('resize', onClose);
        return () => {
            document.removeEventListener('mousedown', onDocClick, true);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onClose, true);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose]);

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        return SUGGESTED_CATEGORIES
            .map(cat => ({
                ...cat,
                types: cat.types.filter(typeId => {
                    const nt = NODE_TYPES[typeId];
                    if (!nt) return false;
                    if (!q) return true;
                    return nt.label.toLowerCase().includes(q) || (nt.description || '').toLowerCase().includes(q);
                }),
            }))
            .filter(cat => cat.types.length > 0);
    }, [query]);

    const w = 230, h = 320;
    const left = Math.min(x - w / 2, window.innerWidth - w - 8);
    const top = Math.min(y + 8, window.innerHeight - h - 8);

    return createPortal(
        <div ref={ref} className="chain-typepicker" style={{ left: Math.max(8, left), top }}>
            <div className="chain-typepicker-search">
                <LuSearch size={12} />
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Add a step…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>
            <div className="chain-typepicker-list">
                {groups.length === 0 && <div className="chain-typepicker-empty">No matching node type</div>}
                {groups.map(cat => (
                    <div key={cat.id}>
                        <div className="chain-typepicker-cat">{cat.label}</div>
                        {cat.types.map(typeId => {
                            const nt = NODE_TYPES[typeId];
                            const Icon = nt.icon;
                            return (
                                <button key={typeId} className="chain-typepicker-item" onClick={() => onPick(typeId)}>
                                    <span className="chain-typepicker-item-icon">
                                        <Icon size={12} style={{ color: nt.color.accent }} />
                                    </span>
                                    <span>{nt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>,
        document.body
    );
};

export default NodeTypePicker;
