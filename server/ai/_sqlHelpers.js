/**
 * AmoxSQL — SQL literal helpers for DuckDB systemQuery interpolation.
 *
 * DuckDB Neo API's systemQuery() doesn't accept bind parameters, so we
 * interpolate values directly into SQL strings. These helpers centralise
 * all escaping so no call site can accidentally forget it.
 *
 * Usage:
 *   const { s, j, n } = require('./_sqlHelpers');
 *   await db.systemQuery(`INSERT INTO t (a, b) VALUES (${s(userStr)}, ${n(count)})`);
 */

/**
 * Safe SQL string literal.
 * Doubles any single-quotes inside val and wraps the result in quotes.
 * Returns the SQL keyword NULL for null / undefined / empty-after-trim.
 *
 * @param {*}       val
 * @param {boolean} [allowEmpty=true]  – when false, an empty string also becomes NULL
 * @returns {string}  e.g. `'O''Brien'`  or  `NULL`
 */
function s(val, { allowEmpty = true } = {}) {
    if (val === null || val === undefined) return 'NULL';
    const str = String(val);
    if (!allowEmpty && str.trim() === '') return 'NULL';
    return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Safe SQL JSON literal.
 * JSON.stringify(val), then delegates to s().
 * Returns NULL for null / undefined.
 *
 * @param {*} val
 * @returns {string}
 */
function j(val) {
    if (val === null || val === undefined) return 'NULL';
    return s(JSON.stringify(val));
}

/**
 * Safe SQL numeric literal.
 * Returns NULL for null / undefined / NaN.
 *
 * @param {*} val
 * @returns {string}  e.g. `42`  or  `NULL`
 */
function n(val) {
    if (val === null || val === undefined) return 'NULL';
    const num = Number(val);
    return isNaN(num) ? 'NULL' : String(num);
}

module.exports = { s, j, n };
