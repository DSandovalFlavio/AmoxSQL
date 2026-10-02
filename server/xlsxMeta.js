/**
 * xlsxMeta.js — Excel metadata (sheet names) read straight from the ZIP.
 *
 * An xlsx is a ZIP. The tab order + sheet names live in `xl/workbook.xml`, a
 * tiny entry (a few KB). We read only the ZIP central directory, locate that one
 * entry, inflate just it, and regex the sheet names: 2–12 ms, where a full
 * workbook parse inflates every entry (0.5–1.5 GB of XML for an 80 MB file,
 * synchronously, freezing the server). See docs/dev/auditoria_metadata_archivos.md.
 *
 * Since 5.10 there is no fallback: the third-party parser that used to back
 * this up was removed (Dec-11 of docs/dev/plan_5_10_datos_donde_estan.md). Big
 * archives (ZIP64) are read here too; anything else that is not a workbook is
 * recognized by its signature in `server/excel.js` and gets a clear error.
 */
const fs = require('fs');
const zlib = require('zlib');

const EOCD_SIG = Buffer.from([0x50, 0x4b, 0x05, 0x06]); // End Of Central Directory
const EOCD64_LOC_SIG = 0x07064b50;  // ZIP64 End Of Central Directory Locator
const EOCD64_SIG = 0x06064b50;      // ZIP64 End Of Central Directory Record
const CDFH_SIG = 0x02014b50;        // Central Directory File Header
const LFH_SIG = 0x04034b50;         // Local File Header
const MAX_EOCD_SCAN = 66000;        // EOCD is within last 22 bytes + up to 64KB comment
const MAX32 = 0xffffffff;

/**
 * Decode the handful of XML entities that can appear in a sheet name attribute.
 */
function decodeXmlEntities(s) {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

const leer = (fd, largo, posicion) => {
    const b = Buffer.alloc(largo);
    fs.readSync(fd, b, 0, largo, posicion);
    return b;
};

/** Where the central directory is, also for ZIP64 archives. */
function directorioCentral(fd, size) {
    const tailLen = Math.min(MAX_EOCD_SCAN, size);
    const tail = leer(fd, tailLen, size - tailLen);
    const eocd = tail.lastIndexOf(EOCD_SIG);
    if (eocd < 0) throw new Error('EOCD signature not found');
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === MAX32 || cdSize === MAX32) {
        // ZIP64: the locator sits right before the EOCD and points at the record.
        const loc = eocd - 20;
        if (loc < 0 || tail.readUInt32LE(loc) !== EOCD64_LOC_SIG) throw new Error('ZIP64 locator not found');
        const recOffset = Number(tail.readBigUInt64LE(loc + 8));
        const rec = leer(fd, 56, recOffset);
        if (rec.readUInt32LE(0) !== EOCD64_SIG) throw new Error('bad ZIP64 end of central directory');
        cdSize = Number(rec.readBigUInt64LE(40));
        cdOffset = Number(rec.readBigUInt64LE(48));
    }
    return { cdSize, cdOffset };
}

/** The ZIP64 extra field (0x0001) holds the 64-bit values that are MAX32 in the header. */
function valores64(extra, { compSize, uncompSize, localHeaderOffset }) {
    let p = 0;
    while (p + 4 <= extra.length) {
        const id = extra.readUInt16LE(p);
        const len = extra.readUInt16LE(p + 2);
        if (id === 0x0001) {
            let q = p + 4;
            const r = { compSize, localHeaderOffset };
            if (uncompSize === MAX32) q += 8;
            if (compSize === MAX32) { r.compSize = Number(extra.readBigUInt64LE(q)); q += 8; }
            if (localHeaderOffset === MAX32) r.localHeaderOffset = Number(extra.readBigUInt64LE(q));
            return r;
        }
        p += 4 + len;
    }
    return { compSize, localHeaderOffset };
}

/**
 * Read xl/workbook.xml from an xlsx by walking the ZIP central directory,
 * inflating only that one entry. Returns the decompressed XML string, or throws.
 */
