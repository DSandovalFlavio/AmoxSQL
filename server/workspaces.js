/**
 * Workspaces (B1) y la palabra que los nombra (B8), fase 6 del plan de la 5.9.
 *
 * Un workspace vive en AmoxSQL, no en una carpeta: sus metadatos en la base
 * central (`workspaces`) y su contexto como archivos en `<home>/workspaces/<id>/`
 * (Dec-5). Las carpetas de proyecto se le enlazan después, y el enlace viaja
 * con la carpeta: `project.json` guarda `workspace: { id, nombre }` —nada más—
 * y el `id` del propio proyecto, para reconocerlo aunque se mueva.
 *
 * Abrir una carpeta (6.2):
 *   - trae el id de un workspace que esta máquina conoce → enlazada;
 *   - trae uno que no conoce (viene de otra máquina) → se ofrece crearlo con ese
 *     id y ese nombre;
 *   - no trae nada → se pregunta, salvo que el usuario dijera «no volver a
 *     preguntar» en ese proyecto o todavía no tenga ningún workspace.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const baseCentral = require('./central/BaseCentral');
const { normalizarRuta, marcaDeTiempo } = require('./central/BaseCentral');
const scaffolder = require('./projectScaffolder');
const { homeAmox } = require('./rutas');
const politica = require('./ai/politica');

// ── La palabra (B8) ─────────────────────────────────────────────────────────
const ETIQUETAS = ['clients', 'teams', 'brands', 'products', 'workspaces'];
const ETIQUETA_POR_DEFECTO = 'workspaces';
const SINGULAR = { clients: 'client', teams: 'team', brands: 'brand', products: 'product', workspaces: 'workspace' };

/** null si el usuario todavía no la ha elegido (la pantalla 1 la pregunta). */
async function etiquetaElegida() {
    const v = await baseCentral.preferencia('etiqueta_workspace');
    return ETIQUETAS.includes(v) ? v : null;
}

async function etiqueta() {
    return (await etiquetaElegida()) || ETIQUETA_POR_DEFECTO;
}

async function elegirEtiqueta(valor) {
    if (!ETIQUETAS.includes(valor)) throw new Error(`Unknown label: ${valor}`);
    await baseCentral.guardarPreferencia('etiqueta_workspace', valor);
    return valor;
}

const singular = (clave) => SINGULAR[clave] || 'workspace';

// ── Workspaces ──────────────────────────────────────────────────────────────
const COLOR = /^#[0-9a-f]{6}$/i;

function carpetaDe(id) {
    return path.join(homeAmox(), 'workspaces', id);
}

/** El esqueleto de contexto, vacío: lo llena B2 (fase 7). */
function crearCarpeta(id) {
    const raiz = carpetaDe(id);
    for (const d of ['contexto', 'skills']) fs.mkdirSync(path.join(raiz, d), { recursive: true });
    return raiz;
}

const limpiar = (v, max = 120) => String(v ?? '').trim().slice(0, max);

/**
 * La marca (B5): paleta (hasta 8 colores) y logo (una imagen pequeña en data
 * URL, ya reducida en el cliente). El color principal es la columna `color`.
 * Los decks y figuras NUEVOS de un proyecto enlazado la toman como valores
 * iniciales; lo que ya existe no cambia.
 */
const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
function normalizarMarca(m) {
    const x = (m && typeof m === 'object') ? m : {};
    const paleta = (Array.isArray(x.paleta) ? x.paleta : []).filter(c => COLOR.test(String(c))).slice(0, 8);
    const logo = typeof x.logo === 'string' && x.logo.length <= 300 * 1024 && LOGO.test(x.logo) ? x.logo : null;
    return { paleta, logo };
}

function fila(w) {
    if (!w) return null;
    return {
        id: w.id,
        nombre: w.nombre,
        etiqueta: w.etiqueta || null,
        color: w.color || null,
        politicaIa: (() => { try { return politica.normalizar(JSON.parse(w.politica_ia || 'null')); } catch { return politica.normalizar(null); } })(),
        marca: (() => { try { return normalizarMarca(JSON.parse(w.marca || 'null')); } catch { return normalizarMarca(null); } })(),
        creado: w.creado,
        archivado: w.archivado || null,
        proyectos: w.proyectos != null ? Number(w.proyectos) : undefined,
    };
}

