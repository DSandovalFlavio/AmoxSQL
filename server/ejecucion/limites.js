/**
 * Lo que corre de fondo no estorba (5.13, H1; Dec-42).
 *
 * Medido en la fase 0.4 (`scripts/poc513/p02_fondo.mjs`, 4 núcleos y 16 GB): con un
 * análisis de 30 millones de filas en la interfaz, un proceso de fondo SIN límites
 * la llevaba a 7,0 s de p95; CON la mitad de los núcleos y el 25 % de la memoria,
 * a 3,3 s, y el propio proceso terminaba antes (47 s → 30 s) porque compite menos.
 * Sin `temp_directory`, poca memoria es «Out of Memory»; con él, va a disco.
 *
 * Se limita lo que corre sin nadie delante (programado, línea de comandos, lote)
 * MIENTRAS la aplicación está abierta: es cuando alguien trabaja. Con AmoxSQL
 * cerrado (la tarea de Windows lo despierta), no hay a quién molestar.
 *
 * Un proceso con base `proyecto` comparte la instancia de la interfaz y no se puede
 * limitar sin limitar a quien trabaja: se dice, no se arregla aquí.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

const POR_DEFECTO = { memoria: 25, hilos: 50 };   // porcentajes
const CLAVE = 'limites_fondo';

function baseCentral() { return require('../central/BaseCentral'); }

/** Los porcentajes que eligió el usuario (Operations), o los de serie. */
async function preferencias() {
    let p = null;
    try { if (baseCentral().estaAbierta()) p = await baseCentral().preferencia(CLAVE); } catch { /* sin base */ }
    const memoria = Number(p?.memoria), hilos = Number(p?.hilos);
    return {
        memoria: Number.isFinite(memoria) && memoria >= 5 && memoria <= 90 ? Math.round(memoria) : POR_DEFECTO.memoria,
        hilos: Number.isFinite(hilos) && hilos >= 10 && hilos <= 100 ? Math.round(hilos) : POR_DEFECTO.hilos,
    };
}

async function guardarPreferencias({ memoria, hilos }) {
    const actual = await preferencias();
    const nuevo = {
        memoria: Math.min(90, Math.max(5, Math.round(Number(memoria ?? actual.memoria)))),
        hilos: Math.min(100, Math.max(10, Math.round(Number(hilos ?? actual.hilos)))),
    };
    await baseCentral().guardarPreferencia(CLAVE, nuevo);
    return nuevo;
}

/** ¿Está la aplicación abierta (con su reloj de cada minuto)? */
function appAbierta() {
    try { return require('../programacion/programador').relojEnMarcha(); } catch { return false; }
}

/**
 * Los límites de una ejecución, o null si no lleva. `abierta` se puede dar (las
 * pruebas); si no, se mira el reloj de la aplicación.
 */
async function paraEjecucion({ origen = 'interfaz', abierta = appAbierta() } = {}) {
    if (origen === 'interfaz' || !abierta) return null;
    const p = await preferencias();
    const nucleos = os.cpus()?.length || 2;
    const hilos = Math.max(1, Math.floor(nucleos * p.hilos / 100));
    const mb = Math.max(256, Math.floor(os.totalmem() * p.memoria / 100 / 1048576));
    const temporal = path.join(require('../rutas').homeAmox(), 'temporal');
    try { fs.mkdirSync(temporal, { recursive: true }); } catch { /* el motor dirá si no puede */ }
    return {
        hilos, nucleos, memoriaMb: mb, temporal,
        texto: `${hilos} of ${nucleos} cores and ${mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`} of memory, so the computer stays usable`,
    };
}

/** Las sentencias que ponen los límites en una instancia aislada. */
function sentencias(l) {
    if (!l) return [];
    return [
        `SET threads = ${l.hilos}`,
        `SET memory_limit = '${l.memoriaMb}MB'`,
        `SET temp_directory = '${String(l.temporal).replace(/\\/g, '/').replace(/'/g, "''")}'`,
    ];
}

module.exports = { POR_DEFECTO, preferencias, guardarPreferencias, appAbierta, paraEjecucion, sentencias };
