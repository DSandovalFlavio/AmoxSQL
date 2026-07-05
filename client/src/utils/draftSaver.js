/**
 * Draft auto-save utility.
 * Persists { content, savedAt } to localStorage keyed by file path.
 *
 * localStorage.setItem is synchronous main-thread I/O and callers invoke
 * saveDraft on every content change (i.e. per keystroke), so writes are
 * debounced per path and flushed on unload. Reads consult the pending
 * buffer first so a draft is never observed stale.
 */
const DRAFT_PREFIX = 'amoxsql-draft:';
const DRAFT_INDEX_KEY = 'amoxsql-drafts-index';
const DRAFT_DEBOUNCE_MS = 5000;

const pendingDrafts = new Map(); // filePath -> content
let flushTimer = null;

function writeDraft(filePath, content) {
    try {
        const key = DRAFT_PREFIX + filePath;
        localStorage.setItem(key, JSON.stringify({ content, savedAt: Date.now() }));
        // Update index
        const idx = getDraftIndex();
        if (!idx.includes(filePath)) {
            idx.push(filePath);
            localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(idx));
        }
    } catch {}
}

export function flushDrafts() {
    if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    for (const [filePath, content] of pendingDrafts) {
        writeDraft(filePath, content);
    }
    pendingDrafts.clear();
}

export function saveDraft(filePath, content) {
    if (!filePath || content === undefined) return;
    pendingDrafts.set(filePath, content);
    if (flushTimer === null) {
        flushTimer = setTimeout(flushDrafts, DRAFT_DEBOUNCE_MS);
    }
}

export function getDraft(filePath) {
    if (!filePath) return null;
    if (pendingDrafts.has(filePath)) {
        return { content: pendingDrafts.get(filePath), savedAt: Date.now() };
    }
    try {
        const raw = localStorage.getItem(DRAFT_PREFIX + filePath);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function clearDraft(filePath) {
    if (!filePath) return;
    pendingDrafts.delete(filePath);
    try {
        localStorage.removeItem(DRAFT_PREFIX + filePath);
        const idx = getDraftIndex().filter(p => p !== filePath);
        localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(idx));
    } catch {}
}

function getDraftIndex() {
    try {
        return JSON.parse(localStorage.getItem(DRAFT_INDEX_KEY) || '[]');
    } catch { return []; }
}

if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flushDrafts);
}
