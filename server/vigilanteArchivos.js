/**
 * El vigilante del disco.
 *
 * Hasta ahora **nada miraba los archivos**. Si un `git pull`, un proceso o el
 * otro editor que el usuario tiene abierto cambiaba un archivo que aquí estaba
 * abierto, la pestaña seguía enseñando lo de antes y al guardar lo pisaba **sin
 * un solo aviso**. De las diez preguntas de la auditoría sobre esto, diez
 * salieron que no.
 *
 * ## La firma, y por qué no basta la fecha
 *
 * Cada aviso lleva una **firma del contenido**, no sólo la fecha de
 * modificación. Dos razones, las dos medidas contra el uso real:
 *
 * 1. **Nuestra propia escritura dispara el vigilante.** Sin firma, guardar un
 *    archivo produciría acto seguido un «este archivo cambió por fuera» sobre
 *    el cambio que acabas de hacer tú. Con firma, el cliente compara y calla.
 * 2. **Tocar un archivo no es cambiarlo.** Un `git checkout` de una rama a otra
 *    y vuelta, o una herramienta que reescribe el mismo contenido, mueven la
 *    fecha sin cambiar un byte. Preguntar ahí es ruido, y el ruido enseña a
 *    ignorar los avisos — que es exactamente lo que no puede pasar con el único
 *    aviso que evita perder trabajo.
 *
 * Para archivos grandes la firma es tamaño más fecha: leer 400 MB para
 * contestar «¿cambió?» sería peor que el problema. El corte está donde leer
 * todavía es instantáneo.
 *
 * ## Lo que NO hace
 *
 * No decide nada. Dice **qué cambió y cuál es su firma**; si eso debe recargar
 * en silencio, preguntar o callarse lo decide el cliente, que es el único que
 * sabe si hay trabajo sin guardar. Mantenerlo tonto es lo que hace que la
 * decisión se pueda probar sin un disco delante.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Por encima de esto la firma es tamaño+fecha: leerlo entero costaría más que el aviso. */
const LIMITE_FIRMA = 8 * 1024 * 1024;

/**
 * Lo que no se vigila.
 *
 * `.git` es el caso que obliga a tener esta lista: **un solo `git status`
 * escribe dentro**, y sin filtrar, cualquier operación de git produciría una
 * tormenta de avisos sobre archivos que ningún usuario ha abierto nunca.
 */
const IGNORADOS = [
    '.git', 'node_modules', 'dist', 'build', '.next', '.venv', 'venv',
    '__pycache__', '.pytest_cache', '.ruff_cache', '.mypy_cache', 'target',
];

/** Archivos de trabajo de la base de datos: cambian solos y no los abre nadie. */
const EXT_IGNORADAS = ['.wal', '.tmp', '.swp', '.lock'];

function seIgnora(rel) {
    const partes = rel.replace(/\\/g, '/').split('/');
    if (partes.some((p) => IGNORADOS.includes(p))) return true;
    const ext = path.extname(rel).toLowerCase();
    if (EXT_IGNORADAS.includes(ext)) return true;
    // Los archivos que el propio editor escribe mientras trabajas.
    if (partes[partes.length - 1].startsWith('~')) return true;
    return false;
}

/**
 * La firma de un archivo, o `null` si ya no está.
 *
 * `null` **significa borrado** y es información, no un fallo: una pestaña que
 * apunta a un archivo que ya no existe tiene que enterarse.
 */
function firmaDe(fullPath) {
    let st;
    try { st = fs.statSync(fullPath); } catch { return null; }
    if (st.isDirectory()) return null;
    if (st.size > LIMITE_FIRMA) return `t:${st.size}:${Math.round(st.mtimeMs)}`;
    try {
        const buf = fs.readFileSync(fullPath);
        return `h:${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16)}`;
    } catch {
        return null;
    }
}

/**
 * Arranca la vigilancia sobre una raíz.
 *
 * Devuelve `{ suscribir, parar }`. Si el sistema no admite vigilancia recursiva
 * —pasa en algunos montajes de red— devuelve un vigilante **que no emite nada**
 * en vez de reventar: sin avisos se trabaja como hasta ayer, y la comprobación
 * al guardar sigue protegiendo el caso grave.
 */
function crearVigilante(raiz, { retardo = 120 } = {}) {
    const oyentes = new Set();
    const pendientes = new Map(); // rel -> timeout
    let watcher = null;

    const emitir = (rel) => {
        const completo = path.join(raiz, rel);
        const firma = firmaDe(completo);
        const aviso = {
            ruta: rel.replace(/\\/g, '/'),
            firma,
            tipo: firma === null ? 'baja' : 'cambio',
            cuando: Date.now(),
        };
        for (const f of oyentes) {
            try { f(aviso); } catch { /* un oyente roto no tumba a los demás */ }
        }
    };

    try {
        watcher = fs.watch(raiz, { recursive: true }, (_evento, nombre) => {
            if (!nombre) return;
            const rel = String(nombre);
            if (seIgnora(rel)) return;
            /**
             * **Un guardado produce varios eventos.** El sistema avisa del
             * cambio de tamaño, del de fecha y del cierre por separado, y sin
             * agrupar saldrían tres avisos idénticos por cada guardado ajeno.
             * Se espera a que pare de moverse y se emite una vez, ya con la
             * firma del resultado final.
             */
            clearTimeout(pendientes.get(rel));
            pendientes.set(rel, setTimeout(() => {
                pendientes.delete(rel);
                emitir(rel);
            }, retardo));
        });
        watcher.on('error', () => { /* el disco dejó de responder; se calla */ });
    } catch {
        watcher = null;
    }

    return {
        activo: !!watcher,
        suscribir(fn) {
            oyentes.add(fn);
            return () => oyentes.delete(fn);
        },
        parar() {
            for (const t of pendientes.values()) clearTimeout(t);
            pendientes.clear();
            oyentes.clear();
            try { watcher?.close(); } catch { /* ya estaba cerrado */ }
            watcher = null;
        },
    };
}

module.exports = { crearVigilante, firmaDe, seIgnora, LIMITE_FIRMA };