async function listar({ archivados = false } = {}) {
    const filas = await baseCentral.query(
        `SELECT w.*, (SELECT count(*) FROM proyectos p WHERE p.workspace_id = w.id) AS proyectos
         FROM workspaces w
         WHERE ${archivados ? 'w.archivado IS NOT NULL' : 'w.archivado IS NULL'}
         ORDER BY lower(w.nombre)`
    );
    return filas.map(fila);
}

async function leer(id) {
    const [w] = await baseCentral.query(
        `SELECT w.*, (SELECT count(*) FROM proyectos p WHERE p.workspace_id = w.id) AS proyectos FROM workspaces w WHERE w.id = $1`,
        [String(id)]
    );
    return fila(w);
}

/**
 * `id` sólo se da al crear el workspace que trae una carpeta de otra máquina:
 * así el enlace que ya está en su project.json sigue valiendo.
 */
async function crear({ id = null, nombre, etiqueta: tag = null, color = null, politicaIa = null, marca = null }) {
    const n = limpiar(nombre);
    if (!n) throw new Error('A name is required.');
    const nuevoId = id ? limpiar(id, 64) : crypto.randomUUID();
    if (!/^[\w-]{4,64}$/.test(nuevoId)) throw new Error('Invalid id.');
    if (await leer(nuevoId)) throw new Error('That one already exists.');
    await baseCentral.query(
        `INSERT INTO workspaces (id, nombre, etiqueta, color, politica_ia, marca) VALUES ($1, $2, $3, $4, $5, $6)`,
        [nuevoId, n, limpiar(tag, 60) || null, COLOR.test(color || '') ? color : null, JSON.stringify(politica.normalizar(politicaIa)), JSON.stringify(normalizarMarca(marca))]
    );
    crearCarpeta(nuevoId);
    return leer(nuevoId);
}

async function actualizar(id, { nombre, etiqueta: tag, color, politicaIa, marca }) {
    const actual = await leer(id);
    if (!actual) throw new Error('It does not exist.');
    const n = nombre !== undefined ? limpiar(nombre) : actual.nombre;
    if (!n) throw new Error('A name is required.');
    await baseCentral.query(
        `UPDATE workspaces SET nombre = $2, etiqueta = $3, color = $4, politica_ia = $5, marca = $6 WHERE id = $1`,
        [id,
            n,
            tag !== undefined ? (limpiar(tag, 60) || null) : actual.etiqueta,
            color !== undefined ? (COLOR.test(color || '') ? color : null) : actual.color,
            JSON.stringify(politicaIa !== undefined ? politica.normalizar(politicaIa) : actual.politicaIa),
            JSON.stringify(marca !== undefined ? normalizarMarca(marca) : actual.marca)]
    );
    return leer(id);
}

async function archivar(id, archivado = true) {
    if (!(await leer(id))) throw new Error('It does not exist.');
    await baseCentral.query(
        `UPDATE workspaces SET archivado = ${archivado ? 'current_timestamp' : 'NULL'} WHERE id = $1`,
        [id]
    );
    return leer(id);
}

async function proyectosDe(id) {
    const filas = await baseCentral.query(
        `SELECT id, ruta, nombre, estado, entrega, ultimo_abierto FROM proyectos WHERE workspace_id = $1 ORDER BY ultimo_abierto DESC NULLS LAST`,
        [id]
    );
    return filas.map(p => ({ ...p, existe: fs.existsSync(p.ruta) }));
}

// ── Proyectos ───────────────────────────────────────────────────────────────

/**
 * La fila de `proyectos` de una carpeta: por el id de su project.json si lo
 * trae (así se reconoce aunque la carpeta se haya movido), si no por la ruta.
 * Se crea si no existe. Anota el último abierto y, si se movió, la ruta nueva.
 */
// Abrir una carpeta la registra, y la interfaz pregunta por su enlace justo
// después: dos registros a la vez crearían dos filas para la misma carpeta.
let turno = Promise.resolve();
function registrar(raiz, opciones) {
    const r = turno.then(() => _registrar(raiz, opciones));
    turno = r.then(() => {}, () => {});
    return r;
}