function readWorkbookXml(filePath) {
    const fd = fs.openSync(filePath, 'r');
    try {
        const size = fs.fstatSync(fd).size;
        if (size < 22) throw new Error('file too small to be a zip');

        // 1) Find the central directory (EOCD, or ZIP64 record).
        const { cdSize, cdOffset } = directorioCentral(fd, size);

        // 2) Read the central directory and find xl/workbook.xml.
        const cd = leer(fd, cdSize, cdOffset);
        let p = 0;
        let entry = null;
        while (p + 46 <= cd.length && cd.readUInt32LE(p) === CDFH_SIG) {
            const compMethod = cd.readUInt16LE(p + 10);
            const compSize = cd.readUInt32LE(p + 20);
            const uncompSize = cd.readUInt32LE(p + 24);
            const nameLen = cd.readUInt16LE(p + 28);
            const extraLen = cd.readUInt16LE(p + 30);
            const commentLen = cd.readUInt16LE(p + 32);
            const localHeaderOffset = cd.readUInt32LE(p + 42);
            const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
            if (name === 'xl/workbook.xml') {
                const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
                entry = { compMethod, ...valores64(extra, { compSize, uncompSize, localHeaderOffset }) };
                break;
            }
            p += 46 + nameLen + extraLen + commentLen;
        }
        if (!entry) throw new Error('xl/workbook.xml not found in central directory');

        // 3) Read the local file header to compute where the entry's data starts
        //    (the local header repeats name/extra lengths, which can differ).
        const lh = leer(fd, 30, entry.localHeaderOffset);
        if (lh.readUInt32LE(0) !== LFH_SIG) throw new Error('bad local file header');
        const dataStart = entry.localHeaderOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);

        const comp = leer(fd, entry.compSize, dataStart);
        if (entry.compMethod === 0) return comp.toString('utf8');       // stored
        if (entry.compMethod === 8) return zlib.inflateRawSync(comp).toString('utf8'); // deflate
        throw new Error(`unsupported compression method ${entry.compMethod}`);
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Extract sheet names (in tab order) from workbook.xml.
 */
function parseSheetNames(xml) {
    // <sheet name="Ventas" sheetId="1" r:id="rId1"/>  (attribute order varies)
    const names = [];
    const re = /<(?:\w+:)?sheet\b[^>]*\bname="([^"]*)"/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        names.push(decodeXmlEntities(m[1]));
    }
    return names;
}

/** Sheet names in tab order: { sheets: string[], via: 'zip' }. Throws if unreadable. */
function getSheetNames(filePath) {
    const sheets = parseSheetNames(readWorkbookXml(filePath));
    if (!sheets.length) throw new Error('no <sheet> elements found');
    return { sheets, via: 'zip' };
}

/* ------------------------------------------------------------------ */
/* mtime-keyed cache (pattern mirrors ai/skills.js)                    */
/* ------------------------------------------------------------------ */
const CACHE_MAX = 50;
const _cache = new Map(); // fullPath -> { mtimeMs, size, payload }

/**
 * Get cached metadata for a file if it's still fresh (same mtime + size).
 */
function getCached(fullPath) {
    const hit = _cache.get(fullPath);
    if (!hit) return null;
    let stat;
    try { stat = fs.statSync(fullPath); } catch { _cache.delete(fullPath); return null; }
    if (hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
        // refresh LRU recency
        _cache.delete(fullPath);
        _cache.set(fullPath, hit);
        return hit.payload;
    }
    _cache.delete(fullPath);
    return null;
}

/**
 * Store metadata for a file, keyed by its current mtime + size.
 */
function setCached(fullPath, payload) {
    let stat;
    try { stat = fs.statSync(fullPath); } catch { return; }
    if (_cache.has(fullPath)) _cache.delete(fullPath);
    _cache.set(fullPath, { mtimeMs: stat.mtimeMs, size: stat.size, payload });
    // Evict oldest (LRU: Map preserves insertion/refresh order).
    while (_cache.size > CACHE_MAX) {
        const oldest = _cache.keys().next().value;
        _cache.delete(oldest);
    }
}

function invalidate(fullPath) {
    if (fullPath) _cache.delete(fullPath);
    else _cache.clear();
}

module.exports = { getSheetNames, readWorkbookXml, parseSheetNames, getCached, setCached, invalidate };
