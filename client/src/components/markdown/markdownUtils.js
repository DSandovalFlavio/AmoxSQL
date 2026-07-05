import GithubSlugger from 'github-slugger';

// ── Text extraction from a hast/mdast node ──────────────────────────────────
export function nodeToText(node) {
    if (!node) return '';
    if (typeof node.value === 'string') return node.value;
    if (Array.isArray(node.children)) return node.children.map(nodeToText).join('');
    return '';
}

// ── Table of contents extraction from raw markdown ──────────────────────────
// Skips fenced code blocks. Slugs match rehype-slug (both use github-slugger,
// reset once per document), so TOC links resolve to the rendered heading ids.
export function extractToc(markdown) {
    if (!markdown) return [];
    const slugger = new GithubSlugger();
    const lines = markdown.split('\n');
    const toc = [];
    let inFence = false;
    let fenceMarker = '';

    for (const raw of lines) {
        const line = raw;
        const fenceMatch = line.match(/^\s*(```|~~~)/);
        if (fenceMatch) {
            if (!inFence) { inFence = true; fenceMarker = fenceMatch[1]; }
            else if (line.trim().startsWith(fenceMarker)) { inFence = false; }
            continue;
        }
        if (inFence) continue;

        const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (h) {
            const level = h[1].length;
            // Strip inline markdown emphasis/code/links for the visible label,
            // but slug from the same cleaned text github-slugger sees post-render.
            const text = h[2]
                .replace(/`([^`]+)`/g, '$1')
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/\*([^*]+)\*/g, '$1')
                .replace(/_([^_]+)_/g, '$1')
                .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
                .trim();
            toc.push({ level, text, slug: slugger.slug(text) });
        }
    }
    return toc;
}

// ── Minimal mdast visitor (no external dep) ─────────────────────────────────
function visit(node, type, fn) {
    if (!node || typeof node !== 'object') return;
    if (node.type === type) fn(node);
    if (Array.isArray(node.children)) {
        for (const child of node.children) visit(child, type, fn);
    }
}

// ── remark plugin: GitHub-style alerts / admonitions ────────────────────────
// Converts `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]`
// blockquotes into styled callouts by tagging the blockquote with a className.
const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i;

export function remarkAlerts() {
    return (tree) => {
        visit(tree, 'blockquote', (node) => {
            const firstPara = node.children?.[0];
            if (!firstPara || firstPara.type !== 'paragraph') return;
            const firstText = firstPara.children?.[0];
            if (!firstText || firstText.type !== 'text') return;

            const m = firstText.value.match(ALERT_RE);
            if (!m) return;

            const type = m[1].toLowerCase();
            const rest = m[2];

            if (rest) {
                firstText.value = rest;
            } else {
                firstPara.children.shift(); // drop the marker text node
                if (firstPara.children[0]?.type === 'break') firstPara.children.shift();
                if (firstPara.children.length === 0) node.children.shift(); // drop empty paragraph
            }

            node.data = node.data || {};
            node.data.hProperties = node.data.hProperties || {};
            const existing = node.data.hProperties.className || [];
            const arr = Array.isArray(existing) ? existing : [existing];
            node.data.hProperties.className = [...arr, 'mde-alert', `mde-alert-${type}`];
            node.data.hProperties['data-alert'] = type;
        });
    };
}

// ── File-link helpers ───────────────────────────────────────────────────────
export const INTERNAL_LINK_RE = /\.(sql|amoxvis|md|sqlnb|csv|parquet|json)$/i;

export function isExternalHref(href) {
    return /^(https?:|mailto:)/i.test(href || '');
}

export function cleanRelPath(href) {
    return (href || '').replace(/^(\.\/|\/)/, '').split('#')[0];
}
