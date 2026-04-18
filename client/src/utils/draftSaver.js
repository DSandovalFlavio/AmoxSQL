/**
 * Draft auto-save utility.
 * Saves editor content to localStorage every 10 seconds.
 * Persists { content, savedAt } keyed by file path.
 */
const DRAFT_PREFIX = 'amoxsql-draft:';
const DRAFT_INDEX_KEY = 'amoxsql-drafts-index';

export function saveDraft(filePath, content) {
    if (!filePath || content === undefined) return;
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

export function getDraft(filePath) {
    if (!filePath) return null;
    try {
        const raw = localStorage.getItem(DRAFT_PREFIX + filePath);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function clearDraft(filePath) {
    if (!filePath) return;
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
