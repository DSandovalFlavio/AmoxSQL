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

function fila(w) {
    if (!w) return null;
    return {
        id: w.id,
        nombre: w.nombre,
        etiqueta: w.etiqueta || null,
        color: w.color || null,
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
async function crear({ id = null, nombre, etiqueta: tag = null, color = null }) {
    const n = limpiar(nombre);
    if (!n) throw new Error('A name is required.');
    const nuevoId = id ? limpiar(id, 64) : crypto.randomUUID();
    if (!/^[\w-]{4,64}$/.test(nuevoId)) throw new Error('Invalid id.');
    if (await leer(nuevoId)) throw new Error('That one already exists.');
    await baseCentral.query(
        `INSERT INTO workspaces (id, nombre, etiqueta, color) VALUES ($1, $2, $3, $4)`,
        [nuevoId, n, limpiar(tag, 60) || null, COLOR.test(color || '') ? color : null]
    );
    crearCarpeta(nuevoId);
    return leer(nuevoId);
}

async function actualizar(id, { nombre, etiqueta: tag, color }) {
    const actual = await leer(id);
    if (!actual) throw new Error('It does not exist.');
    const n = nombre !== undefined ? limpiar(nombre) : actual.nombre;
    if (!n) throw new Error('A name is required.');
    await baseCentral.query(
        `UPDATE workspaces SET nombre = $2, etiqueta = $3, color = $4 WHERE id = $1`,
        [id,
            n,
            tag !== undefined ? (limpiar(tag, 60) || null) : actual.etiqueta,
            color !== undefined ? (COLOR.test(color || '') ? color : null) : actual.color]
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

module.exports = {
    grupoDelProyecto,
    ETIQUETAS, ETIQUETA_POR_DEFECTO, singular,
    etiqueta, etiquetaElegida, elegirEtiqueta,
    listar, leer, crear, actualizar, archivar, proyectosDe, carpetaDe,
    registrar, estadoDelEnlace, enlazar,
};
