/**
 * parametros.js — los parámetros de un proceso (5.11, D4; Dec-19 del plan).
 *
 * Un proceso de Data Flow usa `${nombre}` en la configuración de sus pasos. Hasta
 * la 5.10 el valor se pegaba tal cual como texto, en SQL, rutas y nombres. Eso
 * está bien mientras el valor lo escribe el autor del proceso; deja de estarlo
 * cuando llega de fuera —la línea de comandos, un formulario (D5), un lote, una
 * programación (D1)—: un valor como `x'; DROP TABLE ventas; --` no puede acabar
 * dentro del SQL.
 *
 * Un parámetro puede declarar su TIPO (texto, número, fecha, lista, sí/no) en
 * `parametros` del `.sqlchain`; su valor por defecto sigue en `variables`. Al
 * sustituir `${x}`:
 *
 *   - En el SQL de un paso, se mira dónde está:
 *       · fuera de comillas, un parámetro CON tipo pasa a ser `getvariable('x')`
 *         y su valor, con su tipo, se fija con `SET VARIABLE` en la conexión;
 *       · dentro de una cadena ('ventas_${semana}') va como texto con las
 *         comillas dobladas;
 *       · dentro de un identificador ("${tabla}") va con las comillas dobladas;
 *       · fuera de comillas y SIN tipo, un valor del autor se pega como siempre;
 *         uno de fuera, sólo si es un número o una palabra.
 *   - En una ruta o un nombre de archivo, un valor de fuera no puede llevar
 *     separadores de carpeta ni `..`.
 *   - En cualquier otro texto (nombres de columna, etiquetas), un valor de fuera
 *     no puede llevar comillas, punto y coma ni comentarios.
 *
 * Lo de hoy corre igual: un proceso sin tipos y sin valores de fuera da
 * exactamente el mismo texto que antes.
 */

const TIPOS = ['texto', 'numero', 'fecha', 'lista', 'logico'];
const NOMBRE = /^[A-Za-z_]\w{0,62}$/;

class ErrorDeParametro extends Error {
    constructor(mensaje, nombre = null) {
        super(mensaje);
        this.nombre = nombre;
    }
}

// Campos de la configuración de un paso que son SQL (consulta, HAVING, la
// expresión de una columna nueva…). El resto es texto: rutas, nombres, valores
// de un filtro (que el ejecutor ya cita).
const CLAVES_SQL = new Set(['query', 'having', 'expression', 'sql', 'customQuery', 'condition']);
// Campos que son una ruta o un nombre de archivo.
const CLAVES_RUTA = new Set(['outputPath', 'sourcePath', 'folderPath', 'filePath', 'carpeta', 'plantilla', 'archivo', 'logFilePath']);

/** Las definiciones del `.sqlchain`, limpias: [{ nombre, tipo, etiqueta, opciones, ayuda, requerido }]. */
function definiciones(cadena) {
    const out = [];
    const vistos = new Set();
    for (const p of Array.isArray(cadena?.parametros) ? cadena.parametros : []) {
        const nombre = String(p?.nombre || '').trim();
        if (!NOMBRE.test(nombre) || vistos.has(nombre)) continue;
        vistos.add(nombre);
        const tipo = TIPOS.includes(p.tipo) ? p.tipo : 'texto';
        out.push({
            nombre, tipo,
            etiqueta: String(p.etiqueta || '').trim() || null,
            ayuda: String(p.ayuda || '').trim() || null,
            opciones: tipo === 'lista' ? (Array.isArray(p.opciones) ? p.opciones.map(String).filter(Boolean) : []) : undefined,
            requerido: p.requerido !== false,
        });
    }
    return out;
}

/** Hoy, en esta máquina, como AAAA-MM-DD. */
const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Comprueba un valor contra su definición y lo devuelve con su tipo
 * (número, booleano, o texto; una fecha como 'AAAA-MM-DD').
 */