async function _registrar(raiz, { abrir = false } = {}) {
    const ruta = path.resolve(raiz);
    const pj = scaffolder.getProjectConfig(ruta) || {};
    let actual = null;
    if (pj.id) [actual] = await baseCentral.query(`SELECT * FROM proyectos WHERE id = $1`, [String(pj.id)]);
    if (!actual) {
        const todas = await baseCentral.query(`SELECT * FROM proyectos`);
        actual = todas.find(p => normalizarRuta(p.ruta) === normalizarRuta(ruta)) || null;
    }
    const ahora = marcaDeTiempo(new Date());
    if (!actual) {
        const id = pj.id && /^[\w-]{4,64}$/.test(pj.id) ? pj.id : crypto.randomUUID();
        await baseCentral.query(
            `INSERT INTO proyectos (id, ruta, nombre, ultimo_abierto, origen) VALUES ($1, $2, $3, ${abrir ? '$4::TIMESTAMP' : 'NULL'}, 'abierto')`,
            abrir ? [id, ruta, path.basename(ruta), ahora] : [id, ruta, path.basename(ruta)]
        );
        [actual] = await baseCentral.query(`SELECT * FROM proyectos WHERE id = $1`, [id]);
    } else if (normalizarRuta(actual.ruta) !== normalizarRuta(ruta) || abrir) {
        await baseCentral.query(
            `UPDATE proyectos SET ruta = $2, nombre = $3${abrir ? ', ultimo_abierto = $4::TIMESTAMP' : ''} WHERE id = $1`,
            abrir ? [actual.id, ruta, path.basename(ruta), ahora] : [actual.id, ruta, path.basename(ruta)]
        );
        actual = { ...actual, ruta, nombre: path.basename(ruta) };
    }
    return { fila: actual, pj };
}

/**
 * Qué le pasa a esta carpeta con los workspaces, para la interfaz.
 * @returns {{ estado: 'enlazado'|'desconocido'|'sin_enlazar', preguntar, workspace, enArchivo, proyecto }}
 */
async function estadoDelEnlace(raiz, { abrir = false } = {}) {
    const { fila: p, pj } = await registrar(raiz, { abrir });
    const enArchivo = pj.workspace && pj.workspace.id ? { id: String(pj.workspace.id), nombre: String(pj.workspace.nombre || '') } : null;
    const proyecto = { id: p.id, ruta: p.ruta, nombre: p.nombre };

    if (enArchivo) {
        const w = await leer(enArchivo.id);
        if (w) {
            // La base refleja lo que dice el archivo, que es lo que viaja.
            if (p.workspace_id !== w.id) await baseCentral.query(`UPDATE proyectos SET workspace_id = $2 WHERE id = $1`, [p.id, w.id]);
            // Si el workspace cambió de nombre, el archivo se pone al día.
            if (enArchivo.nombre !== w.nombre) scaffolder.saveProjectConfig(raiz, { workspace: { id: w.id, nombre: w.nombre } });
            return { estado: 'enlazado', preguntar: false, workspace: w, enArchivo, proyecto };
        }
        return { estado: 'desconocido', preguntar: true, workspace: null, enArchivo, proyecto };
    }

    if (p.workspace_id) await baseCentral.query(`UPDATE proyectos SET workspace_id = NULL WHERE id = $1`, [p.id]);
    const hayAlguno = (await listar()).length > 0;
    return { estado: 'sin_enlazar', preguntar: hayAlguno && !p.no_preguntar, workspace: null, enArchivo: null, proyecto };
}

/**
 * Enlaza (o desenlaza, con `workspaceId` null) la carpeta. Escribe en
 * project.json, que fusiona: las demás claves se quedan como estaban.
 */
async function enlazar(raiz, workspaceId, { noPreguntar } = {}) {
    const { fila: p, pj } = await registrar(raiz);
    if (workspaceId) {
        const w = await leer(workspaceId);
        if (!w) throw new Error('It does not exist.');
        scaffolder.saveProjectConfig(raiz, { id: pj.id || p.id, workspace: { id: w.id, nombre: w.nombre } });
        await baseCentral.query(`UPDATE proyectos SET workspace_id = $2, no_preguntar = false WHERE id = $1`, [p.id, w.id]);
    } else {
        if (pj.workspace) scaffolder.saveProjectConfig(raiz, { workspace: null });
        await baseCentral.query(
            `UPDATE proyectos SET workspace_id = NULL${noPreguntar !== undefined ? ', no_preguntar = $2' : ''} WHERE id = $1`,
            noPreguntar !== undefined ? [p.id, !!noPreguntar] : [p.id]
        );
    }
    return estadoDelEnlace(raiz);
}

