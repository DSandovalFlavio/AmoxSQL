/**
 * Robust SQL statement splitter.
 *
 * Splits a script into individual statements on top-level `;` only — a semicolon
 * inside a string literal, quoted identifier, dollar-quoted block, or comment is
 * NOT a separator. This replaces the naive `split(';')` that broke on things like
 * `SELECT ';'` or `$$ ... ; ... $$`.
 *
 * Returns one entry per executable statement, in source order, skipping segments
 * that are only whitespace/comments:
 *
 *   { raw, code, startLine }
 *     raw       — the statement text INCLUDING its own comments, trimmed. This is
 *                 what you execute (DuckDB ignores the comments) and what you put
 *                 in a notebook cell so nothing is lost.
 *     code      — `raw` with comments stripped and trimmed. Use it to classify the
 *                 statement or to test emptiness; never to execute.
 *     startLine — 1-based line, in the ORIGINAL script, of the statement's first
 *                 non-whitespace character. Because `raw` is trimmed to start at
 *                 that same character, a DuckDB error reported at "line L of raw"
 *                 maps back to the editor as `startLine + L - 1`.
 */
export function splitSqlStatements(sql) {
    if (!sql) return [];

    const statements = [];
    const n = sql.length;
    let i = 0;
    let line = 1;

    let segStart = 0;         // index where the current segment begins
    let sawContent = false;   // has the segment seen a non-space char yet?
    let contentLine = 1;      // line of that first non-space char

    const pushSegment = (endIdx) => {
        const raw = sql.slice(segStart, endIdx).trim();
        if (raw.length === 0) return;
        const code = stripComments(raw).trim();
        if (code.length === 0) return; // comment-only / whitespace segment
        statements.push({ raw, code, startLine: contentLine });
    };

    while (i < n) {
        const ch = sql[i];
        const next = sql[i + 1];

        if (ch === '\n') { line++; i++; continue; }

        // First non-whitespace char of the segment fixes its start line.
        if (!sawContent && !isSpace(ch)) { sawContent = true; contentLine = line; }

        // Line comment: -- to end of line
        if (ch === '-' && next === '-') {
            i += 2;
            while (i < n && sql[i] !== '\n') i++;
            continue;
        }
        // Block comment: /* ... */ (standard SQL — not nested)
        if (ch === '/' && next === '*') {
            i += 2;
            while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) {
                if (sql[i] === '\n') line++;
                i++;
            }
            i += 2; // consume the closing */
            continue;
        }
        // Single-quoted string literal ('' escapes a quote)
        if (ch === "'") { i = scanQuoted(sql, i, "'", () => line++); continue; }
        // Double-quoted identifier ("" escapes a quote)
        if (ch === '"') { i = scanQuoted(sql, i, '"', () => line++); continue; }

        // Dollar-quoted string: $tag$ ... $tag$ (tag may be empty: $$ ... $$)
        if (ch === '$') {
            const tag = /^\$[a-zA-Z0-9_]*\$/.exec(sql.slice(i))?.[0];
            if (tag) {
                const bodyStart = i + tag.length;
                const endIdx = sql.indexOf(tag, bodyStart);
                const stop = endIdx === -1 ? n : endIdx;
                for (let k = bodyStart; k < stop; k++) if (sql[k] === '\n') line++;
                i = endIdx === -1 ? n : endIdx + tag.length;
                continue;
            }
        }

        // Top-level statement separator
        if (ch === ';') {
            pushSegment(i); // exclude the ';'
            i++;
            segStart = i;
            sawContent = false;
            continue;
        }

        i++;
    }

    pushSegment(n); // trailing statement with no final ';'
    return statements;
}

/** True if the given script contains more than one executable statement. */
export function hasMultipleStatements(sql) {
    return splitSqlStatements(sql).length > 1;
}

function isSpace(ch) {
    return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\f' || ch === '\v';
}

function stripComments(sql) {
    return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Scan a quoted region starting at the opening quote index `start`. Handles the
 * SQL doubled-quote escape (`''` / `""`). Calls `onNewline` for each newline so
 * the caller can keep its line counter in sync. Returns the index just past the
 * closing quote.
 */
function scanQuoted(sql, start, quote, onNewline) {
    const n = sql.length;
    let i = start + 1;
    while (i < n) {
        const c = sql[i];
        if (c === '\n') onNewline();
        if (c === quote) {
            if (sql[i + 1] === quote) { i += 2; continue; } // escaped quote
            return i + 1;
        }
        i++;
    }
    return i; // unterminated — consume to end
}
