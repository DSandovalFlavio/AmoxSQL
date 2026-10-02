/**
 * El manifiesto del proyecto (A2): qué necesita para funcionar, sin guardar
 * nada secreto.
 *
 * Vive en `project.json` como `requiere: { credenciales: [{nombre, tipo}],
 * extensiones: [...] }`. Lo mantiene la aplicación sola —nadie lo escribe a
 * mano— cuando el proyecto empieza a depender de algo:
 *
 * - una extensión que se carga con el proyecto abierto;
 * - una credencial de la nube que usa un pipeline suyo.
 *
 * Al abrir el proyecto en otra máquina, lo que falta se anuncia por su nombre
 * («Faltan: credencial nube-s3, extensión iceberg») en vez de descubrirse
 * fallando a mitad de una carga. Y la línea de comandos (A3) sale con código 3
 * antes de empezar.
 *
 * Sólo se escribe cuando aparece un requisito nuevo: abrir un proyecto no crea
 * `project.json` si no hacía falta. `saveProjectConfig` fusiona, así que las
 * otras claves —y las que añada la 5.9 o conserve la 5.8— no se pierden.
 */
const scaffolder = require('./projectScaffolder');
const secretos = require('./secretos');

const NOMBRE_EXTENSION = /^[a-z0-9_]{1,64}$/i;

function requisitos(raiz) {
    const r = (scaffolder.getProjectConfig(raiz) || {}).requiere || {};
    return {
        credenciales: Array.isArray(r.credenciales) ? r.credenciales.filter(c => c && c.nombre) : [],
        extensiones: Array.isArray(r.extensiones) ? r.extensiones.filter(e => typeof e === 'string') : [],
        fuentes: Array.isArray(r.fuentes) ? r.fuentes.filter(f => typeof f === 'string') : [],
    };
}

function guardar(raiz, r) {
    const actual = (scaffolder.getProjectConfig(raiz) || {}).requiere || {};
    scaffolder.saveProjectConfig(raiz, { requiere: { ...actual, ...r } });
}

/** Devuelve true si la anotó (era nueva). */
function anotarExtension(raiz, nombre) {
    const n = String(nombre || '').trim().toLowerCase();
    if (!NOMBRE_EXTENSION.test(n)) return false;
    const r = requisitos(raiz);
    if (r.extensiones.includes(n)) return false;
    guardar(raiz, { extensiones: [...r.extensiones, n].sort() });
    return true;
}

/** Devuelve true si la anotó (era nueva). */
function anotarCredencial(raiz, nombre, tipo) {
    const n = String(nombre || '').trim();
    if (!n) return false;
    const r = requisitos(raiz);
    if (r.credenciales.some(c => c.nombre === n)) return false;
    const credenciales = [...r.credenciales, { nombre: n, tipo: String(tipo || 'secreto') }]
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    guardar(raiz, { credenciales });
    return true;
}

/**
 * Una fuente con nombre (C1) que el proyecto usa: en otra máquina hay que
 * ubicarla. Devuelve true si la anotó (era nueva).
 */
function anotarFuente(raiz, nombre) {
    const n = String(nombre || '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(n)) return false;
    const r = requisitos(raiz);
    if (r.fuentes.includes(n)) return false;
    guardar(raiz, { fuentes: [...r.fuentes, n].sort() });
    return true;
}

/**
 * Lo que un pipeline necesita de la nube, mirando sus nodos: cualquier valor de
 * configuración que empiece por s3:// o gs:// pide la credencial de ese
 * proveedor. Es tosco a propósito —no depende de conocer cada tipo de nodo—, y
 * equivocarse por exceso sólo añade una línea al manifiesto.
 */
function credencialesDeCadena(definicion) {
    const hace = new Map();
    const mirar = (v) => {
        if (typeof v === 'string') {
            if (/^s3:\/\//i.test(v.trim())) hace.set('nube-s3', 's3');
            else if (/^(gs|gcs):\/\//i.test(v.trim())) hace.set('nube-gcs', 'gcs');
        } else if (v && typeof v === 'object') {
            for (const x of Object.values(v)) mirar(x);
        }
    };
    for (const nodo of (definicion?.nodes || [])) {
        // Un Publish a un bucket nombra su credencial (C6): ésa es la que hace falta.
        if (nodo?.type === 'publicar') {
            if (nodo.config?.credencial) hace.set(String(nodo.config.credencial), 'nube');
            continue;
        }
        mirar(nodo?.config);
    }
    return [...hace].map(([nombre, tipo]) => ({ nombre, tipo }));
}

function anotarDesdeCadena(raiz, definicion) {
    let nuevas = 0;
    for (const c of credencialesDeCadena(definicion)) if (anotarCredencial(raiz, c.nombre, c.tipo)) nuevas++;
    return nuevas;
}

/**
 * Qué falta en ESTA máquina. `db` es cualquier cosa con systemQuery (el
 * dbManager): se usa para saber qué extensiones están instaladas.
 */
async function comprobar(raiz, db, config) {
    const requiere = requisitos(raiz);
    const faltanCredenciales = [];
    for (const c of requiere.credenciales) if (!secretos.existe(c.nombre, config)) faltanCredenciales.push(c);

    let instaladas = null;
    try {
        instaladas = new Set((await db.systemQuery(
            `SELECT extension_name FROM duckdb_extensions() WHERE installed`
        )).map(e => String(e.extension_name).toLowerCase()));
    } catch { instaladas = null; }   // sin motor no se puede saber: no se acusa a nadie
    const faltanExtensiones = instaladas ? requiere.extensiones.filter(e => !instaladas.has(e)) : [];

    // Las fuentes que usa y que aquí no se sabe dónde están (o ya no existen).
    const faltanFuentes = [];
    if (requiere.fuentes.length) {
        try {
            const fuentes = require('./fuentes');
            const { fuentes: lista } = await fuentes.listar({ raiz });
            const porNombre = new Map(lista.map(f => [f.nombre, f]));
            for (const n of requiere.fuentes) {
                const f = porNombre.get(n);
                if (!f) faltanFuentes.push({ nombre: n, motivo: 'sin_definicion' });
                else if (f.estado === 'sin_ubicar') faltanFuentes.push({ nombre: n, motivo: 'sin_ubicar' });
                else if (f.estado === 'no_encontrada') faltanFuentes.push({ nombre: n, motivo: 'no_encontrada', ubicacion: f.ubicacionAqui });
            }
        } catch { /* sin base de AmoxSQL no se puede saber: no se acusa a nadie */ }
    }

    return {
        requiere,
        faltan: { credenciales: faltanCredenciales, extensiones: faltanExtensiones, fuentes: faltanFuentes },
        completo: !faltanCredenciales.length && !faltanExtensiones.length && !faltanFuentes.length,
    };
}

module.exports = {
    requisitos, anotarExtension, anotarCredencial, anotarFuente, credencialesDeCadena, anotarDesdeCadena, comprobar,
};