/**
 * Para el prompt de la IA: a qué workspace pertenece el proyecto, con la
 * palabra del usuario. Sólo lee; null si no está enlazado.
 */
async function grupoDelProyecto(raiz) {
    const pj = scaffolder.getProjectConfig(raiz) || {};
    if (!pj.workspace || !pj.workspace.id) return null;
    let nombre = pj.workspace.nombre || '';
    try { nombre = (await leer(pj.workspace.id))?.nombre || nombre; } catch { /* sin base: el del archivo */ }
    const clave = await etiqueta().catch(() => ETIQUETA_POR_DEFECTO);
    return { palabra: singular(clave), plural: clave, nombre };
}

// ── El contexto del workspace (B2, 7.2) ─────────────────────────────────────
// Archivos de texto que escribe una persona (Dec-5). Sólo estos nombres: la
// ruta llega del cliente y no puede salirse de la carpeta del workspace.
const PERMITIDOS = [
    /^RULES\.md$/,
    /^contexto\/(metrics\.yml|joins\.yml|glossary\.md)$/,
    /^contexto\/examples\/[\w.-]+\.sql$/,
    /^skills\/[\w-]+\/SKILL\.md$/,
    // Las definiciones de sus fuentes (C1, 5.10): viajan con el workspace; la
    // ubicación en cada máquina, no. No salen en el editor de contexto: tienen
    // su propio panel.
    /^fuentes\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/,
    // Y sus destinos de entrega (D6, 5.11): igual, la carpeta de cada máquina no.
    /^destinos\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/,
];
const CANONICOS = ['RULES.md', 'contexto/metrics.yml', 'contexto/joins.yml', 'contexto/glossary.md'];

function rutaSegura(id, ruta) {
    const r = String(ruta || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!PERMITIDOS.some(re => re.test(r))) throw new Error(`Not a context file: ${r}`);
    const raiz = carpetaDe(id);
    const abs = path.resolve(raiz, r);
    if (!abs.startsWith(path.resolve(raiz) + path.sep)) throw new Error('Path is outside the workspace.');
    return { r, abs };
}

async function archivosDeContexto(id) {
    if (!(await leer(id))) throw new Error('It does not exist.');
    const raiz = crearCarpeta(id);
    const vistos = new Map();
    const anotar = (r) => {
        const abs = path.join(raiz, r);
        const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
        vistos.set(r, { ruta: r, existe: !!st, tamano: st ? st.size : 0 });
    };
    CANONICOS.forEach(anotar);
    const ej = path.join(raiz, 'contexto', 'examples');
    if (fs.existsSync(ej)) for (const f of fs.readdirSync(ej)) if (/\.sql$/i.test(f)) anotar(`contexto/examples/${f}`);
    const sk = path.join(raiz, 'skills');
    if (fs.existsSync(sk)) {
        for (const d of fs.readdirSync(sk, { withFileTypes: true })) {
            if (d.isDirectory() && fs.existsSync(path.join(sk, d.name, 'SKILL.md'))) anotar(`skills/${d.name}/SKILL.md`);
        }
    }
    return [...vistos.values()];
}

/** Las definiciones de fuentes y de destinos del workspace, como archivos (para exportar). */
function archivosDeFuentes(id) {
    const out = [];
    for (const sub of ['fuentes', 'destinos']) {
        const dir = path.join(carpetaDe(id), sub);
        if (!fs.existsSync(dir)) continue;
        out.push(...fs.readdirSync(dir).filter(f => /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(f)).map(f => `${sub}/${f}`));
    }
    return out;
}

async function leerArchivo(id, ruta) {
    if (!(await leer(id))) throw new Error('It does not exist.');
    const { r, abs } = rutaSegura(id, ruta);
    return { ruta: r, texto: fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '' };
}

async function escribirArchivo(id, ruta, texto) {
    if (!(await leer(id))) throw new Error('It does not exist.');
    const { r, abs } = rutaSegura(id, ruta);
    const t = String(texto ?? '');
    if (t.length > 512 * 1024) throw new Error('The file is too large (512 KB at most).');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, t, 'utf8');
    return { ruta: r, tamano: Buffer.byteLength(t) };
}

