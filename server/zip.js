/**
 * zip.js — leer y escribir ZIP sin librerías (5.11, D3; Dec-20 del plan).
 *
 * Un libro de Excel es un ZIP de XML. Para LEER ya existía el lector del
 * directorio central (`xlsxMeta.js`, 5.10); aquí se completa para recorrer
 * todas las entradas y copiarlas tal cual, que es lo que necesita rellenar la
 * plantilla de un cliente sin tocar lo que no es nuestro. Para ESCRIBIR:
 *
 *   - `agregar(nombre, datos)`        — una entrada pequeña, comprimida de una vez.
 *   - `agregarFlujo(nombre, partes)`  — una entrada grande (una hoja con un millón
 *                                       de filas) comprimida a medida que llega,
 *                                       con descriptor de datos al final (bit 3):
 *                                       nunca está entera en memoria.
 *   - `copiar(zipLeido, entrada)`     — los bytes ya comprimidos de otro ZIP, sin
 *                                       descomprimir ni recomprimir.
 *
 * Sin ZIP64 al escribir: un libro de más de 4 GB no lo abre nadie, y se dice.
 */
const fs = require('fs');
const zlib = require('zlib');
const { once } = require('events');
const { directorioCentral } = require('./xlsxMeta');

const CDFH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const EOCD_SIG = 0x06054b50;
const DESCRIPTOR_SIG = 0x08074b50;
const MAX32 = 0xffffffff;
const UTF8 = 0x0800;          // los nombres van en UTF-8
const CON_DESCRIPTOR = 0x0008;

// ── CRC-32 (la del ZIP), con tabla ──────────────────────────────────────────
const TABLA = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf, previo = 0) {
    let c = (previo ^ MAX32) >>> 0;
    for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ MAX32) >>> 0;
}

/** Fecha y hora en formato MS-DOS (las del ZIP). */
function fechaDos(d = new Date()) {
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const fecha = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { hora, fecha };
}

// ── Leer ────────────────────────────────────────────────────────────────────

/**
 * Abre un ZIP y lista sus entradas, en el orden del directorio central.
 * @returns {{ entradas: object[], leer(nombre): Buffer|null, crudo(entrada): Buffer, cerrar() }}
 */
function abrir(ruta) {
    const fd = fs.openSync(ruta, 'r');
    const leerBytes = (largo, pos) => {
        const b = Buffer.alloc(largo);
        if (largo) fs.readSync(fd, b, 0, largo, pos);
        return b;
    };
    try {
        const size = fs.fstatSync(fd).size;
        if (size < 22) throw new Error('The file is too small to be a workbook.');
        const { cdSize, cdOffset } = directorioCentral(fd, size);
        const cd = leerBytes(cdSize, cdOffset);
        const entradas = [];
        let p = 0;
        while (p + 46 <= cd.length && cd.readUInt32LE(p) === CDFH_SIG) {
            const nameLen = cd.readUInt16LE(p + 28);
            const extraLen = cd.readUInt16LE(p + 30);
            const commentLen = cd.readUInt16LE(p + 32);
            const e = {
                nombre: cd.toString('utf8', p + 46, p + 46 + nameLen),
                metodo: cd.readUInt16LE(p + 10),
                crc: cd.readUInt32LE(p + 16),
                comprimido: cd.readUInt32LE(p + 20),
                original: cd.readUInt32LE(p + 24),
                cabecera: cd.readUInt32LE(p + 42),
            };
            if (e.comprimido === MAX32 || e.original === MAX32 || e.cabecera === MAX32) {
                // ZIP64: los valores de 64 bits van en el campo extra 0x0001, en este orden.
                const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
                let q = 0;
                while (q + 4 <= extra.length) {
                    const id = extra.readUInt16LE(q), len = extra.readUInt16LE(q + 2);
                    if (id === 0x0001) {
                        let r = q + 4;
                        if (e.original === MAX32) { e.original = Number(extra.readBigUInt64LE(r)); r += 8; }
                        if (e.comprimido === MAX32) { e.comprimido = Number(extra.readBigUInt64LE(r)); r += 8; }
                        if (e.cabecera === MAX32) e.cabecera = Number(extra.readBigUInt64LE(r));
                        break;
                    }
                    q += 4 + len;
                }
            }
            entradas.push(e);
            p += 46 + nameLen + extraLen + commentLen;
        }
        const porNombre = new Map(entradas.map(e => [e.nombre, e]));
        const inicioDeDatos = (e) => {
            const lh = leerBytes(30, e.cabecera);
            if (lh.readUInt32LE(0) !== LFH_SIG) throw new Error(`Damaged workbook: bad header for ${e.nombre}`);
            return e.cabecera + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
        };
        const crudo = (e) => leerBytes(e.comprimido, inicioDeDatos(e));
        return {
            entradas,
            tiene: (nombre) => porNombre.has(nombre),
            crudo,
            leer(nombre) {
                const e = porNombre.get(nombre);
                if (!e) return null;
                const c = crudo(e);
                if (e.metodo === 0) return c;
                if (e.metodo === 8) return zlib.inflateRawSync(c);
                throw new Error(`Unsupported compression in ${nombre} (method ${e.metodo})`);
            },
            cerrar() { try { fs.closeSync(fd); } catch { /* ya cerrado */ } },
        };
    } catch (e) {
        fs.closeSync(fd);
        throw e;
    }
}

// ── Escribir ────────────────────────────────────────────────────────────────

class EscritorZip {
    constructor(ruta) {
        this.fd = fs.openSync(ruta, 'w');
        this.pos = 0;
        this.centrales = [];
        this.cuando = fechaDos();
    }

