/**
 * NodeActionMenu — the node's "…" dropdown and its right-click context menu
 * (same component, same items — Fase 1 of docs/dev/auditoria_dataflow_ux.md).
 * Positioned at a screen point, closes on outside click / Escape / scroll.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    LuPlay, LuCode, LuCopy, LuPause, LuCircleCheck, LuPencil, LuCircleHelp, LuTrash2,
} from 'react-icons/lu';

const NodeActionMenu = ({ x, y, disabled, onAction, onClose }) => {
    const ref = useRef(null);

    useEffect(() => {
        const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        // Ignore scrolls that originate inside the menu itself — a capture-
        // phase 'scroll' listener on window sees every scroll in the tree
        // regardless of bubbling, so without this guard, a menu that ever
        // grows scrollable content would close itself on its own first
        // pixel of internal scroll (see NodeTypePicker, which hit exactly
        // this).
        const onScroll = (e) => { if (ref.current && ref.current.contains(e.target)) return; onClose(); };
        document.addEventListener('mousedown', onDocClick, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onClose);
        return () => {
            document.removeEventListener('mousedown', onDocClick, true);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose]);

    // Keep the menu on-screen — flip up/left if it would overflow.
    const w = 190, h = 260;
    const left = Math.min(x, window.innerWidth - w - 8);
    const top = Math.min(y, window.innerHeight - h - 8);

    const items = [
        { id: 'run-only', icon: LuPlay, label: 'Run only this node' },
        { id: 'view-sql', icon: LuCode, label: 'View SQL' },
        { id: 'duplicate', icon: LuCopy, label: 'Duplicate' },
        { id: 'toggle-disable', icon: disabled ? LuCircleCheck : LuPause, label: disabled ? 'Enable' : 'Disable' },
        { id: 'rename', icon: LuPencil, label: 'Rename' },
        { id: 'docs', icon: LuCircleHelp, label: 'Documentation' },
        { id: 'delete', icon: LuTrash2, label: 'Delete', danger: true },
    ];

    return createPortal(
        <div ref={ref} className="chain-node-menu" style={{ left, top }} onWheel={(e) => e.stopPropagation()}>
            {items.map((it, i) => (
                <div key={it.id}>
                    {it.id === 'delete' && <div className="chain-node-menu-sep" />}
                    <button
                        className={`chain-node-menu-item${it.danger ? ' chain-node-menu-item-danger' : ''}`}
                        onClick={() => { onAction(it.id); onClose(); }}
                    >
                        <it.icon size={13} /><span>{it.label}</span>
                    </button>
                </div>
            ))}
        </div>,
        document.body
    );
};

export default NodeActionMenu;