/** Las métricas de un proyecto, para ofrecer subirlas a su workspace. */
function metricasDelProyecto(raiz) {
    const { parseMetrics } = require('./ai/contextLoader');
    const archivo = path.join(raiz, 'context', 'metrics.yml');
    if (!fs.existsSync(archivo)) return [];
    return parseMetrics(fs.readFileSync(archivo, 'utf8'));
}

/**
 * «Subir al workspace» (7.2): copia una métrica de un proyecto al metrics.yml
 * del workspace, para que valga en todos sus proyectos. Es una copia: la del
 * proyecto sigue ahí y, mientras exista, manda en ese proyecto.
 */
async function subirMetrica(id, raiz, nombre) {
    const { parseMetrics } = require('./ai/contextLoader');
    const m = metricasDelProyecto(raiz).find(x => x.name === nombre);
    if (!m) throw new Error(`The project has no metric named "${nombre}".`);
    const { abs } = rutaSegura(id, 'contexto/metrics.yml');
    const actual = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    if (parseMetrics(actual).some(x => x.name === nombre)) throw new Error(`"${nombre}" is already shared.`);
    const bloque = [
        `  - name: ${m.name}`,
        `    sql: "${m.sql}"`,
        m.description ? `    description: ${m.description}` : null,
        m.grain ? `    grain: ${m.grain}` : null,
        m.table ? `    table: ${m.table}` : null,
    ].filter(Boolean).join('\n');
    const base = actual.trim() ? actual.replace(/\s*$/, '\n\n') : 'metrics:\n';
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, base + bloque + '\n', 'utf8');
    return { nombre, compartida: true };
}

/** Pone al día la política de IA activa: la del workspace de la carpeta abierta. */
async function refrescarPolitica(raiz) {
    const p = raiz ? await politica.deProyecto(raiz) : { ...politica.POR_DEFECTO, workspace: null };
    return politica.fijar(p, p.workspace);
}

/** La marca del workspace de la carpeta abierta, o null (B5). */
async function marcaDelProyecto(raiz) {
    const pj = scaffolder.getProjectConfig(raiz) || {};
    if (!pj.workspace || !pj.workspace.id) return null;
    const w = await leer(pj.workspace.id);
    if (!w) return null;
    return { workspace: w.nombre, color: w.color, paleta: w.marca.paleta, logo: w.marca.logo };
}

// ── La vista de workspaces (B3, fase 8.1) ───────────────────────────────────

const ESTADOS = ['en_curso', 'en_revision', 'entregado', 'pausado'];

const fecha = (v) => (v ? String(v).slice(0, 10) : null);

function filaProyecto(p) {
    return {
        id: p.id, ruta: p.ruta, nombre: p.nombre, workspaceId: p.workspace_id || null,
        estado: p.estado || null, entrega: fecha(p.entrega), ultimoAbierto: p.ultimo_abierto || null,
        existe: fs.existsSync(p.ruta),
    };
}

/**
 * Todo lo que enseña la vista de workspaces de una vez: cada workspace con el
 * estado de sus proyectos y su próxima entrega, los proyectos sin workspace,
 * cuántos archivados hay, y lo último que corrió.
 */
async function resumenInicio() {
    const activos = await listar();
    const archivados = await listar({ archivados: true });
    const proyectos = (await baseCentral.query(
        `SELECT * FROM proyectos ORDER BY ultimo_abierto DESC NULLS LAST`
    )).map(filaProyecto);
    const ids = new Set(activos.map(w => w.id));
    const hoy = new Date().toISOString().slice(0, 10);
    const tarjetas = activos.map(w => {
        const suyos = proyectos.filter(p => p.workspaceId === w.id);
        const porEstado = {};
        for (const p of suyos) if (p.estado) porEstado[p.estado] = (porEstado[p.estado] || 0) + 1;
        const proxima = suyos.filter(p => p.entrega && p.entrega >= hoy && p.estado !== 'entregado')
            .sort((a, b) => a.entrega.localeCompare(b.entrega))[0] || null;
        return { ...w, porEstado, proximaEntrega: proxima ? { proyecto: proxima.nombre, fecha: proxima.entrega } : null };
    });
    const ejecuciones = (await baseCentral.query(
        `SELECT e.id, e.proceso, e.proyecto, e.origen, e.inicio, e.fin, e.estado, e.error, w.nombre AS workspace, w.color
         FROM ejecuciones e LEFT JOIN workspaces w ON w.id = e.workspace_id
         ORDER BY e.inicio DESC LIMIT 8`
    )).map(e => ({ ...e, nombreProceso: path.basename(String(e.proceso || '')).replace(/\.sqlchain$/i, '') }));
    return {
        workspaces: tarjetas,
        sinWorkspace: proyectos.filter(p => !p.workspaceId || !ids.has(p.workspaceId)),
        archivados,
        totalProyectos: proyectos.length,
        ejecuciones,
    };
}

