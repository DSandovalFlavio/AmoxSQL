import SqlLanguageWorker from '../workers/sqlLanguageWorker.js?worker';

export class SqlWorkerBridge {
    constructor() {
        this.worker = new SqlLanguageWorker();
        this.pendingRequests = new Map();
        this.messageId = 1;
        this.isReady = false;

        this.worker.onmessage = (e) => {
            const { id, status, result, error } = e.data;
            if (this.pendingRequests.has(id)) {
                const { resolve, reject } = this.pendingRequests.get(id);
                this.pendingRequests.delete(id);
                if (status === 'success') {
                    resolve(result);
                } else {
                    reject(new Error(error));
                }
            }
        };

        this.worker.onerror = (err) => {
            console.error('[WorkerBridge] Critical Worker Error:', err);
        };
        
        // Setup debouncing for document sync
        this.syncTimeout = null;
    }

    async init() {
        // URLs must be absolute or relative to public directory for the worker to fetch them
        const treeSitterWasmUrl = new URL('/tree-sitter.wasm', window.location.origin).href;
        const sqlWasmUrl = new URL('/tree-sitter-sql.wasm', window.location.origin).href;

        const result = await this.sendMessage('init', { treeSitterWasmUrl, sqlWasmUrl });
        this.isReady = result.ready;
        return this.isReady;
    }

    sendMessage(action, payload = {}) {
        return new Promise((resolve, reject) => {
            const id = this.messageId++;
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ action, id, payload });
        });
    }

    syncDocument(text) {
        if (!this.isReady) return;
        // Send document to worker immediately. Tree-sitter parses in <3ms.
        // Sync latency here causes AST out-of-bounds errors on fast typing!
        this.worker.postMessage({ action: 'syncDocument', id: 0, payload: { text } });
    }

    updateSchema(schemaCache) {
        if (!this.isReady) return;
        this.worker.postMessage({ action: 'updateSchema', id: 0, payload: schemaCache });
    }

    updateDbtManifest(dbtCache) {
        if (!this.isReady) return;
        this.worker.postMessage({ action: 'updateDbtManifest', id: 0, payload: dbtCache });
    }

    async getCompletions(line, column, triggerChar) {
        const emptyDerived = { relations: [], dotTarget: null };
        if (!this.isReady) return { suggestions: [], clause: 'ROOT', derived: emptyDerived };
        try {
            const response = await this.sendMessage('requestCompletions', { line, column, triggerChar });
            return {
                suggestions: response.suggestions || [],
                clause: response.clause || 'ROOT',
                derived: response.derived || emptyDerived
            };
        } catch (err) {
            console.error('[WorkerBridge] Failed to get completions:', err);
            return { suggestions: [], clause: 'ROOT', derived: emptyDerived };
        }
    }

    dispose() {
        if (this.syncTimeout) clearTimeout(this.syncTimeout);
        if (this.worker) this.worker.terminate();
        this.isReady = false;
        this.pendingRequests.clear();
    }
}
