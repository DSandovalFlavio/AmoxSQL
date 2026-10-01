/**
 * Correr un proceso de Data Flow de principio a fin: elegir su base, abrirla,
 * anotar la ejecución en la base de AmoxSQL y cerrarla al terminar.
 *
 * Es la única puerta: la usan la interfaz (`/api/chains/run`, `/resume`) y la
 * usará la línea de comandos (fase 4), que sólo cambia `origen`.
 */
const chainExecutor = require('../ChainExecutor');
const baseCentral = require('../central/BaseCentral');
const { resolverBase, abrirContexto } = require('./ContextoDeEjecucion');
const { historialCentral, historialDeReserva } = require('./historial');

async function ejecutarProceso({
    dbManager, chainDef, proyecto, chainFile = '',
    mode = 'full', startNodeId = null, variables,
    origen = 'interfaz', workspaceId = null,
}) {
    const base = resolverBase(chainDef);
    const historial = baseCentral.estaAbierta()
        ? historialCentral(baseCentral, { proyecto, workspaceId, origen, parametros: variables })
        : await historialDeReserva(dbManager);

    const ctx = await abrirContexto(base.resuelta, { dbManager, proyecto, chainFile });
    try {
        const r = await chainExecutor.run(ctx, chainDef, proyecto, {
            mode, startNodeId, chainFile, variables, historial,
        });
        return { ...r, base: base.resuelta };
    } finally {
        await ctx.cerrar();
    }
}

module.exports = { ejecutarProceso };
