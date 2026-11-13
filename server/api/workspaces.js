/**
 * Workspaces: list, create, archive, their context, export and import.
 *
 * Rutas movidas de `server/index.js` (6.0, M7) sin cambiar ninguna URL. Lo que
 * comparten con el resto llega por `./compartido` (index.js lo llena antes de
 * cargar este archivo); el estado que cambia en marcha se lee como `ctx.X`.
 */

const express = require('express');
const workspaces       = require('../workspaces');

const ctx = require('./compartido');
const {
    conCentral, remontarFuentes,
} = ctx;

const rutas = express.Router();

rutas.get('/api/workspaces', conCentral(async (req) => ({
    workspaces: await workspaces.listar({ archivados: req.query.archivados === '1' }),
})));

rutas.post('/api/workspaces', conCentral(async (req) => workspaces.crear(req.body || {})));

rutas.get('/api/workspaces/:id', conCentral(async (req) => {
    const w = await workspaces.leer(req.params.id);
    if (!w) throw new Error('It does not exist.');
    return w;
}));

rutas.put('/api/workspaces/:id', conCentral(async (req) => {
    const w = await workspaces.actualizar(req.params.id, req.body || {});
    if (ctx.PROYECTO_ABIERTO) await workspaces.refrescarPolitica(ctx.ROOT_DIR);
    return w;
}));

rutas.post('/api/workspaces/:id/archivar', conCentral(async (req) =>
    workspaces.archivar(req.params.id, req.body?.archivado !== false)));

rutas.get('/api/workspaces/:id/proyectos', conCentral(async (req) => ({
    proyectos: await workspaces.proyectosDe(req.params.id),
})));

// Su contexto (B2): archivos de texto, editables sin proyecto abierto.
rutas.get('/api/workspaces/:id/contexto', conCentral(async (req) => ({
    archivos: await workspaces.archivosDeContexto(req.params.id),
})));

rutas.get('/api/workspaces/:id/contexto/archivo', conCentral(async (req) =>
    workspaces.leerArchivo(req.params.id, req.query.ruta)));

rutas.put('/api/workspaces/:id/contexto/archivo', conCentral(async (req) =>
    workspaces.escribirArchivo(req.params.id, req.body?.ruta, req.body?.texto)));

rutas.post('/api/workspaces/:id/contexto/subir-metrica', conCentral(async (req) => {
    if (!ctx.PROYECTO_ABIERTO) throw new Error('Open the project that has the metric.');
    return workspaces.subirMetrica(req.params.id, ctx.ROOT_DIR, req.body?.nombre);
}));

// Exportar e importar un workspace (B6): un .amoxworkspace sin credenciales.
rutas.get('/api/workspaces/:id/exportar', conCentral(async (req) => workspaces.exportar(req.params.id)));

rutas.post('/api/workspaces-importar/analizar', conCentral(async (req) => workspaces.analizarImportacion(req.body?.contenido)));

rutas.post('/api/workspaces-importar', conCentral(async (req) => {
    const r = await workspaces.importar(req.body?.contenido, req.body?.opciones || {});
    remontarFuentes();
    return r;
}));

module.exports = rutas;
