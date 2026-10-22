/**
 * Donde lo dejaste (5.14, F5; Dec-46).
 *
 * Al abrir un proyecto, lo que hay que saber para retomarlo, en una tarjeta:
 *   - su estado y su entrega;
 *   - lo que falló o avisó sin nadie delante y nadie ha mirado (lo de «Needs
 *     attention», sólo de este proyecto);
 *   - la última ejecución de cada proceso;
 *   - lo que pasó desde la última vez que se abrió: ejecuciones y commits de otros;
 *   - lo que hay sin guardar en git;
 *   - las fuentes que aquí no se pueden leer o que llegan viejas.
 *
 * Las pestañas no salen de aquí: las guarda la interfaz, por proyecto.
 *
 * Fechas: `proyectos.ultimo_abierto` se guarda en UTC sin zona; `ejecuciones.inicio/fin`,
 * en hora local (current_timestamp). Se comparan como fechas, nunca como texto.
 */
const path = require('path');

const utc = (t) => (t ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? String(t) : `${String(t).replace(' ', 'T')}Z`) : null);
const local = (t) => (t ? new Date(String(t).replace(' ', 'T')) : null);
const mismaRuta = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
const json = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const nombreDe = (proceso, r) => require('./ejecucion/atencion').nombreDeProceso(proceso, r);

/**
 * @param o.base           la base central
 * @param o.raiz           la carpeta del proyecto
 * @param o.desde          la apertura anterior (Date o texto UTC), o null
 * @param o.git            { isRepo, getStatus, getLog } (inyectable para las pruebas)
 */
async function resumen({ base, raiz, desde = null, git = null }) {
    const anterior = desde instanceof Date ? desde : utc(desde);
    const out = { proyecto: null, atencion: [], procesos: [], desdeLaUltimaVez: null, git: null, fuentes: [] };

    // El proyecto en la base central (estado, entrega).
    if (base?.estaAbierta?.()) {
        const filas = await base.query(`SELECT id, ruta, nombre, estado, entrega FROM proyectos`).catch(() => []);
        const p = filas.find(f => mismaRuta(f.ruta, raiz));
        out.proyecto = {
            nombre: p?.nombre || path.basename(raiz), estado: p?.estado || null,
            entrega: p?.entrega ? String(p.entrega).slice(0, 10) : null,
            ultimaVez: anterior ? anterior.toISOString() : null,
        };

        // Lo de «Needs attention», sólo de este proyecto.
        out.atencion = await require('./ejecucion/atencion').listar(base, { proyecto: raiz }).catch(() => []);

        // La última ejecución de cada proceso, y lo que corrió desde la última vez.
        const ejecuciones = (await base.query(
            `SELECT id, proceso, proyecto, origen, inicio, fin, estado, error, resumen FROM ejecuciones
             WHERE inicio >= current_timestamp - INTERVAL 60 DAY ORDER BY inicio DESC LIMIT 2000`,
        ).catch(() => [])).filter(e => mismaRuta(e.proyecto, raiz));
        const vistos = new Set();
        for (const e of ejecuciones) {
            if (vistos.has(e.proceso) || e.estado === 'en_curso') continue;
            vistos.add(e.proceso);
            const r = json(e.resumen);
            out.procesos.push({
                runId: e.id, proceso: e.proceso, nombre: nombreDe(e.proceso, r),
                estado: e.estado === 'fallo' ? 'fallo' : r?.estado === 'aviso' ? 'aviso' : e.estado,
                cuando: String(e.fin || e.inicio || ''), origen: e.origen,
                linea: r?.linea || (e.error ? String(e.error).split('\n')[0] : null),
            });
            if (out.procesos.length >= 6) break;
        }
        if (anterior) {
            const despues = ejecuciones.filter(e => local(e.inicio) > anterior);
            out.desdeLaUltimaVez = {
                ejecuciones: despues.length,
                fallidas: despues.filter(e => e.estado === 'fallo').length,
            };
        }
    }

    // Git: lo que hay sin guardar y los commits desde la última vez.
    if (git) {
        try {
            if (await git.isRepo(raiz)) {
                const st = await git.getStatus(raiz);
                const log = anterior ? await git.getLog(raiz, 30).catch(() => ({ commits: [] })) : { commits: [] };
                const nuevos = (log.commits || []).filter(c => new Date(c.date) > anterior);
                out.git = {
                    rama: st.branch || null,
                    sinGuardar: (st.files || []).length,
                    commitsDesde: nuevos.length,
                    autores: [...new Set(nuevos.map(c => c.author).filter(Boolean))].slice(0, 4),
                };
            }
        } catch { /* sin git */ }
    }

    // Las fuentes que aquí no se pueden leer, o que llegan viejas.
    try {
        const { fuentes } = await require('./fuentes').listar({ raiz });
        const MAL = { sin_ubicar: 'no location on this machine', no_encontrada: 'file not found here', no_es_archivo: 'the location is not a file', no_es_carpeta: 'the location is not a folder', vacia: 'no matching file in the folder yet' };
        for (const f of fuentes) {
            if (MAL[f.estado]) out.fuentes.push({ nombre: f.nombre, problema: MAL[f.estado] });
            else if (f.vieja) out.fuentes.push({ nombre: f.nombre, problema: `${f.edadDias} days old (expected fresher than ${f.frescuraDias})` });
        }
    } catch { /* sin fuentes */ }

    out.hayAlgo = !!(out.atencion.length || out.procesos.length || out.proyecto?.entrega || out.proyecto?.estado
        || out.git?.sinGuardar || out.git?.commitsDesde || out.fuentes.length);
    return out;
}

module.exports = { resumen };
