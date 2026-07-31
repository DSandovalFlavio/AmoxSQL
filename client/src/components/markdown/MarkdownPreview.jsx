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
import { isLightTheme } from '../../theme.js';

// ── Fullscreen zoom/pan viewer (portal) ─────────────────────────────────────
function FullscreenViewer({ onClose, children }) {
    const [scale, setScale] = useState(1);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const dragRef = useRef(null);
    const stageRef = useRef(null);
    // Refs mirror state so the wheel/pan handlers always read the latest values
    // without depending on a fresh closure between rapid events.
    const scaleRef = useRef(1);
    const posRef = useRef({ x: 0, y: 0 });
    useEffect(() => { scaleRef.current = scale; }, [scale]);
    useEffect(() => { posRef.current = pos; }, [pos]);

    const clamp = (s) => Math.min(8, Math.max(0.2, s));

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Zoom anchored to the cursor: keep the point under the mouse fixed while
    // scaling (instead of always zooming toward the center).
    const onWheel = (e) => {
        e.preventDefault();
        const rect = stageRef.current?.getBoundingClientRect();
        const s = scaleRef.current;
        const ns = clamp(s * (e.deltaY < 0 ? 1.12 : 0.89));
        if (rect && ns !== s) {
            const ux = e.clientX - rect.left - rect.width / 2;
            const uy = e.clientY - rect.top - rect.height / 2;
            const p = posRef.current;
            setPos({ x: ux - (ns / s) * (ux - p.x), y: uy - (ns / s) * (uy - p.y) });
        }
        setScale(ns);
    };

    // Pan with pointer capture so the drag survives fast moves and the pointer
    // leaving the stage. The child <img>/<svg> have pointer-events:none + no
    // native drag (CSS), so the gesture is never hijacked by image-drag or
    // text-selection.
    const onPointerDown = (e) => {
        e.preventDefault();
        dragRef.current = { id: e.pointerId, x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    };
    const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d || d.id !== e.pointerId) return;
        setPos({ x: e.clientX - d.x, y: e.clientY - d.y });
    };
    const endDrag = (e) => {
        const d = dragRef.current;
        if (d && e?.currentTarget?.releasePointerCapture) {
            try { e.currentTarget.releasePointerCapture(d.id); } catch { /* noop */ }
        }
        dragRef.current = null;
    };
    const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

    return createPortal(
        <div className="mde-fs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="mde-fs-toolbar">
                <button onClick={() => setScale((s) => clamp(s * 1.2))} title="Zoom in"><LuZoomIn size={16} /></button>
                <button onClick={() => setScale((s) => clamp(s * 0.83))} title="Zoom out"><LuZoomOut size={16} /></button>
                <button onClick={reset} title="Reset"><LuRotateCcw size={15} /></button>
                <button onClick={onClose} title="Close (Esc)"><LuX size={16} /></button>
            </div>
            <div
                ref={stageRef}
                className="mde-fs-stage"
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
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
// Mermaid measures each label's width in a hidden container to size the node
// box, then renders. If the measuring font differs from the rendered font, the
// box comes out too narrow and the last letters get clipped. Mermaid's default
// is trebuchet ms, but the preview renders in the app font (Manrope, wider), so
// we pin BOTH measure and render to the same stack — mermaid injects its own
// <style> with this fontFamily into the SVG, so measure == render everywhere
// (preview and fullscreen portal alike).
const MERMAID_FONT = "'Manrope', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
let lastMermaidTheme = null;
function MermaidDiagram({ code, theme }) {
    const [svg, setSvg] = useState('');
    const [fs, setFs] = useState(false);

    useEffect(() => {
        const mermaidTheme = isLightTheme(theme) ? 'default' : 'dark';
        if (lastMermaidTheme !== mermaidTheme) {
            mermaid.initialize({
                startOnLoad: false,
                theme: mermaidTheme,
                securityLevel: 'loose',
                fontFamily: MERMAID_FONT,
                themeVariables: { fontFamily: MERMAID_FONT },
                flowchart: { htmlLabels: true, useMaxWidth: true },
            });
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

// ── Image src resolution ─────────────────────────────────────────────────────
// A relative image reference in a .md file (./assets/foo.png, ../img/d.svg) is
// relative to the file's own directory on disk — NOT to the app's origin, where
// the preview actually runs. So we rewrite relative srcs to the raw-file
// endpoint, resolved against the markdown file's directory. External/data/blob
// and root-absolute URLs pass through untouched. SVG and PNG both work.
function resolveAssetSrc(src, baseDir) {
    if (!src || /^(https?:|data:|blob:|\/)/i.test(src)) return src;
    const rel = src.replace(/^\.\//, '');
    const joined = baseDir ? `${baseDir}/${rel}` : rel;
    const parts = [];
    for (const seg of joined.replace(/\\/g, '/').split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') { parts.pop(); continue; }
        parts.push(seg);
    }
    return `${API_BASE}/api/file/raw?path=${encodeURIComponent(parts.join('/'))}`;
}

// ── Zoomable image ──────────────────────────────────────────────────────────
function ZoomableImage({ src, alt, baseDir, ...props }) {
    const [fs, setFs] = useState(false);
    const resolved = resolveAssetSrc(src, baseDir);
    return (
        <>
            <img src={resolved} alt={alt} {...props} className="mde-img" onClick={() => setFs(true)} title="Click to expand" />
            {fs && (
                <FullscreenViewer onClose={() => setFs(false)}>
                    <img src={resolved} alt={alt} draggable={false} style={{ maxWidth: 'none' }} />
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
                    borderRadius: 8, zIndex: 1000, width: 350, boxShadow: 'var(--shadow-md)',
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
                        <span style={{ color: 'var(--color-error)', display: 'block' }}>{previewContent?.error || 'Error loading preview'}</span>
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
const MarkdownPreview = ({ content, theme, onOpenFile, widthMode = 'compact', bodyRef, renderChartBlock, filePath }) => {
    const baseDir = useMemo(() => {
        if (!filePath) return '';
        const norm = filePath.replace(/\\/g, '/');
        const idx = norm.lastIndexOf('/');
        return idx >= 0 ? norm.slice(0, idx) : '';
    }, [filePath]);

    const components = useMemo(() => ({
        a: (p) => <FileLink {...p} onOpenFile={onOpenFile} />,
        img: (p) => <ZoomableImage {...p} baseDir={baseDir} />,
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
    }), [onOpenFile, theme, renderChartBlock, baseDir]);

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
