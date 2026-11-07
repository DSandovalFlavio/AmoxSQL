/**
 * Errores de los proveedores de IA, leídos para una persona (plan UX de Deep Dive, F9).
 *
 * El caso que lo motivó: Gemini en la capa gratuita (5 solicitudes por minuto)
 * contestó a mitad de un análisis «Please retry in 31.29s». El SDK reintenta dos
 * veces con 2 y 4 s de espera y se rinde, porque la espera viene en el CUERPO del
 * error y no en una cabecera `retry-after`. Aquí se reconoce el límite, se saca
 * cuánto hay que esperar y si es una cuota diaria (que no tiene sentido esperar).
 *
 * Puro: recibe el error tal como llega (Error, RetryError con `errors`, APICallError
 * con `statusCode`, `responseBody`, `responseHeaders`) y no toca nada.
 */

/** Todos los textos y datos que trae un error, incluidos los intentos que envuelve. */
function partes(err) {
    const out = [];
    const ver = (e, prof = 0) => {
        if (!e || prof > 3) return;
        if (typeof e === 'string') { out.push({ texto: e }); return; }
        out.push({
            texto: [e.message, e.responseBody, typeof e.data === 'object' ? JSON.stringify(e.data) : ''].filter(Boolean).join(' '),
            status: e.statusCode ?? e.status ?? null,
            cabeceras: e.responseHeaders || null,
        });
        if (Array.isArray(e.errors)) for (const x of e.errors) ver(x, prof + 1);
        if (e.lastError) ver(e.lastError, prof + 1);
        if (e.cause) ver(e.cause, prof + 1);
    };
    ver(err);
    return out;
}

const ES_LIMITE = /(\b429\b|rate.?limit|too many requests|resource[_ ]exhausted|quota|exceeded your current|overloaded|capacity)/i;
const ES_DIARIA = /(per.?day|perday|daily|requests? per day|_per_day|tokens per day|billing|insufficient_quota|credit balance)/i;

function segundosDe(texto) {
    const t = String(texto || '');
    let m = /retry (?:in|after)\s+([\d.]+)\s*(ms|s|sec|seconds?)?/i.exec(t);
    if (m) return m[2] === 'ms' ? Number(m[1]) / 1000 : Number(m[1]);
    m = /"retryDelay"\s*:\s*"([\d.]+)s"/i.exec(t);
    if (m) return Number(m[1]);
    m = /try again in\s+([\d.]+)\s*(ms|s)/i.exec(t);
    if (m) return m[2] === 'ms' ? Number(m[1]) / 1000 : Number(m[1]);
    return null;
}

function segundosDeCabeceras(c) {
    if (!c) return null;
    const v = (k) => c[k] ?? c[k.toLowerCase()];
    const ms = Number(v('retry-after-ms'));
    if (Number.isFinite(ms) && ms > 0) return ms / 1000;
    const s = v('retry-after');
    if (s != null) {
        const n = Number(s);
        if (Number.isFinite(n)) return n;
        const fecha = Date.parse(s);
        if (Number.isFinite(fecha)) return Math.max(0, (fecha - Date.now()) / 1000);
    }
    return null;
}

/**
 * @returns {{ esLimite: boolean, diaria: boolean, segundos: number|null, detalle: string }}
 */
function leerLimite(err) {
    const ps = partes(err);
    const texto = ps.map(p => p.texto).join(' \n ');
    const esLimite = ps.some(p => p.status === 429 || p.status === 529) || ES_LIMITE.test(texto);
    let segundos = null;
    for (const p of ps) {
        segundos = segundosDeCabeceras(p.cabeceras) ?? segundosDe(p.texto);
        if (segundos != null) break;
    }
    // «limit: 5 … per minute» con un «retry in 31s» es esperable; «per day» o sin
    // saldo, no: esperar no lo arregla.
    const diaria = esLimite && ES_DIARIA.test(texto) && !/per.?minute|perminute/i.test(texto);
    return {
        esLimite,
        diaria,
        segundos: segundos != null ? Math.ceil(segundos) : null,
        detalle: (ps[ps.length - 1]?.texto || ps[0]?.texto || String(err?.message || err || '')).slice(0, 1200),
    };
}

/** ¿Vale la pena esperar y repetir? Un límite por minuto con espera corta, sí. */
function sePuedeEsperar(info, { maxSegundos = 90 } = {}) {
    if (!info?.esLimite || info.diaria) return false;
    const s = info.segundos ?? 20; // sin espera indicada: una pausa prudente
    return s > 0 && s <= maxSegundos;
}

/** Espera `segundos`, o menos si se cancela. Devuelve false si se canceló. */
function esperar(segundos, senal) {
    return new Promise((resolve) => {
        if (senal?.aborted) { resolve(false); return; }
        const t = setTimeout(() => { senal?.removeEventListener?.('abort', fin); resolve(true); }, Math.max(0, segundos) * 1000);
        function fin() { clearTimeout(t); resolve(false); }
        senal?.addEventListener?.('abort', fin, { once: true });
    });
}

module.exports = { leerLimite, sePuedeEsperar, esperar };
