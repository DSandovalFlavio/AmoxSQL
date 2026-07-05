import { API_BASE } from '../../api.js';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';
import {
    LuMaximize2, LuX, LuCopy, LuCheck, LuInfo, LuTriangleAlert, LuLightbulb,
    LuOctagonAlert, LuCircleAlert, LuZoomIn, LuZoomOut, LuRotateCcw, LuFileCode2, LuEye,
} from 'react-icons/lu';
import { nodeToText, remarkAlerts, isExternalHref, cleanRelPath, INTERNAL_LINK_RE } from './markdownUtils';

const LIGHT_THEMES = ['ivory', 'mist', 'light', 'snow'];

// ── Fullscreen zoom/pan viewer (portal) ─────────────────────────────────────
function FullscreenViewer({ onClose, children }) {
    const [scale, setScale] = useState(1);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const dragRef = useRef(null);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const onWheel = (e) => {
        e.preventDefault();
        setScale((s) => Math.min(8, Math.max(0.2, s * (e.deltaY < 0 ? 1.12 : 0.89))));
    };
    const onPointerDown = (e) => {
        dragRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    };
    const onPointerMove = (e) => {
        if (!dragRef.current) return;
        setPos({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
    };
    const onPointerUp = () => { dragRef.current = null; };
    const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

    return createPortal(
        <div className="mde-fs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="mde-fs-toolbar">
                <button onClick={() => setScale((s) => Math.min(8, s * 1.2))} title="Zoom in"><LuZoomIn size={16} /></button>
                <button onClick={() => setScale((s) => Math.max(0.2, s * 0.83))} title="Zoom out"><LuZoomOut size={16} /></button>
                <button onClick={reset} title="Reset"><LuRotateCcw size={15} /></button>
                <button onClick={onClose} title="Close (Esc)"><LuX size={16} /></button>
            </div>
            <div
                className="mde-fs-stage"
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
            >
                <div
                    className="mde-fs-content"
                    style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
                >
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ── Mermaid diagram with fullscreen ─────────────────────────────────────────
let lastMermaidTheme = null;
function MermaidDiagram({ code, theme }) {
    const [svg, setSvg] = useState('');
    const [fs, setFs] = useState(false);

    useEffect(() => {
        const mermaidTheme = LIGHT_THEMES.includes(theme) ? 'default' : 'dark';
        if (lastMermaidTheme !== mermaidTheme) {
            mermaid.initialize({ startOnLoad: false, theme: mermaidTheme, securityLevel: 'loose' });
            lastMermaidTheme = mermaidTheme;
        }
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
        let cancelled = false;
        mermaid.render(id, code)
            .then((r) => { if (!cancelled) setSvg(r.svg); })
            .catch(() => {
                if (!cancelled) setSvg('<div class="mde-mermaid-error">Mermaid syntax error</div>');
            });
        return () => { cancelled = true; };
    }, [code, theme]);

    return (
        <>
            <div className="mde-mermaid-wrap">
                <button className="mde-mermaid-expand" title="Expand diagram" onClick={() => setFs(true)}>
                    <LuMaximize2 size={13} />
                </button>
                <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
            </div>
            {fs && (
                <FullscreenViewer onClose={() => setFs(false)}>
                    <div className="mde-fs-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
                </FullscreenViewer>
            )}
        </>
    );
}

// ── Zoomable image ──────────────────────────────────────────────────────────
function ZoomableImage({ src, alt, ...props }) {
    const [fs, setFs] = useState(false);
    return (
        <>
            <img src={src} alt={alt} {...props} className="mde-img" onClick={() => setFs(true)} title="Click to expand" />
            {fs && (
                <FullscreenViewer onClose={() => setFs(false)}>
                    <img src={src} alt={alt} style={{ maxWidth: 'none' }} />
                </FullscreenViewer>
            )}
        </>
    );
}

// ── Code block with copy + language label ───────────────────────────────────
function CodeBlock({ lang, raw, children }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(raw);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch { /* noop */ }
    };
    return (
        <div className="mde-codeblock">
            <div className="mde-codeblock-head">
                <span className="mde-codeblock-lang">{lang || 'text'}</span>
                <button className="mde-codeblock-copy" onClick={copy} title="Copy code">
                    {copied ? <LuCheck size={12} /> : <LuCopy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <pre>{children}</pre>
        </div>
    );
}

// ── Alert / callout ─────────────────────────────────────────────────────────
const ALERT_META = {
    note: { Icon: LuInfo, label: 'Note' },
    tip: { Icon: LuLightbulb, label: 'Tip' },
    important: { Icon: LuCircleAlert, label: 'Important' },
    warning: { Icon: LuTriangleAlert, label: 'Warning' },
    caution: { Icon: LuOctagonAlert, label: 'Caution' },
};

// ── File link with hover preview + open-in-app ──────────────────────────────
function FileLink({ href, children, onOpenFile }) {
    const [showPopover, setShowPopover] = useState(false);
    const [previewContent, setPreviewContent] = useState(null);
    const [loading, setLoading] = useState(false);
    const isSql = href?.endsWith('.sql');
    const isAmoxvis = href?.endsWith('.amoxvis');
    const isInternal = href && !isExternalHref(href) && INTERNAL_LINK_RE.test(href);

    const handleMouseEnter = async () => {
        if (!isSql && !isAmoxvis) return;
        setShowPopover(true);
        if (previewContent || loading) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(cleanRelPath(href))}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            if (isSql) {
                const lines = data.content.split('\n');
                setPreviewContent(lines.slice(0, 20).join('\n') + (lines.length > 20 ? '\n...' : ''));
            } else if (isAmoxvis) {
                setPreviewContent(JSON.parse(data.content));
            }
        } catch {
            setPreviewContent({ error: 'Failed to load preview' });
        } finally {
            setLoading(false);
        }
    };

    const handleClick = (e) => {
        if (isInternal && onOpenFile) {
            e.preventDefault();
            onOpenFile(cleanRelPath(href));
        } else if (isExternalHref(href)) {
            e.preventDefault();
            if (window.electronAPI?.openExternal) window.electronAPI.openExternal(href);
            else window.open(href, '_blank', 'noopener');
        }
    };

    return (
        <span className="mde-link-wrapper" onMouseEnter={handleMouseEnter} onMouseLeave={() => setShowPopover(false)} style={{ position: 'relative', display: 'inline-block' }}>
            <a href={href} onClick={handleClick} style={{ textDecoration: 'underline', color: 'var(--accent-primary)', cursor: 'pointer' }}>{children}</a>
            {showPopover && (isSql || isAmoxvis) && (
                <span className="mde-link-popover" style={{
                    position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, padding: 12,
                    background: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                    borderRadius: 8, zIndex: 1000, width: 350, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-color)', textAlign: 'left', display: 'block',
                }}>
                    <span style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-active)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isSql ? <LuFileCode2 size={14} /> : <LuEye size={14} />} Preview: {href.split('/').pop()}
                    </span>
                    {loading ? <span style={{ opacity: 0.7, display: 'block' }}>Loading preview...</span> : isSql ? (
                        <span style={{ margin: 0, padding: 8, background: 'var(--surface-base)', borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)', border: '1px solid var(--border-default)', display: 'block', whiteSpace: 'pre-wrap' }}>
                            {previewContent}
                        </span>
                    ) : isAmoxvis && previewContent && !previewContent.error ? (
                        <span style={{ background: 'var(--surface-base)', borderRadius: 4, padding: 12, border: '1px solid var(--border-default)', display: 'block' }}>
                            <span style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Chart Configuration</span>
                            <span style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, opacity: 0.8 }}>
                                <span><strong>Type:</strong> {previewContent.config?.chartType || previewContent.chartType || 'Auto'}</span>
                                <span><strong>X-Axis:</strong> {previewContent.config?.xAxisKey || previewContent.xAxisKey || '-'}</span>
                                <span style={{ gridColumn: 'span 2' }}><strong>Y-Axis:</strong> {(previewContent.config?.yAxisKeys || previewContent.yAxisKeys || []).join(', ') || '-'}</span>
                            </span>
                        </span>
                    ) : (
                        <span style={{ color: '#ef4444', display: 'block' }}>{previewContent?.error || 'Error loading preview'}</span>
                    )}
                </span>
            )}
        </span>
    );
}

