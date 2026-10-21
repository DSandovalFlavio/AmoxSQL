/**
 * destinos.js — los destinos de entrega (5.11, D6; Dec-21 del plan).
 *
 * «El Excel de salida se guarda siempre en la carpeta compartida del cliente,
 * con la fecha en el nombre.» Un destino tiene las dos mitades de una fuente
 * (Dec-9), con la flecha al revés:
 *
 *   - la DEFINICIÓN —nombre (`entrega-cliente`), descripción y, si se quiere,
 *     una subcarpeta con fecha (`{fecha:AAAA}/{fecha:MM}`)— vive en el
 *     workspace (`<home>/workspaces/<id>/destinos/`) o en el proyecto
 *     (`.amoxsql/destinos/`) y viaja; con el mismo nombre gana el proyecto;
 *   - DÓNDE está esa carpeta en esta máquina va a `destinos_locales`
 *     (migración 4). Una carpeta dentro del proyecto o una dirección `s3://…`
 *     va en la definición y vale en todas.
 *
 * El nombre del archivo lo pone el paso que escribe (Excel, Export, Publish),
 * con los parámetros `${x}` y las fechas `{fecha}`, `{fecha:AAAA-MM}`, `{hora}`.
 * La fecha es la de la ejecución o, si la lanzó una programación, la de la
 * ocurrencia prevista (D1): el cierre de septiembre que corrió el 2 de
 * octubre lleva la fecha que tocaba.
 */
const fs = require('fs');
const path = require('path');
const baseCentral = require('./central/BaseCentral');
const { homeAmox } = require('./rutas');
const fuentes = require('./fuentes');

const REMOTA = /^(s3|gs|gcs|r2|az|azure|abfss):\/\//i;

class ErrorDeDestino extends Error {}

const carpetaDelWorkspace = (id) => {
    if (!/^[\w-]{4,64}$/.test(String(id || ''))) throw new Error('Invalid workspace id.');
    return path.join(homeAmox(), 'workspaces', String(id), 'destinos');
};
const carpetaDelProyecto = (raiz) => path.join(path.resolve(raiz), '.amoxsql', 'destinos');

/** Un nombre como el de una fuente: minúsculas, cifras y guiones. */
function validarNombre(nombre) {
    const n = String(nombre ?? '').trim();
    if (!n) throw new ErrorDeDestino('A destination needs a name.');
    if (n.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(n)) {
        throw new ErrorDeDestino('A destination name uses lowercase letters, digits and hyphens only (for example: client-delivery).');
    }
    return n;
}

const texto = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function normalizarDefinicion(x) {
    if (!x || typeof x !== 'object') throw new ErrorDeDestino('A destination needs a name.');
    const def = { nombre: validarNombre(x.nombre) };
    if (texto(x.descripcion)) def.descripcion = texto(x.descripcion);
    const sub = texto(x.subcarpeta, 200).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (sub) {
        if (sub.split('/').some(p => p === '..' || p === '.')) throw new ErrorDeDestino('The subfolder cannot go up with "..".');
        def.subcarpeta = sub;
    }
    const u = texto(x.ubicacion, 1000);
    if (u) {
        if (!REMOTA.test(u) && path.isAbsolute(u)) throw new ErrorDeDestino('A full path is this machine\'s: set it with "Set location on this machine".');
        if (!REMOTA.test(u) && u.split(/[\\/]/).includes('..')) throw new ErrorDeDestino('A location inside the project cannot go up with "..".');
        def.ubicacion = u.replace(/\\/g, '/');
    }
    return def;
}