    _escribir(buf) {
        fs.writeSync(this.fd, buf);
        this.pos += buf.length;
        if (this.pos > MAX32) throw new Error('The workbook is larger than 4 GB: Excel cannot open it. Write fewer rows.');
    }

    _cabeceraLocal(nombreBuf, { metodo, crc, comprimido, original, banderas }) {
        const h = Buffer.alloc(30);
        h.writeUInt32LE(LFH_SIG, 0);
        h.writeUInt16LE(20, 4);                 // versión necesaria: 2.0
        h.writeUInt16LE(banderas, 6);
        h.writeUInt16LE(metodo, 8);
        h.writeUInt16LE(this.cuando.hora, 10);
        h.writeUInt16LE(this.cuando.fecha, 12);
        h.writeUInt32LE(crc, 14);
        h.writeUInt32LE(comprimido, 18);
        h.writeUInt32LE(original, 22);
        h.writeUInt16LE(nombreBuf.length, 26);
        h.writeUInt16LE(0, 28);
        this._escribir(h);
        this._escribir(nombreBuf);
    }

    /** Una entrada que cabe en memoria: se comprime de una vez. */
    agregar(nombre, datos) {
        const original = Buffer.isBuffer(datos) ? datos : Buffer.from(String(datos), 'utf8');
        const comprimido = zlib.deflateRawSync(original, { level: 6 });
        this.copiarBytes(nombre, { metodo: 8, crc: crc32(original), original: original.length }, comprimido);
    }

    /** Bytes ya comprimidos (de otro ZIP): se copian tal cual. */
    copiarBytes(nombre, { metodo, crc, original }, comprimido) {
        const nombreBuf = Buffer.from(nombre, 'utf8');
        const cabecera = this.pos;
        const d = { metodo, crc, comprimido: comprimido.length, original, banderas: UTF8 };
        this._cabeceraLocal(nombreBuf, d);
        this._escribir(comprimido);
        this.centrales.push({ nombreBuf, cabecera, ...d });
    }

    /** Copia una entrada de un ZIP abierto con `abrir()`, sin recomprimir. */
    copiar(zipLeido, entrada, nombre = entrada.nombre) {
        this.copiarBytes(nombre, entrada, zipLeido.crudo(entrada));
    }

    /**
     * Una entrada grande, a trozos: `partes` es un iterable (o async) de textos.
     * Se comprime en flujo y el CRC y los tamaños van en el descriptor del final.
     */
    async agregarFlujo(nombre, partes) {
        const nombreBuf = Buffer.from(nombre, 'utf8');
        const cabecera = this.pos;
        const banderas = UTF8 | CON_DESCRIPTOR;
        this._cabeceraLocal(nombreBuf, { metodo: 8, crc: 0, comprimido: 0, original: 0, banderas });
        const inicio = this.pos;
        let crc = 0, original = 0;
        const deflate = zlib.createDeflateRaw({ level: 6 });
        let fallo = null;
        deflate.on('data', (c) => { try { this._escribir(c); } catch (e) { fallo = e; deflate.destroy(e); } });
        const fin = once(deflate, 'end');
        for await (const parte of partes) {
            if (fallo) throw fallo;
            const b = Buffer.from(parte, 'utf8');
            crc = crc32(b, crc);
            original += b.length;
            if (!deflate.write(b)) await once(deflate, 'drain');
        }
        deflate.end();
        await fin;
        if (fallo) throw fallo;
        if (original > MAX32) throw new Error('A sheet is larger than 4 GB: Excel cannot open it. Write fewer rows.');
        const comprimido = this.pos - inicio;
        const desc = Buffer.alloc(16);
        desc.writeUInt32LE(DESCRIPTOR_SIG, 0);
        desc.writeUInt32LE(crc, 4);
        desc.writeUInt32LE(comprimido, 8);
        desc.writeUInt32LE(original, 12);
        this._escribir(desc);
        this.centrales.push({ nombreBuf, cabecera, metodo: 8, crc, comprimido, original, banderas });
    }

    /** El directorio central y el final. Cierra el archivo. */
    cerrar() {
        const inicio = this.pos;
        for (const e of this.centrales) {
            const h = Buffer.alloc(46);
            h.writeUInt32LE(CDFH_SIG, 0);
            h.writeUInt16LE(20, 4);             // hecho por: 2.0
            h.writeUInt16LE(20, 6);             // necesaria: 2.0
            h.writeUInt16LE(e.banderas, 8);
            h.writeUInt16LE(e.metodo, 10);
            h.writeUInt16LE(this.cuando.hora, 12);
            h.writeUInt16LE(this.cuando.fecha, 14);
            h.writeUInt32LE(e.crc, 16);
            h.writeUInt32LE(e.comprimido, 20);
            h.writeUInt32LE(e.original, 24);
            h.writeUInt16LE(e.nombreBuf.length, 28);
            h.writeUInt32LE(e.cabecera, 42);
            this._escribir(h);
            this._escribir(e.nombreBuf);
        }
        const fin = Buffer.alloc(22);
        fin.writeUInt32LE(EOCD_SIG, 0);
        fin.writeUInt16LE(this.centrales.length, 8);
        fin.writeUInt16LE(this.centrales.length, 10);
        fin.writeUInt32LE(this.pos - inicio, 12);
        fin.writeUInt32LE(inicio, 16);
        this._escribir(fin);
        fs.closeSync(this.fd);
        this.fd = null;
    }

    /** Si algo falló a mitad: cierra sin escribir el final (el archivo se borra fuera). */
    abandonar() {
        if (this.fd != null) { try { fs.closeSync(this.fd); } catch { /* ya cerrado */ } this.fd = null; }
    }
}

module.exports = { abrir, EscritorZip, crc32 };