/** Buscar por nombre y ruta en todos los proyectos que AmoxSQL conoce. */
async function buscarProyectos(texto) {
    const q = String(texto || '').trim().toLowerCase();
    const filas = (await baseCentral.query(`SELECT * FROM proyectos ORDER BY ultimo_abierto DESC NULLS LAST`)).map(filaProyecto);
    return q ? filas.filter(p => `${p.nombre} ${p.ruta}`.toLowerCase().includes(q)).slice(0, 50) : filas.slice(0, 50);
}

/**
 * Estado y fecha de entrega de un proyecto (8.2). Se escriben en su
 * project.json —viajan con la carpeta— y se reflejan en la base de AmoxSQL.
 */
async function actualizarProyecto(id, { estado, entrega }) {
    const [p] = await baseCentral.query(`SELECT * FROM proyectos WHERE id = $1`, [String(id)]);
    if (!p) throw new Error('It does not exist.');
    const e = estado === undefined ? p.estado : (estado === null || estado === '' ? null : estado);
    if (e !== null && e !== undefined && !ESTADOS.includes(e)) throw new Error(`Unknown status: ${e}`);
    let f = entrega === undefined ? fecha(p.entrega) : (entrega || null);
    if (f !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(f))) throw new Error('The due date must be YYYY-MM-DD.');
    if (fs.existsSync(p.ruta)) scaffolder.saveProjectConfig(p.ruta, { estado: e || null, entrega: f || null });
    await baseCentral.query(`UPDATE proyectos SET estado = $2, entrega = $3::DATE WHERE id = $1`, [p.id, e || null, f || null]);
    const [nueva] = await baseCentral.query(`SELECT * FROM proyectos WHERE id = $1`, [p.id]);
    return filaProyecto(nueva);
}

/** Enlazar una carpeta sin abrirla (desde la lista de proyectos sueltos). */
async function enlazarRuta(ruta, workspaceId) {
    if (!ruta || !fs.existsSync(ruta)) throw new Error('That folder is no longer there.');
    return enlazar(ruta, workspaceId);
}

// ── Exportar e importar (B6, fase 8.3) ──────────────────────────────────────
// Un .amoxworkspace es JSON con versión, sin dependencias: metadatos, marca
// (el logo en data URL), los archivos de contexto y los NOMBRES de las
// credenciales que usan sus proyectos. Nunca un valor: cada persona añade las
// suyas a su propio llavero.
const FORMATO = 'amoxworkspace';
const VERSION_FORMATO = 1;

async function exportar(id) {
    const w = await leer(id);
    if (!w) throw new Error('It does not exist.');
    const contexto = {};
    for (const a of await archivosDeContexto(id)) {
        if (a.existe) contexto[a.ruta] = (await leerArchivo(id, a.ruta)).texto;
    }
    for (const r of archivosDeFuentes(id)) contexto[r] = (await leerArchivo(id, r)).texto;
    const credenciales = new Map();
    const extensiones = new Set();
    for (const p of await proyectosDe(id)) {
        const r = (scaffolder.getProjectConfig(p.ruta) || {}).requiere || {};
        for (const c of r.credenciales || []) if (c && c.nombre) credenciales.set(c.nombre, { nombre: c.nombre, tipo: c.tipo || null });
        for (const e of r.extensiones || []) if (typeof e === 'string') extensiones.add(e);
    }
    return {
        formato: FORMATO,
        version: VERSION_FORMATO,
        exportado: new Date().toISOString(),
        workspace: {
            id: w.id, nombre: w.nombre, etiqueta: w.etiqueta, color: w.color,
            politicaIa: w.politicaIa, marca: w.marca,
        },
        contexto,
        requiere: { credenciales: [...credenciales.values()], extensiones: [...extensiones] },
    };
}

