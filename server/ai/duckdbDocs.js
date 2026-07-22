/**
 * AmoxSQL AI — DuckDB documentation lookup (offline-first).
 *
 * The official DuckDB SQL docs are plain markdown files in the public repo
 * duckdb/duckdb-web (docs/current/sql/**). We bundle a full snapshot with the
 * app for 100% offline use, and can refresh it on demand or on a schedule.
 * No headless browser — just raw-markdown fetches + a small local index.
 *
 * Layout:
 *   - Bundled snapshot (ships with the app): <resources>/duckdb-docs (prod)
 *     or server/ai/data/duckdb-docs (dev). Read-only base — always available.
 *   - User snapshot (written by a refresh): ~/.amoxsql/duckdb-docs. Takes
 *     precedence when present, so updates never touch the app install.
 *   Each snapshot dir holds the markdown tree + a manifest.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = 'duckdb/duckdb-web';
const REF = 'main';
const DOCS_SUBPATH = 'docs/current/sql';

// Curated "gotcha" aliases: the DuckDB-specific syntax small models most often
// get wrong → the doc file (relative to DOCS_SUBPATH) that explains it.
const GOTCHA_MAP = [
    { re: /\bexclude\b|\breplace\b|\bcolumns\s*\(|\*\s*exclude|star\b/i, file: 'expressions/star.md' },
    { re: /\bqualify\b/i, file: 'query_syntax/qualify.md' },
    { re: /\bpivot\b/i, file: 'statements/pivot.md' },
    { re: /\bunpivot\b/i, file: 'statements/unpivot.md' },
    { re: /\basof\b|as[- ]of join/i, file: 'query_syntax/from.md' },
    { re: /\blambda\b|list comprehension|->\s*/i, file: 'functions/lambda.md' },
    { re: /\blist\b|\barray\b/i, file: 'functions/list.md' },
    { re: /\bstruct\b/i, file: 'data_types/struct.md' },
    { re: /\bmap\b/i, file: 'data_types/map.md' },
    { re: /\bunion\b type|\bunion\b value/i, file: 'data_types/union.md' },
    { re: /\bsample\b|tablesample|using sample/i, file: 'samples.md' },
    { re: /\bwindow\b|over\s*\(|partition by/i, file: 'functions/window.md' },
    { re: /\bgroup(ing)?\s*sets\b|\brollup\b|\bcube\b/i, file: 'query_syntax/grouping_sets.md' },
    { re: /\bwith\b|\bcte\b|recursive/i, file: 'query_syntax/with.md' },
    { re: /\bregexp?_|regular expression/i, file: 'functions/regular_expressions.md' },
    { re: /\bdate_?(trunc|part|diff)\b|strftime|strptime/i, file: 'functions/date.md' },
    { re: /\bjson\b/i, file: 'data_types/json.md' },
];

// ── Path resolution ─────────────────────────────────────────────────────────

function bundledDir() {
    if (process.resourcesPath) {
        const packaged = path.join(process.resourcesPath, 'duckdb-docs');
        if (fs.existsSync(packaged)) return packaged;
    }
    return path.join(__dirname, 'data', 'duckdb-docs');
}

function userDir() {
    return path.join(os.homedir(), '.amoxsql', 'duckdb-docs');
}

/** The active snapshot: the user refresh if it has a manifest, else the bundle. */
function activeDir() {
    const u = userDir();
    if (fs.existsSync(path.join(u, 'manifest.json'))) return u;
    return bundledDir();
}

// ── Manifest & status ───────────────────────────────────────────────────────

function loadManifest(dir = activeDir()) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    } catch {
        return null;
    }
}

/** Snapshot status for the UI: when it was extracted, how many files, source. */
function getStatus() {
    const dir = activeDir();
    const m = loadManifest(dir);
    return {
        available: !!m,
        extractedAt: m?.extractedAt || null,
        count: m?.count || 0,
        source: dir === userDir() ? 'user' : 'bundled',
    };
}

// ── Download (shared by the build-time gen script and runtime refresh) ────────

async function fetchText(url) {
    const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!resp.ok) throw new Error(`${resp.status} ${url}`);
    return resp.text();
}

