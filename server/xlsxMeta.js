/**
 * xlsxMeta.js — Fast Excel metadata (sheet names) without a full SheetJS parse.
 *
 * WHY: `xlsx.read(buffer, {bookSheets:true})` (SheetJS) inflates EVERY entry of
 * the xlsx ZIP archive even when we only want sheet names — for an 80 MB file
 * that is ~0.5–1.5 GB of XML decompressed synchronously on the Express event
 * loop (freezing the whole server). See docs/dev/auditoria_metadata_archivos.md.
 *
 * An xlsx is a ZIP. The tab order + sheet names live in `xl/workbook.xml`, a
 * tiny entry (a few KB). We read only the ZIP central directory, locate that one
 * entry, inflate just it, and regex the sheet names — measured at 2–12 ms vs
 * 1.2–3 s for SheetJS on the same files.
 *
 * Falls back to SheetJS if the archive is exotic (ZIP64, unexpected layout).
 */
const fs = require('fs');
const zlib = require('zlib');

const EOCD_SIG = Buffer.from([0x50, 0x4b, 0x05, 0x06]); // End Of Central Directory
const CDFH_SIG = 0x02014b50;      // Central Directory File Header
const LFH_SIG = 0x04034b50;       // Local File Header
const MAX_EOCD_SCAN = 66000;      // EOCD is within last 22 bytes + up to 64KB comment

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

/**
 * Read xl/workbook.xml from an xlsx by walking the ZIP central directory,
 * inflating only that one entry. Returns the decompressed XML string, or throws.
 */
function readWorkbookXml(filePath) {
    const fd = fs.openSync(filePath, 'r');
    try {
        const size = fs.fstatSync(fd).size;
        if (size < 22) throw new Error('file too small to be a zip');

        // 1) Find EOCD by scanning the tail.
        const tailLen = Math.min(MAX_EOCD_SCAN, size);
        const tail = Buffer.alloc(tailLen);
        fs.readSync(fd, tail, 0, tailLen, size - tailLen);
        const eocd = tail.lastIndexOf(EOCD_SIG);
        if (eocd < 0) throw new Error('EOCD signature not found');

        const cdSize = tail.readUInt32LE(eocd + 12);
        const cdOffset = tail.readUInt32LE(eocd + 16);
        // ZIP64 sentinel values → bail to fallback.
        if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
            throw new Error('ZIP64 archive — unsupported by fast path');
        }

        // 2) Read the central directory and find xl/workbook.xml.
        const cd = Buffer.alloc(cdSize);
        fs.readSync(fd, cd, 0, cdSize, cdOffset);

        let p = 0;
        let entry = null;
        while (p + 46 <= cd.length && cd.readUInt32LE(p) === CDFH_SIG) {
            const compMethod = cd.readUInt16LE(p + 10);
            const compSize = cd.readUInt32LE(p + 20);
            const nameLen = cd.readUInt16LE(p + 28);
            const extraLen = cd.readUInt16LE(p + 30);
            const commentLen = cd.readUInt16LE(p + 32);
            const localHeaderOffset = cd.readUInt32LE(p + 42);
            const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
            if (name === 'xl/workbook.xml') {
                entry = { compMethod, compSize, localHeaderOffset };
                break;
            }
            p += 46 + nameLen + extraLen + commentLen;
        }
        if (!entry) throw new Error('xl/workbook.xml not found in central directory');

        // 3) Read the local file header to compute where the entry's data starts
        //    (the local header repeats name/extra lengths, which can differ).
        const lh = Buffer.alloc(30);
        fs.readSync(fd, lh, 0, 30, entry.localHeaderOffset);
        if (lh.readUInt32LE(0) !== LFH_SIG) throw new Error('bad local file header');
        const dataStart = entry.localHeaderOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);

        const comp = Buffer.alloc(entry.compSize);
        fs.readSync(fd, comp, 0, entry.compSize, dataStart);

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

/**
 * Fast sheet-name listing. Returns { sheets: string[], via: 'zip'|'sheetjs' }.
 * Falls back to SheetJS (whole-file parse) only if the fast path throws.
 */
function getSheetNames(filePath) {
    try {
        const xml = readWorkbookXml(filePath);
        const sheets = parseSheetNames(xml);
        if (sheets.length > 0) return { sheets, via: 'zip' };
        throw new Error('no <sheet> elements found');
    } catch (err) {
        console.warn(`[xlsxMeta] fast sheet read failed for ${filePath} (${err.message}) — falling back to SheetJS`);
        const xlsx = require('xlsx');
        const wb = xlsx.read(fs.readFileSync(filePath), { type: 'buffer', bookSheets: true });
        return { sheets: wb.SheetNames || [], via: 'sheetjs' };
    }
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
