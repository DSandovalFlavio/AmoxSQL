/**
 * Singleton in-memory cache for sidebar panels.
 * Lives outside of React — survives remounts and re-renders.
 * Panels read from this cache on mount and refresh it via their Refresh buttons.
 */

const cache = {
    schema: null,       // { data: [...], ts: Date }
    snippets: null,     // { data: [...], ts: Date }
    history: null,      // { data: [...], ts: Date }
    bookmarks: null,    // { data: [...], ts: Date }
};

const listeners = {};

export function getCached(key) {
    return cache[key]?.data ?? null;
}

export function setCached(key, data) {
    cache[key] = { data, ts: Date.now() };
    (listeners[key] || []).forEach(fn => fn(data));
}

export function subscribe(key, fn) {
    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(fn);
    return () => {
        listeners[key] = listeners[key].filter(f => f !== fn);
    };
}

/** Clears all schema:* keys — call after DDL queries that change the schema */
export function invalidateSchema() {
    for (const key of Object.keys(cache)) {
        if (key.startsWith('schema:')) cache[key] = null;
    }
}