function validar(def, valor) {
    const etiqueta = def.etiqueta || def.nombre;
    const t = valor == null ? '' : String(valor).trim();
    if (t === '') {
        if (def.requerido) throw new ErrorDeParametro(`"${etiqueta}" needs a value.`, def.nombre);
        return null;
    }
    switch (def.tipo) {
        case 'numero': {
            if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) throw new ErrorDeParametro(`"${etiqueta}" is a number; "${t}" is not.`, def.nombre);
            return Number(t);
        }
        case 'fecha': {
            const v = /^(hoy|today)$/i.test(t) ? hoy() : t;
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
            const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
            if (!m || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
                throw new ErrorDeParametro(`"${etiqueta}" is a date written as YYYY-MM-DD (for example 2026-10-05); "${t}" is not.`, def.nombre);
            }
            return v;
        }
        case 'logico': {
            if (/^(true|1|yes|si|sí|y|s)$/i.test(t)) return true;
            if (/^(false|0|no|n)$/i.test(t)) return false;
            throw new ErrorDeParametro(`"${etiqueta}" is yes or no; "${t}" is not.`, def.nombre);
        }
        case 'lista': {
            if (def.opciones?.length && !def.opciones.includes(t)) {
                throw new ErrorDeParametro(`"${etiqueta}" is one of ${def.opciones.join(', ')}; "${t}" is not.`, def.nombre);
            }
            return t;
        }
        default:
            if (t.length > 10000) throw new ErrorDeParametro(`"${etiqueta}" is too long.`, def.nombre);
            return String(valor);
    }
}

/**
 * Resuelve los valores de una ejecución: los del autor (`variables` del proceso),
 * los que da quien lo lanza (`deFuera`), y los comprueba contra sus tipos.
 * @returns { valores: {nombre: valor}, fuera: Set, defs }
 */
function resolver(cadena, deFuera = {}) {
    const defs = definiciones(cadena);
    const porNombre = new Map(defs.map(d => [d.nombre, d]));
    const autor = { ...(cadena?.variables || {}) };
    const fuera = new Set();
    for (const [k, v] of Object.entries(deFuera || {})) {
        if (!NOMBRE.test(k)) throw new ErrorDeParametro(`"${k}" is not a parameter name.`, k);
        if (defs.length && !porNombre.has(k) && !(k in autor)) {
            throw new ErrorDeParametro(`The process has no parameter "${k}". It has: ${[...new Set([...defs.map(d => d.nombre), ...Object.keys(autor)])].join(', ') || 'none'}.`, k);
        }
        fuera.add(k);
    }
    const valores = {};
    for (const [k, v] of Object.entries(autor)) valores[k] = v;
    for (const [k, v] of Object.entries(deFuera || {})) valores[k] = v;
    for (const d of defs) valores[d.nombre] = validar(d, valores[d.nombre]);
    return { valores, fuera, defs };
}

const comoTexto = (v) => (v === true ? 'true' : v === false ? 'false' : String(v ?? ''));

/** El literal SQL de un valor con su tipo (para `SET VARIABLE`). */
function literal(def, valor) {
    if (valor === null || valor === undefined) return 'NULL';
    switch (def.tipo) {
        case 'numero': return Number.isInteger(valor) && Math.abs(valor) <= Number.MAX_SAFE_INTEGER ? `${valor}::BIGINT` : `${valor}::DOUBLE`;
        case 'fecha': return `DATE '${valor}'`;
        case 'logico': return valor ? 'true' : 'false';
        default: return `'${String(valor).replace(/'/g, "''")}'`;
    }
}

/** Las sentencias que dejan los parámetros con tipo en la conexión. */
function sentenciasSet({ valores, defs }) {
    return defs.filter(d => valores[d.nombre] !== undefined).map(d => `SET VARIABLE ${d.nombre} = ${literal(d, valores[d.nombre])}`);
}

// ── Sustituir en SQL, según dónde está cada ${x} ────────────────────────────