function leerCarpeta(dir, origen) {
    const lista = [];
    let nombres = [];
    try { nombres = fs.readdirSync(dir).filter(f => /\.json$/i.test(f)); } catch { return lista; }
    for (const f of nombres.sort()) {
        try {
            const def = normalizarDefinicion(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
            if (`${def.nombre}.json` === f) lista.push({ def, origen });
        } catch { /* una definición rota no tapa las demás */ }
    }
    return lista;
}

const ambitoDe = ({ raiz = null, workspaceId = null }, { crear = false } = {}) => {
    if (raiz) {
        const id = fuentes.idDelProyecto(raiz, { crear });
        return id ? `p:${id}` : null;
    }
    return workspaceId ? `w:${workspaceId}` : null;
};

/** Los destinos que ve un proyecto (o un workspace): los del workspace y los del proyecto, ganando estos. */
function definiciones({ raiz = null, workspaceId = null } = {}) {
    const ws = workspaceId || (raiz ? fuentes.workspaceDelProyecto(raiz) : null);
    const porNombre = new Map();
    if (ws) for (const x of leerCarpeta(carpetaDelWorkspace(ws), 'workspace')) porNombre.set(x.def.nombre, { ...x, ambito: `w:${ws}` });
    if (raiz) {
        const pid = fuentes.idDelProyecto(raiz);
        for (const x of leerCarpeta(carpetaDelProyecto(raiz), 'proyecto')) {
            const tapa = porNombre.get(x.def.nombre);
            porNombre.set(x.def.nombre, { ...x, ambito: pid ? `p:${pid}` : null, raiz: path.resolve(raiz), sobrescribe: tapa ? 'workspace' : null });
        }
    }
    return [...porNombre.values()].sort((a, b) => a.def.nombre.localeCompare(b.def.nombre));
}

async function guardar(donde, definicion) {
    const def = normalizarDefinicion(definicion);
    const dir = donde.raiz ? carpetaDelProyecto(donde.raiz) : carpetaDelWorkspace(donde.workspaceId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${def.nombre}.json`), JSON.stringify(def, null, 2) + '\n', 'utf8');
    return def;
}

/**
 * Con un proyecto abierto, un destino puede ser suyo o de su workspace: se mira
 * de quién es para borrarlo o ubicarlo donde toca.
 */
function dueno(donde, n) {
    if (!donde.raiz) return { dir: carpetaDelWorkspace(donde.workspaceId), donde };
    const item = definiciones(donde).find(x => x.def.nombre === n);
    if (item?.origen === 'workspace') {
        const ws = fuentes.workspaceDelProyecto(donde.raiz);
        return { dir: carpetaDelWorkspace(ws), donde: { workspaceId: ws } };
    }
    return { dir: carpetaDelProyecto(donde.raiz), donde };
}

async function borrar(donde, nombre) {
    const n = validarNombre(nombre);
    const d = dueno(donde, n);
    const abs = path.join(d.dir, `${n}.json`);
    if (!fs.existsSync(abs)) throw new ErrorDeDestino(`There is no destination named "${n}" here.`);
    fs.rmSync(abs);
    const ambito = ambitoDe(d.donde);
    if (ambito && baseCentral.estaAbierta()) await baseCentral.query(`DELETE FROM destinos_locales WHERE ambito = $1 AND nombre = $2`, [ambito, n]);
}

/** Dónde está el destino en ESTA máquina. `ubicacion` null lo olvida. */
async function ubicar(donde, nombre, ubicacion) {
    const n = validarNombre(nombre);
    if (!baseCentral.estaAbierta()) throw new ErrorDeDestino('The AmoxSQL database is not open: the location cannot be saved.');
    const ambito = ambitoDe(dueno(donde, n).donde, { crear: true });
    if (!ambito) throw new ErrorDeDestino('Open a project or choose a workspace first.');
    if (!ubicacion) {
        await baseCentral.query(`DELETE FROM destinos_locales WHERE ambito = $1 AND nombre = $2`, [ambito, n]);
        return null;
    }
    const u = String(ubicacion).trim();
    if (!REMOTA.test(u) && !path.isAbsolute(u)) throw new ErrorDeDestino('The folder on this machine must be a full path.');
    const ruta = REMOTA.test(u) ? u : path.resolve(u);
    await baseCentral.query(
        `INSERT OR REPLACE INTO destinos_locales (ambito, nombre, ubicacion, actualizada) VALUES ($1, $2, $3, current_timestamp)`,
        [ambito, n, ruta]
    );
    return ruta;
}

async function locales() {
    if (!baseCentral.estaAbierta()) return new Map();
    const filas = await baseCentral.query(`SELECT ambito, nombre, ubicacion FROM destinos_locales`);
    return new Map(filas.map(f => [`${f.ambito}\u0000${f.nombre}`, f.ubicacion]));
}

function resolver(item, mapa) {
    const d = item.def;
    if (d.ubicacion && REMOTA.test(d.ubicacion)) return { ubicacion: d.ubicacion, como: 'definicion' };
    if (d.ubicacion && item.raiz) return { ubicacion: path.resolve(item.raiz, d.ubicacion), como: 'relativa' };
    const local = item.ambito ? mapa.get(`${item.ambito}\u0000${d.nombre}`) : null;
    if (local) return { ubicacion: local, como: 'local' };
    return { ubicacion: null, como: null };
}

/** La lista para la interfaz: cada destino con dónde está aquí y si se llega. */
async function listar(donde) {
    const mapa = await locales();
    return definiciones(donde).map(item => {
        const r = resolver(item, mapa);
        let estado = 'listo';
        if (!r.ubicacion) estado = 'sin_ubicar';
        else if (!REMOTA.test(r.ubicacion) && !fs.existsSync(r.ubicacion)) estado = 'no_se_llega';
        return {
            ...item.def, origen: item.origen, sobrescribe: item.sobrescribe || null,
            ubicacionAqui: r.ubicacion, como: r.como, estado,
        };
    });
}

// ── El nombre del archivo ───────────────────────────────────────────────────

const dos = (n) => String(n).padStart(2, '0');

/** `AAAA-MM-DD`, o con un formato: AAAA/YYYY, AA/YY, MM, DD, HH, mm (o min). */
function formatearFecha(d, formato = 'AAAA-MM-DD') {
    return formato
        .replace(/AAAA|YYYY/g, String(d.getFullYear()))
        .replace(/AA|YY/g, String(d.getFullYear()).slice(-2))
        .replace(/MM/g, dos(d.getMonth() + 1))
        .replace(/DD/g, dos(d.getDate()))
        .replace(/HH/g, dos(d.getHours()))
        .replace(/mm|min/g, dos(d.getMinutes()));
}

/**
 * Las fechas de un nombre: `{fecha}`, `{fecha:AAAA-MM}`, `{hora}`. Lo demás se
 * queda como está (los `${x}` ya los sustituyó parametros.js).
 */
function ponerFechas(nombre, fecha = new Date()) {
    return String(nombre)
        .replace(/\{fecha(?::([^}]+))?\}/g, (_, f) => formatearFecha(fecha, f || 'AAAA-MM-DD'))
        .replace(/\{hora\}/g, `${dos(fecha.getHours())}${dos(fecha.getMinutes())}`);
}

/**
 * Dónde se deja un archivo en un destino: su carpeta en esta máquina, la
 * subcarpeta con fecha si la tiene, y el nombre que da el paso. Crea las
 * carpetas que falten por debajo de la del destino, nunca la del destino: si
 * no está (una unidad desconectada), se dice.
 */
async function rutaDeEntrega(donde, nombre, archivo, { fecha = new Date() } = {}) {
    const item = definiciones(donde).find(x => x.def.nombre === nombre);
    if (!item) throw new ErrorDeDestino(`There is no destination named "${nombre}". Create it in the Sources panel, under Destinations.`);
    const { ubicacion } = resolver(item, await locales());
    if (!ubicacion) throw new ErrorDeDestino(`The destination "${nombre}" has no folder on this machine. Set it in the Sources panel, under Destinations.`);
    const sub = item.def.subcarpeta ? ponerFechas(item.def.subcarpeta, fecha) : '';
    const nom = ponerFechas(String(archivo || '').trim(), fecha);
    if (!nom) throw new ErrorDeDestino('Give the file a name.');
    if (/[\\/]/.test(nom) || nom === '..') throw new ErrorDeDestino(`"${nom}" is a file name, without folders: the folder is the destination's.`);
    if (REMOTA.test(ubicacion)) return `${ubicacion.replace(/\/+$/, '')}/${sub ? `${sub}/` : ''}${nom}`;
    if (!fs.existsSync(ubicacion)) throw new ErrorDeDestino(`The folder of "${nombre}" is not reachable: ${ubicacion}. Is the drive connected?`);
    const dir = sub ? path.join(ubicacion, ...sub.split('/')) : ubicacion;
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, nom);
}

module.exports = {
    ErrorDeDestino, normalizarDefinicion, definiciones, guardar, borrar, ubicar, listar,
    resolver, rutaDeEntrega, ponerFechas, formatearFecha, carpetaDelWorkspace, carpetaDelProyecto,
};
