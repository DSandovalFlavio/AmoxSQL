/**
 * La conexión con el vigilante del disco.
 *
 * Una sola conexión para toda la aplicación, con varios interesados: el gestor
 * de pestañas quiere saber si cambió un archivo abierto y el explorador si
 * apareció o desapareció alguno. Abrir una por cada uno sería abrir dos flujos
 * al mismo servidor para leer los mismos eventos.
 *
 * ## No sondea
 *
 * Es un flujo de eventos: el disco avisa y el servidor reenvía. Preguntar cada
 * N segundos «¿ha cambiado algo?» sobre un proyecto con miles de archivos es
 * justo el patrón que esta aplicación evita en todo lo demás — es local, no hay
 * latencia que amortizar, y el sistema operativo ya sabe la respuesta.
 *
 * ## Si no hay vigilancia, se dice
 *
 * Hay sistemas donde no se puede vigilar recursivamente. El primer evento lo
 * dice, y `estaActivo()` lo expone: **quien dependa de los avisos tiene derecho
 * a saber que no van a llegar**, en vez de suponer que nada cambia. La
 * comprobación al guardar sigue protegiendo el caso grave.
 */
import { API_BASE } from '../api.js';

const oyentes = new Set();
let fuente = null;
let activo = false;
let reintento = null;

function conectar() {
    if (fuente) return;
    try {
        fuente = new EventSource(`${API_BASE}/api/files/watch`);
    } catch {
        return;
    }

    fuente.onmessage = (e) => {
        let aviso;
        try { aviso = JSON.parse(e.data); } catch { return; }
        if (aviso.tipo === 'hola') { activo = !!aviso.activo; return; }
        for (const f of oyentes) {
            try { f(aviso); } catch { /* un oyente roto no tumba a los demás */ }
        }
    };

    /**
     * Al caerse se reintenta **una vez y con calma**.
     *
     * `EventSource` ya reintenta solo, pero si el servidor se reinicia deja la
     * conexión en un estado del que no sale. Se cierra y se vuelve a abrir a los
     * tres segundos: lo bastante pronto para no perder la vigilancia media
     * sesión, lo bastante tarde para no martillear un servidor que está
     * arrancando.
     */
    fuente.onerror = () => {
        activo = false;
        try { fuente.close(); } catch { /* ya estaba cerrada */ }
        fuente = null;
        clearTimeout(reintento);
        if (oyentes.size > 0) reintento = setTimeout(conectar, 3000);
    };
}

/** Se apunta a los avisos. Devuelve la función para darse de baja. */
export function vigilar(fn) {
    oyentes.add(fn);
    conectar();
    return () => {
        oyentes.delete(fn);
        if (oyentes.size === 0) {
            clearTimeout(reintento);
            try { fuente?.close(); } catch { /* ya estaba cerrada */ }
            fuente = null;
            activo = false;
        }
    };
}

/** ¿El servidor está vigilando de verdad? */
export function estaActivo() {
    return activo;
}
