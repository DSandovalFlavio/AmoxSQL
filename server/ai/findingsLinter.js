'use strict';

/**
 * findingsLinter.js
 *
 * Verifies that numeric values cited in final_answer findings[] actually appear
 * in the query results produced during the conversation turn.
 *
 * Strategy (v1 — conservative):
 *   - Extract numbers from each finding.value
 *   - Normalise them (strip currency/K/M/B/%/commas)
 *   - Check against all cells in the queryResults Map
 *   - Return a list of unverified findings so the caller can append a caveat
 *
 * Intentionally does NOT block the final_answer — it only flags. This avoids
 * the agent getting stuck in infinite retry loops on edge cases.
 */

/**
 * Regex that matches a numeric token inside a finding value string.
 * Captures digits with optional separators and suffix multipliers.
 * Examples matched: "$1.4M", "23%", "1,234.56", "+0.8K", "−15B"
 */
const NUM_TOKEN_RE = /[+-]?\$?€?£?(\d[\d,.\s]*)([KMBkmb])?%?/g;

/** Multipliers for K/M/B shorthand */
const MULTIPLIERS = { k: 1e3, m: 1e6, b: 1e9 };

/**
 * Extract all normalised numeric values from a string.
 * Returns an array of numbers (may be empty).
 */
function extractNumbers(str) {
    if (!str || typeof str !== 'string') return [];
    const nums = [];
    let match;
    NUM_TOKEN_RE.lastIndex = 0;
    while ((match = NUM_TOKEN_RE.exec(str)) !== null) {
        const raw = match[1].replace(/[\s,]/g, '');
        const suffix = (match[2] || '').toLowerCase();
        const base = parseFloat(raw);
        if (isNaN(base)) continue;
        const multiplier = MULTIPLIERS[suffix] || 1;
        nums.push(base * multiplier);
    }
    return nums;
}

/**
 * Flatten all cell values from the queryResults Map into a Set of normalised numbers.
 * @param {Map<string, {data: object[], columns: object[]}>} queryResults
 * @returns {Set<number>}
 */
function buildResultNumberSet(queryResults) {
    const set = new Set();
    for (const entry of queryResults.values()) {
        const rows = entry.data || [];
        for (const row of rows) {
            for (const val of Object.values(row)) {
                if (val === null || val === undefined) continue;
                const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
                if (!isNaN(n)) set.add(n);
            }
        }
    }
    return set;
}

/**
 * Check whether a normalised number is "close enough" to any value in the set.
 * Allows ±0.5% relative tolerance and ±0.01 absolute tolerance to handle rounding.
 */
function matchesAny(num, set) {
    if (num === 0) return set.has(0);
    for (const candidate of set) {
        const relErr = Math.abs(candidate - num) / Math.abs(num);
        const absErr = Math.abs(candidate - num);
        if (relErr <= 0.005 || absErr <= 0.01) return true;
    }
    return false;
}

/**
 * Main entry point.
 *
 * @param {Array<{point: string, value?: string, source_query_id?: string}>} findings
 * @param {Map<string, object>} queryResults  — in-memory cache from tools.js
 * @returns {{ unverified: string[], caveat: string|null }}
 */
function verifyFindings(findings, queryResults) {
    if (!findings?.length || !queryResults?.size) {
        return { unverified: [], caveat: null };
    }

    const resultNums = buildResultNumberSet(queryResults);
    const unverified = [];

    for (const f of findings) {
        if (!f.value) continue; // no numeric claim — skip

        const nums = extractNumbers(f.value);
        if (nums.length === 0) continue; // purely textual value — skip

        // If the finding has a source_query_id, only check that specific query
        let scopedNums = resultNums;
        if (f.source_query_id && queryResults.has(f.source_query_id)) {
            const entry = queryResults.get(f.source_query_id);
            scopedNums = buildResultNumberSet(new Map([[f.source_query_id, entry]]));
        }

        const allMatch = nums.every(n => matchesAny(n, scopedNums));
        if (!allMatch) {
            unverified.push(f.value);
        }
    }

    if (unverified.length === 0) return { unverified: [], caveat: null };

    const caveat =
        `⚠️ Some cited figures could not be verified against executed query results: ${unverified.join(', ')}. ` +
        `Double-check these numbers before acting on them.`;

    return { unverified, caveat };
}

module.exports = { verifyFindings };
