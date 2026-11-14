/**
 * Quién puede hablar con el servidor de AmoxSQL (6.0, M0; auditoría S1).
 *
 * El servidor es de la ventana de AmoxSQL y de nadie más. Hasta la 5.19 escuchaba en
 * todas las interfaces de red con `cors()` abierto: otra máquina de la misma red, o
 * una página web abierta en el navegador, podía ejecutar SQL en la base abierta.
 * Tres comprobaciones lo cierran sin tocar el cliente:
 *
 *  1. Escuchar sólo en 127.0.0.1 (`DIRECCION`): otra máquina no llega.
 *  2. El `Origin`, si viene, tiene que ser el de la app (`amoxsql://app`; en desarrollo
 *     también Vite en el 5173). Una página web siempre lo manda en una petición a
 *     otro sitio, y aquí se rechaza: no sólo se le niega leer la respuesta (eso es
 *     CORS), no se ejecuta. Sin `Origin` pasan el proceso principal, la línea de
 *     órdenes, las pruebas y lo que el navegador pide sin `cors` (una imagen), que
 *     sólo son lecturas cuyo resultado la página no puede ver.
 *  3. El `Host` tiene que ser localhost o 127.0.0.1: un dominio que se resuelve a
 *     127.0.0.1 (DNS rebinding) haría que la página pareciera del mismo sitio.
 */
const DIRECCION = '127.0.0.1';

const ORIGENES_APP = ['amoxsql://app'];
const ORIGENES_DESARROLLO = [/^http:\/\/(localhost|127\.0\.0\.1):5173$/];
const HOSTS = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;

function produccion() {
    return process.env.NODE_ENV === 'production';
}

/** ¿Este origen es la ventana de AmoxSQL? */
function origenPermitido(origen) {
    if (!origen) return true;
    if (ORIGENES_APP.includes(origen)) return true;
    // Una ventana sin origen propio (un `data:` o `file:`) manda «null»: también es nuestra.
    if (origen === 'null') return true;
    if (!produccion() && ORIGENES_DESARROLLO.some(re => re.test(origen))) return true;
    return false;
}

/** El middleware: va antes que cualquier ruta (y antes que CORS). */
function puerta(req, res, next) {
    const host = String(req.headers.host || '');
    if (!HOSTS.test(host)) {
        return res.status(403).json({ error: 'AmoxSQL only answers its own window (host not allowed).' });
    }
    if (!origenPermitido(req.headers.origin)) {
        return res.status(403).json({ error: 'AmoxSQL only answers its own window (origin not allowed).' });
    }
    next();
}

/** Las opciones de `cors()`: devuelve las cabeceras sólo a los orígenes de la app. */
const opcionesCors = {
    origin: (origen, cb) => cb(null, origenPermitido(origen) ? (origen || true) : false),
};

module.exports = { DIRECCION, puerta, opcionesCors, origenPermitido };
