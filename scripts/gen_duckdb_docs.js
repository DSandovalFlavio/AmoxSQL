#!/usr/bin/env node
/**
 * Downloads a full snapshot of the DuckDB SQL docs (duckdb/duckdb-web,
 * docs/current/sql/**) into server/ai/data/duckdb-docs so it ships with the app
 * for 100% offline lookup. Re-run to refresh the bundled base.
 *
 *   node scripts/gen_duckdb_docs.js
 */
'use strict';

const path = require('path');
const { downloadDocs } = require('../server/ai/duckdbDocs');

const target = path.join(__dirname, '..', 'server', 'ai', 'data', 'duckdb-docs');

(async () => {
    console.log(`[gen-duckdb-docs] → ${target}`);
    const manifest = await downloadDocs(target, msg => console.log('[gen-duckdb-docs]', msg));
    console.log(`[gen-duckdb-docs] extractedAt=${manifest.extractedAt} count=${manifest.count}`);
})().catch(err => {
    console.error('[gen-duckdb-docs] FAILED:', err.message);
    process.exit(1);
});