// ── Heading with anchor ─────────────────────────────────────────────────────
function makeHeading(level) {
    const Tag = `h${level}`;
    return function Heading({ node, children, ...props }) {
        const id = props.id || node?.properties?.id;
        const onAnchor = (e) => {
            e.preventDefault();
            if (!id) return;
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        return (
            <Tag {...props} id={id} className="mde-heading">
                {id && <a href={`#${id}`} className="mde-anchor" onClick={onAnchor} aria-hidden="true">#</a>}
                {children}
            </Tag>
        );
    };
}

// ── Main preview ────────────────────────────────────────────────────────────
// `renderChartBlock`, when provided, renders fenced ```amoxchart blocks (used
// by Report Flow decks to embed a live, refreshable .amoxvis chart) — it
// receives the raw fenced-block body (YAML-ish text) and returns a ReactNode.
// Without it, an ```amoxchart block just renders as a normal code block.
const MarkdownPreview = ({ content, theme, onOpenFile, widthMode = 'compact', bodyRef, renderChartBlock }) => {
    const components = useMemo(() => ({
        a: (p) => <FileLink {...p} onOpenFile={onOpenFile} />,
        img: (p) => <ZoomableImage {...p} />,
        h1: makeHeading(1), h2: makeHeading(2), h3: makeHeading(3),
        h4: makeHeading(4), h5: makeHeading(5), h6: makeHeading(6),
        code: ({ node, className, children, ...props }) => (
            <code className={className} {...props}>{children}</code>
        ),
        pre: ({ node, children }) => {
            const codeNode = node?.children?.find((c) => c.tagName === 'code');
            const cls = codeNode?.properties?.className || [];
            const arr = Array.isArray(cls) ? cls : [cls];
            const langClass = arr.find((c) => typeof c === 'string' && c.startsWith('language-'));
            const lang = langClass ? langClass.replace('language-', '') : '';
            const raw = codeNode ? nodeToText(codeNode).replace(/\n$/, '') : '';
            if (lang === 'mermaid') return <MermaidDiagram code={raw} theme={theme} />;
            if (lang === 'amoxchart' && renderChartBlock) return renderChartBlock(raw);
            return <CodeBlock lang={lang} raw={raw}>{children}</CodeBlock>;
        },
        blockquote: ({ node, className, children, ...props }) => {
            const type = node?.properties?.dataAlert || node?.properties?.['data-alert'];
            if (type && ALERT_META[type]) {
                const { Icon, label } = ALERT_META[type];
                return (
                    <blockquote className={className} {...props}>
                        <div className="mde-alert-head"><Icon size={15} /> {label}</div>
                        {children}
                    </blockquote>
                );
            }
            return <blockquote className={className} {...props}>{children}</blockquote>;
        },
    }), [onOpenFile, theme, renderChartBlock]);

    return (
        <div className={`mde-preview-body mde-preview-body--${widthMode}`} ref={bodyRef}>
            {content?.trim() ? (
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath, remarkAlerts]}
                    rehypePlugins={[rehypeSlug, rehypeKatex, [rehypeHighlight, { ignoreMissing: true }]]}
                    components={components}
                >
                    {content}
                </ReactMarkdown>
            ) : (
                <span className="mde-preview-empty">Empty document — switch to Edit to start writing.</span>
            )}
        </div>
    );
};

export default MarkdownPreview;
