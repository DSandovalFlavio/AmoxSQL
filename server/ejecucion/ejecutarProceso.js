/**
 * Correr un proceso de Data Flow de principio a fin: elegir su base, abrirla,
 * anotar la ejecución en la base de AmoxSQL y cerrarla al terminar.
 *
 * Es la única puerta: la usan la interfaz (`/api/chains/run`, `/resume`) y la
 * usará la línea de comandos (fase 4), que sólo cambia `origen`.
 */
const chainExecutor = require('../ChainExecutor');
const baseCentral = require('../central/BaseCentral');
const { resolverBase, abrirContexto, soltarTrabajos } = require('./ContextoDeEjecucion');
const { historialCentral, historialDeReserva, historialMudo } = require('./historial');

async function ejecutarProceso({
    dbManager, chainDef, proyecto, chainFile = '',
    mode = 'full', startNodeId = null, variables, deFuera = {},
    origen = 'interfaz', workspaceId: workspaceIdDado = null, oyente = null,
}) {
    let workspaceId = workspaceIdDado;
    const base = resolverBase(chainDef);
    // El workspace de la carpeta, para que la vista de workspaces sepa de quién es
    // cada ejecución (B3). Se lee del project.json: vale aunque no esté abierta.
    if (!workspaceId && proyecto) {
        try {
            const pj = JSON.parse(require('fs').readFileSync(require('path').join(proyecto, '.amoxsql', 'project.json'), 'utf8'));
            workspaceId = pj?.workspace?.id || null;
        } catch { /* sin manifiesto */ }
    }
    // `fuera`: no la lanzó la interfaz (línea de comandos). El proyecto puede no
    // ser el abierto, así que la base de la interfaz no se usa para nada: ni
    // para correr (salvo que sea la de ese mismo proyecto) ni de reserva para
    // el historial.
    const fuera = origen !== 'interfaz';
    const historial = baseCentral.estaAbierta()
        ? historialCentral(baseCentral, { proyecto, workspaceId, origen, parametros: { ...(variables || {}), ...(deFuera || {}) } })
        : (fuera ? historialMudo() : await historialDeReserva(dbManager));

    const ctx = await abrirContexto(base.resuelta, { dbManager, proyecto, chainFile, fuera });
    try {
        const r = await chainExecutor.run(ctx, chainDef, proyecto, {
            mode, startNodeId, chainFile, variables, deFuera, historial, oyente,
        });
        return { ...r, base: base.resuelta, rutaBase: ctx.ruta || null };
    } finally {
        await ctx.cerrar();
        // Una orden de fuera no deja abierta su base de trabajo: el proceso
        // puede estar a punto de salir, o el proyecto no ser el de la interfaz.
        if (fuera) await soltarTrabajos(proyecto).catch(() => {});
    }
}

module.exports = { ejecutarProceso };
