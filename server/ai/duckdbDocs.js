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
// get wrong → the doc file (relative to DOCS_SUBPATH) + the exact heading that
// answers it. `heading` biases section extraction so the model gets the right
// part of the file (not just the first section).
const GOTCHA_MAP = [
    // Filtering columns BY NAME with a pattern — the classic trap: models write
    // `EXCLUDE (like '%x%')` (invalid). The real syntax is `* NOT ILIKE '%x%'`.
    { re: /(exclud\w*|filter\w*|quit\w*|omit\w*|remov\w*).*(column|col|field|campo)|(column|col|field|campo).*(pattern|patr[oó]n|like|glob|similar|ilike)|\*\s*(not\s+)?i?like|\*\s*glob|\*\s*similar/i,
      file: 'expressions/star.md', heading: 'Column Filtering via Pattern Matching' },
    { re: /\bexclude\b|\breplace\b|\brename\b.*column|\bstar\b|select\s+\*/i, file: 'expressions/star.md', heading: 'EXCLUDE' },
    { re: /\bcolumns\s*\(|columns\s+expression|columns\s+lambda|columns\s+regex/i, file: 'expressions/star.md', heading: 'COLUMNS' },
    { re: /\bqualify\b/i, file: 'query_syntax/qualify.md' },
    { re: /\bunpivot\b/i, file: 'statements/unpivot.md' },
    { re: /\bpivot\b/i, file: 'statements/pivot.md' },
    { re: /\basof\b|as[- ]of join/i, file: 'query_syntax/from.md', heading: 'ASOF' },
    { re: /\blambda\b|list comprehension|comprensi[oó]n/i, file: 'functions/lambda.md' },
    { re: /\blist\b|\barray\b|arreglo/i, file: 'functions/list.md' },
    { re: /\bstruct\b/i, file: 'data_types/struct.md' },
    { re: /\bmap\b/i, file: 'data_types/map.md' },
    { re: /\bunion\b type|\bunion\b value/i, file: 'data_types/union.md' },
    { re: /\bsample\b|tablesample|using sample|muestra/i, file: 'query_syntax/sample.md' },
    { re: /window\s+function|over\s*\(|partition by|row_number|\brank\b|lead|lag/i, file: 'functions/window_functions.md' },
    { re: /\bwindow\b.*clause|\bwindow\b\s+w/i, file: 'query_syntax/window.md' },
    { re: /\bgroup(ing)?\s*sets\b|\brollup\b|\bcube\b/i, file: 'query_syntax/grouping_sets.md' },
    { re: /\bwith\b|\bcte\b|recursive/i, file: 'query_syntax/with.md' },
    { re: /\bregexp?_|regular expression|expresi[oó]n regular/i, file: 'functions/regular_expressions.md' },
    { re: /\blike\b|\bglob\b|\bilike\b|similar to|pattern match/i, file: 'functions/pattern_matching.md' },
    { re: /\bdate_?(trunc|part|diff)\b|strftime|strptime|fecha/i, file: 'functions/date.md' },
];

// Spanish→English term normalization: the docs are in English, but models often
// query in the user's language. Applied to the topic before matching.
const ES_EN = [
    [/\bexcluir\b|\bexcluye\b|\bexcluyendo\b/gi, 'exclude'],
    [/\bcolumnas?\b/gi, 'column'],
    [/\bfilas?\b/gi, 'row'],
    [/\bpatr[oó]n\b|\bpatrones\b/gi, 'pattern'],
    [/\bnombres?\b/gi, 'name'],
    [/\bfecha\b|\bfechas\b/gi, 'date'],
    [/\bventana\b/gi, 'window'],
    [/\bagrupar\b|\bagrupaci[oó]n\b/gi, 'group'],
    [/\bmuestra\b|\bmuestreo\b/gi, 'sample'],
    [/\bcomod[ií]n\b/gi, 'wildcard'],
    [/\bcadena\b|\btexto\b/gi, 'string'],
    [/\bconsulta\b/gi, 'query'],
    [/\bseleccionar\b|\bselecciona\b/gi, 'select'],
    [/\btabla\b/gi, 'table'],
];

function normalizeTopic(topic) {
    let t = String(topic || '');
    for (const [re, en] of ES_EN) t = t.replace(re, en);
    return t;
}

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

const STOP = new Set(['clause', 'function', 'functions', 'expression', 'expressions', 'syntax', 'example', 'examples', 'and', 'the', 'for', 'with', 'type', 'types', 'via', 'using', 'operators', 'operator']);

/** Score the manifest files for a topic. Returns all files sorted best-first. */
function scoreFiles(manifest, qNorm) {
    const terms = qNorm.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length > 2 && !STOP.has(t));
    return manifest.files.map(f => {
        const title = f.title.toLowerCase();
        const headings = (f.headings || []).join(' | ').toLowerCase();
        const pathL = f.path.toLowerCase();
        let score = 0;
        for (const t of terms) {
            if (pathL.includes(t)) score += 3;            // path segment is a strong signal
            if (title.includes(t)) score += 3;            // title too
            if (headings.includes(t)) score += 2;         // a heading mentions it
        }
        return { f, score };
    }).sort((a, b) => b.score - a.score);
}

/**
 * Finds the most relevant DuckDB doc for a free-text topic and returns the
 * relevant section PLUS the file's full table of contents (so the model can see
 * sibling sections it might actually want) and up to 3 alternative files.
 *
 * @param {string} topic
 * @param {string} [section] - request a specific heading within the resolved file
 * @returns {{ found, path?, title?, url?, matchedHeading?, content?, sections?, alternatives? }}
 */
function lookup(topic, section) {
    const dir = activeDir();
    const manifest = loadManifest(dir);
    if (!manifest) return { found: false };
    const raw = String(topic || '').trim();
    if (!raw) return { found: false };
    const qNorm = normalizeTopic(raw);

    // 1. Curated gotcha map wins — it carries the exact file + biasing heading.
    let file = null, gotchaHeading = null;
    for (const g of GOTCHA_MAP) {
        if (g.re.test(raw) || g.re.test(qNorm)) {
            file = manifest.files.find(f => f.path === g.file);
            if (file) { gotchaHeading = g.heading || null; break; }
        }
    }

    // 2. Otherwise score every file; keep the top 3 as alternatives.
    let alternatives = [];
    if (!file) {
        const ranked = scoreFiles(manifest, qNorm).filter(x => x.score > 0);
        if (ranked.length === 0) return { found: false };
        file = ranked[0].f;
        alternatives = ranked.slice(1, 4).map(x => ({ path: x.f.path, title: x.f.title }));
    }

    let md;
    try {
        md = fs.readFileSync(path.join(dir, file.path), 'utf8');
    } catch {
        return { found: false };
    }
    md = md.replace(/^---\n[\s\S]*?\n---\n/, ''); // strip front-matter

    // Which heading? explicit `section` arg > gotcha bias > query-token match.
    const qTokens = new Set(qNorm.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));
    const headings = file.headings || [];
    const pickByToken = () => headings.find(h => {
        const ht = h.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length > 2 && !STOP.has(t));
        return ht.some(t => qTokens.has(t));
    });
    let matchedHeading = null;
    if (section) {
        matchedHeading = headings.find(h => h.toLowerCase().includes(section.toLowerCase())) || section;
    } else if (gotchaHeading) {
        matchedHeading = headings.find(h => h.toLowerCase().includes(gotchaHeading.toLowerCase())) || pickByToken();
    } else {
        matchedHeading = pickByToken();
    }

    const content = extractSection(md, matchedHeading)
        .replace(/\{%[^%]*%\}/g, '')     // strip Jekyll liquid tags ({% link … %})
        .replace(/\]\(\s*\)/g, ']')       // fix links left empty by the strip
        .replace(/\n{3,}/g, '\n\n')       // collapse blank runs
        .trim()
        .slice(0, 6000);
    const webPath = file.path.replace(/\.md$/, '');
    return {
        found: true,
        path: file.path,
        title: file.title,
        url: `https://duckdb.org/docs/stable/sql/${webPath}`,
        matchedHeading: matchedHeading || null,
        // The whole TOC, so the model sees sibling sections (e.g. "Column
        // Filtering via Pattern Matching Operators") it can request via `section`.
        sections: headings,
        content,
        alternatives,
    };
}

module.exports = {
    downloadDocs, refresh, getStatus, lookup, loadManifest, normalizeTopic,
    bundledDir, userDir, activeDir,
    DOCS_SUBPATH, REPO, REF,
};