function leerPaquete(contenido) {
    let d = contenido;
    if (typeof d === 'string') {
        if (d.length > 8 * 1024 * 1024) throw new Error('The file is too large.');
        try { d = JSON.parse(d); } catch { throw new Error('That is not an AmoxSQL workspace file.'); }
    }
    if (!d || d.formato !== FORMATO) throw new Error('That is not an AmoxSQL workspace file.');
    if (Number(d.version) > VERSION_FORMATO) throw new Error(`The file was made by a newer AmoxSQL (format v${d.version}). Update to import it.`);
    const w = d.workspace || {};
    if (!w.id || !/^[\w-]{4,64}$/.test(String(w.id)) || !limpiar(w.nombre)) throw new Error('The file has no valid workspace.');
    const contexto = {};
    for (const [ruta, texto] of Object.entries(d.contexto || {})) {
        const r = String(ruta).replace(/\\/g, '/');
        if (!PERMITIDOS.some(re => re.test(r))) continue;      // lo que no es contexto, no se importa
        contexto[r] = String(texto ?? '');
    }
    return { ...d, workspace: w, contexto };
}

/** Qué pasaría al importar: si el workspace ya existe y qué archivos cambian. */
async function analizarImportacion(contenido) {
    const d = leerPaquete(contenido);
    const local = await leer(d.workspace.id);
    const archivos = [];
    for (const [ruta, texto] of Object.entries(d.contexto)) {
        let estado = 'nuevo';
        if (local) {
            const { texto: actual } = await leerArchivo(local.id, ruta);
            const existe = fs.existsSync(path.join(carpetaDe(local.id), ruta));
            estado = !existe ? 'nuevo' : (actual === texto ? 'igual' : 'distinto');
        }
        archivos.push({ ruta, estado });
    }
    return {
        workspace: { id: d.workspace.id, nombre: d.workspace.nombre },
        existe: !!local,
        local: local ? { nombre: local.nombre, archivado: !!local.archivado } : null,
        archivos,
        credenciales: (d.requiere?.credenciales || []).map(c => c.nombre),
    };
}

/**
 * Importa. Si ya existe: los archivos nuevos se añaden, los distintos sólo si
 * están en `sobrescribir`, y los datos del workspace (nombre, color, política,
 * marca) sólo con `metadatos`. `comoNuevo` lo crea aparte, con otro id.
 */
async function importar(contenido, { sobrescribir = [], metadatos = false, comoNuevo = false } = {}) {
    const d = leerPaquete(contenido);
    const w = d.workspace;
    let destino = comoNuevo ? null : await leer(w.id);
    const datos = { nombre: w.nombre, etiqueta: w.etiqueta || null, color: w.color || null, politicaIa: w.politicaIa || null, marca: w.marca || null };
    if (!destino) {
        destino = await crear({ ...datos, id: comoNuevo ? null : w.id });
    } else if (metadatos) {
        destino = await actualizar(destino.id, datos);
    }
    const quiere = new Set(sobrescribir);
    const escritos = [];
    for (const [ruta, texto] of Object.entries(d.contexto)) {
        const existe = fs.existsSync(path.join(carpetaDe(destino.id), ruta));
        if (existe) {
            const { texto: actual } = await leerArchivo(destino.id, ruta);
            if (actual === texto || !quiere.has(ruta)) continue;
        }
        await escribirArchivo(destino.id, ruta, texto);
        escritos.push(ruta);
    }
    return { workspace: await leer(destino.id), escritos };
}

module.exports = {
    ESTADOS, resumenInicio, buscarProyectos, actualizarProyecto, enlazarRuta,
    FORMATO, exportar, analizarImportacion, importar,
    marcaDelProyecto, normalizarMarca,
    archivosDeContexto, leerArchivo, escribirArchivo, metricasDelProyecto, subirMetrica,
    refrescarPolitica,
    grupoDelProyecto,
    ETIQUETAS, ETIQUETA_POR_DEFECTO, singular,
    etiqueta, etiquetaElegida, elegirEtiqueta,
    listar, leer, crear, actualizar, archivar, proyectosDe, carpetaDe,
    registrar, estadoDelEnlace, enlazar,
};