const PALABRA = /^[A-Za-z_][\w.]*$/;
const NUMERO = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/**
 * Reescribe los `${x}` de un texto SQL (Dec-19). Recorre el texto sabiendo si
 * está en código, en una cadena '…', en un identificador "…", en un comentario
 * o en una cadena $$…$$.
 */
function reescribirSql(sql, { valores, fuera = new Set(), defs = [] }) {
    if (typeof sql !== 'string' || !sql.includes('${')) return sql;
    const tipos = new Map(defs.map(d => [d.nombre, d]));
    let out = '';
    let modo = 'codigo';      // codigo | cadena | ident | linea | bloque | dolar
    let i = 0;
    const n = sql.length;
    const sustituir = (nombre) => {
        if (!(nombre in valores)) return null;                    // no es nuestro: queda como estaba
        const v = valores[nombre];
        const def = tipos.get(nombre);
        const deFuera = fuera.has(nombre);
        switch (modo) {
            case 'codigo':
                if (def) return `getvariable('${nombre}')`;
                if (!deFuera) return comoTexto(v);                // el autor: como siempre
                if (NUMERO.test(String(v).trim()) || PALABRA.test(String(v).trim())) return String(v).trim();
                throw new ErrorDeParametro(`The value of "${nombre}" goes into the SQL as code, and "${String(v).slice(0, 40)}" is not a number or a single word. Declare the parameter's type in the process settings (text, number, date…), or put it between quotes in the SQL.`, nombre);
            // Un valor del autor sin tipo se pega como siempre, también entre
            // comillas (hay procesos que cuentan con ello); los demás, con las
            // comillas dobladas.
            case 'cadena':
                return !def && !deFuera ? comoTexto(v) : comoTexto(v).replace(/'/g, "''");
            case 'ident':
                return !def && !deFuera ? comoTexto(v) : comoTexto(v).replace(/"/g, '""');
            case 'dolar':
                if (/\$\$/.test(comoTexto(v))) throw new ErrorDeParametro(`The value of "${nombre}" cannot contain $$.`, nombre);
                return comoTexto(v);
            default:                                              // comentarios
                return comoTexto(v).replace(/\*\/|[\r\n]/g, ' ');
        }
    };
    while (i < n) {
        const c = sql[i], c2 = sql[i + 1];
        if (c === '$' && c2 === '{') {
            const fin = sql.indexOf('}', i + 2);
            const nombre = fin > 0 ? sql.slice(i + 2, fin) : '';
            if (fin > 0 && /^\w+$/.test(nombre)) {
                const r = sustituir(nombre);
                out += r === null ? sql.slice(i, fin + 1) : r;
                i = fin + 1;
                continue;
            }
        }
        switch (modo) {
            case 'codigo':
                if (c === "'") modo = 'cadena';
                else if (c === '"') modo = 'ident';
                else if (c === '-' && c2 === '-') modo = 'linea';
                else if (c === '/' && c2 === '*') modo = 'bloque';
                else if (c === '$' && c2 === '$') { out += '$$'; i += 2; modo = 'dolar'; continue; }
                break;
            case 'cadena':
                if (c === "'" && c2 === "'") { out += "''"; i += 2; continue; }
                if (c === "'") modo = 'codigo';
                break;
            case 'ident':
                if (c === '"' && c2 === '"') { out += '""'; i += 2; continue; }
                if (c === '"') modo = 'codigo';
                break;
            case 'linea':
                if (c === '\n') modo = 'codigo';
                break;
            case 'bloque':
                if (c === '*' && c2 === '/') { out += '*/'; i += 2; modo = 'codigo'; continue; }
                break;
            case 'dolar':
                if (c === '$' && c2 === '$') { out += '$$'; i += 2; modo = 'codigo'; continue; }
                break;
        }
        out += c;
        i++;
    }
    return out;
}

/** Sustituye en un texto que no es SQL (una ruta, un nombre). */
function reescribirTexto(texto, { valores, fuera = new Set() }, { ruta = false, campo = '' } = {}) {
    if (typeof texto !== 'string' || !texto.includes('${')) return texto;
    return texto.replace(/\$\{(\w+)\}/g, (m, nombre) => {
        if (!(nombre in valores)) return m;
        const v = comoTexto(valores[nombre]);
        if (fuera.has(nombre)) {
            if (ruta && /[\\/]|\.\.|[<>:"|?*\u0000-\u001f]/.test(v)) {
                throw new ErrorDeParametro(`The value of "${nombre}" goes into a file name (${campo}): it cannot contain folders, "..", or any of < > : " | ? *.`, nombre);
            }
            if (!ruta && /['";]|--|\/\*|[\r\n]/.test(v)) {
                throw new ErrorDeParametro(`The value of "${nombre}" goes into ${campo || 'a setting'}: it cannot contain quotes, semicolons or comments.`, nombre);
            }
        }
        return v;
    });
}

/**
 * Aplica los parámetros a la configuración de un paso: los campos SQL con
 * `reescribirSql`, las rutas y el resto con `reescribirTexto`.
 */
function aplicarAConfig(config, contexto, clave = '') {
    if (typeof config === 'string') {
        if (CLAVES_SQL.has(clave)) return reescribirSql(config, contexto);
        return reescribirTexto(config, contexto, { ruta: CLAVES_RUTA.has(clave), campo: clave });
    }
    if (Array.isArray(config)) return config.map(v => aplicarAConfig(v, contexto, clave));
    if (config && typeof config === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(config)) out[k] = aplicarAConfig(v, contexto, k);
        return out;
    }
    return config;
}

// ── Lotes ───────────────────────────────────────────────────────────────────

/** Un CSV sencillo (con comillas) a filas de objetos: la cabecera son los parámetros. */
function leerCsv(texto) {
    const filas = [];
    let fila = [], campo = '', dentro = false;
    const t = String(texto).replace(/^﻿/, '');
    const sep = (t.split(/\r?\n/)[0].match(/;/g) || []).length > (t.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (dentro) {
            if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
            else if (c === '"') dentro = false;
            else campo += c;
        } else if (c === '"') dentro = true;
        else if (c === sep) { fila.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && t[i + 1] === '\n') i++;
            fila.push(campo); campo = '';
            if (fila.some(x => x !== '')) filas.push(fila);
            fila = [];
        } else campo += c;
    }
    fila.push(campo);
    if (fila.some(x => x !== '')) filas.push(fila);
    if (!filas.length) return [];
    const cab = filas[0].map(x => x.trim());
    return filas.slice(1).map(f => Object.fromEntries(cab.map((k, i) => [k, f[i] ?? ''])));
}

/** Las ejecuciones de un lote, de un archivo .csv o .json. */
function leerLote(ruta) {
    const fs = require('fs');
    const texto = fs.readFileSync(ruta, 'utf8');
    let filas;
    if (/\.json$/i.test(ruta)) {
        const d = JSON.parse(texto);
        filas = Array.isArray(d) ? d : null;
        if (!filas || filas.some(f => !f || typeof f !== 'object' || Array.isArray(f))) throw new ErrorDeParametro('A batch file in JSON is a list of objects: [{ "store": "north" }, …].');
    } else {
        filas = leerCsv(texto);
    }
    if (!filas.length) throw new ErrorDeParametro('The batch file has no rows: the first line names the parameters, and each line below is one run.');
    return filas.map(f => Object.fromEntries(Object.entries(f).map(([k, v]) => [String(k).trim(), v == null ? '' : String(v)])));
}

module.exports = {
    TIPOS, CLAVES_SQL, CLAVES_RUTA, ErrorDeParametro,
    definiciones, validar, resolver, literal, sentenciasSet,
    reescribirSql, reescribirTexto, aplicarAConfig, leerCsv, leerLote,
};
