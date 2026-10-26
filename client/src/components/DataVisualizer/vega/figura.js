/**
 * El archivo `.amoxvis`: un Vega-Lite válido con lo de AmoxSQL en `usermeta` (Dec-69).
 *
 * Dentro de la aplicación una figura sigue siendo el objeto plano de siempre —las
 * claves de Story Flow más `query` y `source`—, porque una veintena de sitios lo
 * leen así. La conversión vive SOLO en la frontera con el disco:
 *
 *   leerAmoxvis(lo que hay en el archivo)  → objeto plano
 *   escribirAmoxvis(objeto plano)          → lo que se escribe
 *
 * Campos del objeto plano que no son de los paneles:
 *   query, source  la consulta y el .sql de donde salió
 *   modo           'interfaz' (manda lo de los paneles) | 'codigo' (manda `spec`), Dec-76
 *   spec           el spec. En modo código es el que escribió el usuario; en modo
 *                  interfaz es el que generó Story Flow al dibujar (con los datos a
 *                  la vista), y se guarda tal cual para quien abra el archivo fuera.
 *
 * Al leer un archivo en modo interfaz el spec se descarta: Story Flow lo vuelve a
 * generar desde `usermeta.amoxsql.interfaz`, que es la fuente.
 */
import { DEFAULT_CONFIG, COLOR_PALETTES } from '../constants';
import { deStoryFlow, ESQUEMA_VL } from './deStoryFlow';

export const VERSION_AMOXVIS = 2;
const PROPIAS = ['query', 'source', 'modo', 'spec'];

/** ¿Es un spec de Vega o Vega-Lite (y no la configuración plana de antes)? */
export function esSpecVega(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (typeof o.$schema === 'string' && /vega/i.test(o.$schema)) return true;
    return !!(o.usermeta?.amoxsql || o.mark || o.layer || o.marks || o.hconcat || o.vconcat || o.concat || o.facet || o.repeat);
}

/** ¿Es un spec de Vega (no Vega-Lite)? El treemap lo es. */
export const esVegaCompleto = (spec) => typeof spec?.$schema === 'string' && /\/vega\/v/i.test(spec.$schema);

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Una huella corta del spec (FNV-1a): dice si el archivo se editó fuera de AmoxSQL. */
function huellaDe(spec) {
    const t = JSON.stringify(spec);
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
}

/** Solo lo que difiere de fábrica: el archivo dice lo que se eligió, no las 78 claves. */
function soloCambios(plano) {
    const r = {};
    for (const [k, v] of Object.entries(plano)) {
        if (PROPIAS.includes(k) || v === undefined) continue;
        if (k in DEFAULT_CONFIG && igual(DEFAULT_CONFIG[k], v)) continue;
        r[k] = v;
    }
    return r;
}

/** Lo que el editor de código muestra y recibe: el spec sin lo que gestiona AmoxSQL. */
export function specParaEditar(spec) {
    if (!spec || typeof spec !== 'object') return spec;
    const { usermeta, title, ...resto } = spec;
    const otros = usermeta ? Object.fromEntries(Object.entries(usermeta).filter(([k]) => k !== 'amoxsql')) : null;
    return otros && Object.keys(otros).length ? { ...resto, usermeta: otros } : resto;
}

/**
 * Archivo (texto u objeto) → objeto plano. Acepta también el formato anterior
 * (la configuración plana con `query`), que se devuelve como está.
 */
export function leerAmoxvis(entrada) {
    let o = entrada;
    if (typeof o === 'string') {
        try { o = JSON.parse(o); } catch { return {}; }
    }
    if (!o || typeof o !== 'object') return {};
    if (!esSpecVega(o)) return o;

    const am = o.usermeta?.amoxsql || {};
    const interfaz = am.interfaz && typeof am.interfaz === 'object' ? am.interfaz : null;
    const modo = am.modo === 'codigo' || !interfaz ? 'codigo' : 'interfaz';
    const plano = { ...DEFAULT_CONFIG, ...(interfaz || {}), query: am.consulta || '', modo };
    if (am.origen) plano.source = am.origen;
    if (modo === 'codigo') plano.spec = specParaEditar(o);
    // Editado fuera (en un editor de texto, otra herramienta): el código manda.
    // Story Flow lo vuelve a asimilar sobre sus paneles al abrirlo (Dec-77).
    if (interfaz && am.huella) {
        const { usermeta, ...puro } = o;
        if (huellaDe(puro) !== am.huella) { plano.modo = 'codigo'; plano.spec = specParaEditar(o); }
    }
    // Un spec que llega de fuera trae su título en `title`; la tarjeta lo dibuja.
    if (!plano.chartTitle && o.title) {
        const t = typeof o.title === 'string' ? { text: o.title } : o.title;
        plano.chartTitle = Array.isArray(t.text) ? t.text.join(' ') : (t.text || '');
        if (t.subtitle && !plano.chartSubtitle) plano.chartSubtitle = Array.isArray(t.subtitle) ? t.subtitle.join(' ') : t.subtitle;
    }
    return plano;
}

/** La paleta que usaría la figura, para escribir un spec sin tener la vista delante. */
export function coloresDe(plano) {
    if (plano.colorTheme === 'brand' && Array.isArray(plano.brandColors) && plano.brandColors.length) return plano.brandColors;
    return COLOR_PALETTES[plano.colorTheme] || COLOR_PALETTES.default;
}

/**
 * Objeto plano → archivo. El orden de las claves es fijo ($schema, title, el
 * spec, usermeta al final) para que un cambio pequeño sea un diff pequeño.
 */
export function escribirAmoxvis(plano = {}, { filas } = {}) {
    const modo = plano.modo === 'codigo' ? 'codigo' : 'interfaz';
    let spec = plano.spec && typeof plano.spec === 'object' ? plano.spec : null;
    if (!spec || (modo === 'interfaz' && filas)) {
        spec = deStoryFlow(plano, { filas: filas || [], colores: coloresDe(plano) });
    }
    const { $schema, title, usermeta, ...cuerpo } = spec;
    const archivo = { $schema: $schema || ESQUEMA_VL };
    if (plano.chartTitle || plano.chartSubtitle) {
        archivo.title = { text: plano.chartTitle || '', ...(plano.chartSubtitle ? { subtitle: plano.chartSubtitle } : {}) };
    }
    Object.assign(archivo, cuerpo);
    const otros = usermeta ? Object.fromEntries(Object.entries(usermeta).filter(([k]) => k !== 'amoxsql')) : {};
    const huella = huellaDe(archivo);
    archivo.usermeta = {
        ...otros,
        amoxsql: {
            version: VERSION_AMOXVIS,
            modo,
            huella,
            consulta: plano.query || '',
            ...(plano.source ? { origen: plano.source } : {}),
            interfaz: soloCambios(plano),
        },
    };
    return archivo;
}

/** Atajo para quien escribe texto: el contenido del archivo, con sangría. */
export const textoAmoxvis = (plano, op) => JSON.stringify(escribirAmoxvis(plano, op), null, 2);
