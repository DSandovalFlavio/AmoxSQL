/**
 * Reintentar sólo lo que vale la pena reintentar (5.13, J10; Dec-43).
 *
 * Probado en la fase 0.6 (`scripts/poc513/p03_red.mjs`): el motor ya reintenta
 * por su cuenta 3 veces en unos 2 segundos, así que un corte de un instante no
 * tumba nada. Lo que AmoxSQL añade es la espera LARGA, para una caída de minutos:
 * el proceso de las 5:00 que encuentra el servidor del cliente reiniciándose.
 *
 * Sólo los pasos que leen de la red, y sólo un error pasajero (tiempo agotado,
 * conexión cortada o rechazada, HTTP 429 o 5xx). Un 404, un permiso o una
 * credencial no se reintentan: esperar no los arregla.
 *
 * Por defecto, 2 reintentos con 30 s de espera en lo que corre sin nadie delante;
 * 0 en la interfaz (quien lo lanzó lo ve fallar y decide). Cada paso lo puede
 * cambiar (`config.reintentos: { veces, esperaSegundos }`).
 */

const DE_RED = new Set(['http_fetch', 'bucket_read', 'gsheet_read', 'fuente']);
const PASAJERO = /HTTP (429|5\d\d)\b|Timeout was reached|timed out|Could not connect|Server returned nothing|Connection reset|connection was reset|Failed to read connection|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo/i;
const POR_DEFECTO_FONDO = { veces: 2, esperaSegundos: 30 };

/** ¿Este error se arregla esperando? */
function esPasajero(mensaje) {
    return PASAJERO.test(String(mensaje || ''));
}

/** Cuántas veces y cuánto esperar para un paso, o null si no se reintenta. */
function reglaDe(nodo, origen = 'interfaz') {
    if (!DE_RED.has(nodo?.type)) return null;
    const c = nodo.config?.reintentos ?? nodo.data?.config?.reintentos;
    const r = c && typeof c === 'object' ? c : (origen !== 'interfaz' ? POR_DEFECTO_FONDO : null);
    if (!r) return null;
    const veces = Math.min(5, Math.max(0, Math.round(Number(r.veces) || 0)));
    const esperaSegundos = Math.min(600, Math.max(0, Number(r.esperaSegundos ?? POR_DEFECTO_FONDO.esperaSegundos) || 0));
    return veces > 0 ? { veces, esperaSegundos } : null;
}

/**
 * Corre `fn` y, si falla con un error pasajero, lo vuelve a intentar.
 * `alReintentar({ intento, de, error, esperaSegundos })` avisa antes de cada
 * espera; `cancelado()` la corta. Devuelve { resultado, reintentos }; si al final
 * falla, el error dice cuántas veces se intentó.
 */
async function conReintentos(fn, regla, { alReintentar = () => {}, cancelado = () => false, dormir = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
    let reintentos = 0;
    for (;;) {
        try {
            return { resultado: await fn(), reintentos };
        } catch (e) {
            const mensaje = String(e?.message || e);
            if (!regla || reintentos >= regla.veces || !esPasajero(mensaje) || cancelado()) {
                if (reintentos > 0 && e && typeof e === 'object') e.message = `${mensaje} (tried ${reintentos + 1} times, ${regla.esperaSegundos} s apart)`;
                throw e;
            }
            reintentos++;
            alReintentar({ intento: reintentos, de: regla.veces, error: mensaje.split('\n')[0], esperaSegundos: regla.esperaSegundos });
            // La espera se trocea para poder cancelarla.
            const fin = Date.now() + regla.esperaSegundos * 1000;
            while (Date.now() < fin && !cancelado()) await dormir(Math.min(500, fin - Date.now()));
            if (cancelado()) throw e;
        }
    }
}

module.exports = { DE_RED, POR_DEFECTO_FONDO, esPasajero, reglaDe, conReintentos };