/** Parse the front-matter `title:` and the ##/### headings from a markdown doc. */
function parseDocMeta(md) {
    let title = null;
    const fm = md.match(/^---\n([\s\S]*?)\n---/);
    if (fm) {
        const t = fm[1].match(/^title:\s*(.+)$/m);
        if (t) title = t[1].trim().replace(/^["']|["']$/g, '');
    }
    const headings = [];
    const hre = /^#{2,3}\s+(.+)$/gm;
    let h;
    while ((h = hre.exec(md)) !== null) {
        headings.push(h[1].replace(/`/g, '').trim());
    }
    return { title, headings };
}

/**
 * Downloads the full docs/current/sql markdown tree into `targetDir`, preserving
 * the relative structure, and writes a manifest.json. Returns the manifest.
 * Used by scripts/gen_duckdb_docs.js (bundle) and refresh() (user dir).
 *
 * @param {string} targetDir
 * @param {(msg:string)=>void} [log]
 * @param {string} nowIso - caller-supplied timestamp (Date is injected for testability)
 */
async function downloadDocs(targetDir, log = () => {}, nowIso = new Date().toISOString()) {
    log('Fetching file tree…');
    const tree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/${REF}?recursive=1`, {
        signal: AbortSignal.timeout(30000),
        headers: { 'Accept': 'application/vnd.github+json' },
    })).json();
    if (!Array.isArray(tree.tree)) throw new Error(`GitHub tree error: ${tree.message || 'unknown'}`);

    const docs = tree.tree
        .filter(n => n.type === 'blob' && n.path.startsWith(DOCS_SUBPATH + '/') && n.path.endsWith('.md'))
        .map(n => n.path);
    log(`${docs.length} markdown files to fetch.`);

    fs.mkdirSync(targetDir, { recursive: true });
    const files = [];
    const CONCURRENCY = 8;
    for (let i = 0; i < docs.length; i += CONCURRENCY) {
        const batch = docs.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (repoPath) => {
            const rel = repoPath.slice(DOCS_SUBPATH.length + 1); // e.g. "expressions/star.md"
            const md = await fetchText(`https://raw.githubusercontent.com/${REPO}/${REF}/${repoPath}`);
            const dest = path.join(targetDir, rel);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, md, 'utf8');
            const { title, headings } = parseDocMeta(md);
            files.push({ path: rel, title: title || rel, headings });
        }));
        log(`  ${Math.min(i + CONCURRENCY, docs.length)}/${docs.length}`);
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    const manifest = {
        source: REPO, ref: REF, basePath: DOCS_SUBPATH,
        extractedAt: nowIso, count: files.length, files,
    };
    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    log(`Done. ${files.length} files → ${targetDir}`);
    return manifest;
}

/** Refresh the user snapshot from GitHub. Returns the new status. */
async function refresh(log = () => {}) {
    const manifest = await downloadDocs(userDir(), log);
    return { available: true, extractedAt: manifest.extractedAt, count: manifest.count, source: 'user' };
}

// ── Lookup ──────────────────────────────────────────────────────────────────

/** Slice the markdown section under a heading (until the next same-or-higher one). */
function extractSection(md, heading) {
    if (!heading) return md;
    const lines = md.split('\n');
    const norm = s => s.replace(/[`*_]/g, '').toLowerCase().trim();
    const target = norm(heading);
    let start = -1, startLevel = 0;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{2,4})\s+(.+)$/);
        if (m && norm(m[2]).includes(target)) { start = i; startLevel = m[1].length; break; }
    }
    if (start === -1) return md;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        const m = lines[i].match(/^(#{2,4})\s+/);
        if (m && m[1].length <= startLevel) { end = i; break; }
    }
    return lines.slice(start, end).join('\n');
}

/**
 * Finds the most relevant doc for a free-text topic and returns its content.
 * @param {string} topic
 * @returns {{ found: boolean, path?: string, title?: string, url?: string, content?: string, matchedHeading?: string }}
 */
function lookup(topic) {
    const dir = activeDir();
    const manifest = loadManifest(dir);
    if (!manifest) return { found: false };
    const q = String(topic || '').trim();
    if (!q) return { found: false };

    // 1. Curated gotcha map wins.
    let file = null;
    for (const g of GOTCHA_MAP) {
        if (g.re.test(q)) { file = manifest.files.find(f => f.path === g.file); if (file) break; }
    }

    // 2. Otherwise score by title / heading / path token overlap.
    if (!file) {
        const terms = q.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length > 2);
        let best = null, bestScore = 0;
        for (const f of manifest.files) {
            const hay = (f.title + ' ' + f.path + ' ' + (f.headings || []).join(' ')).toLowerCase();
            let score = 0;
            for (const t of terms) if (hay.includes(t)) score += hay.includes(' ' + t) || f.path.includes(t) ? 2 : 1;
            if (score > bestScore) { bestScore = score; best = f; }
        }
        if (best && bestScore > 0) file = best;
    }
    if (!file) return { found: false };

    let md;
    try {
        md = fs.readFileSync(path.join(dir, file.path), 'utf8');
    } catch {
        return { found: false };
    }

    // Strip YAML front-matter — it's noise for the model.
    md = md.replace(/^---\n[\s\S]*?\n---\n/, '');

    // Pick the heading whose key token appears in the query (e.g. "EXCLUDE
    // Clause" matches a question about EXCLUDE). Generic words are ignored.
    const STOP = new Set(['clause', 'function', 'functions', 'expression', 'syntax', 'example', 'examples', 'and', 'the', 'for', 'with', 'type', 'types']);
    const qTokens = new Set(q.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));
    let matchedHeading = (file.headings || []).find(h => {
        const ht = h.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length > 2 && !STOP.has(t));
        return ht.some(t => qTokens.has(t));
    });
    const content = extractSection(md, matchedHeading).trim().slice(0, 6000);
    const webPath = file.path.replace(/\.md$/, '');
    return {
        found: true,
        path: file.path,
        title: file.title,
        url: `https://duckdb.org/docs/stable/sql/${webPath}`,
        matchedHeading: matchedHeading || null,
        content,
    };
}

module.exports = {
    downloadDocs, refresh, getStatus, lookup, loadManifest,
    bundledDir, userDir, activeDir,
    DOCS_SUBPATH, REPO, REF,
};
