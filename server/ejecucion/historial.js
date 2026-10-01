/**
 * El historial de las ejecuciones de Data Flow (fase 3.5 del plan).
 *
 * Desde la 5.9 se anota en la base de AmoxSQL, no en la del proyecto: así un
 * proceso que sólo mueve archivos no escribe en ella, y una ejecución lanzada
 * desde la línea de comandos queda en el mismo sitio que una de la interfaz.
 * Cada ejecución deja dos cosas con el mismo id:
 *
 *   ejecuciones            — el resumen que comparten todos los procesos
 *                            (proyecto, workspace, origen, estado, error).
 *   amoxsql_chains.runs    — el detalle de Data Flow, paso a paso, en las
 *   amoxsql_chains.node_runs  mismas tablas que usaba la 5.8.
 *
 * El historial que la 5.8 dejó en la base de cada proyecto se sigue viendo,
 * marcado como anterior y de sólo lectura.
 */
const path = require('path');
const chainPersistence = require('../ChainPersistence');

// status de Data Flow → estado de `ejecuciones`
const ESTADO = { completed: 'ok', failed: 'fallo', cancelled: 'cancelada', paused: 'pausada' };

/** `chain_file` en la base central: absoluto, porque es de todos los proyectos. */
function procesoAbsoluto(proyecto, chainFile) {
    if (!chainFile) return '';
    return proyecto ? path.resolve(proyecto, chainFile) : chainFile;
}

function historialCentral(base, { proyecto = null, workspaceId = null, origen = 'interfaz', parametros = null } = {}) {
    return {
        async createRun(d) {
            const proceso = procesoAbsoluto(proyecto, d.chainFile);
            const id = await chainPersistence.createRun(base, { ...d, chainFile: proceso, proyecto: proyecto || null });
            const params = parametros && Object.keys(parametros).length ? JSON.stringify(parametros) : null;
            await base.query(
                `INSERT INTO ejecuciones (id, proceso, proyecto, workspace_id, origen, inicio, estado, parametros)
                 VALUES ($1, $2, $3, $4, $5, current_timestamp, 'en_curso', $6)`,
                [id, proceso, proyecto, workspaceId, origen, params]
            );
            return id;
        },
        createNodeRun: (d) => chainPersistence.createNodeRun(base, d),
        updateNodeRun: (id, d) => chainPersistence.updateNodeRun(base, id, d),
        async updateRunStatus(id, d) {
            await chainPersistence.updateRunStatus(base, id, d);
            const estado = ESTADO[d.status];
            if (estado) {
                await base.query(
                    `UPDATE ejecuciones SET estado = $2, fin = current_timestamp, error = $3 WHERE id = $1`,
                    [id, estado, d.error ? String(d.error).slice(0, 4000) : null]
                );
            }
        },
    };
}

/**
 * Cuando la base central no está (no se pudo abrir): en la del proyecto, como
 * la 5.8. Y si tampoco se puede escribir ahí —sólo lectura, un lakehouse—, la
 * ejecución corre igual, sin historial, en vez de fallar por no poder anotarse.
 */
async function historialDeReserva(dbManager) {
    try {
        await chainPersistence.initSchema(dbManager);
        return chainPersistence.ligar(dbManager);
    } catch {
        return historialMudo();
    }
}

/** Corre sin anotar nada: ids de usar y tirar. */
function historialMudo() {
    const crypto = require('crypto');
    return {
        createRun: async () => crypto.randomUUID(),
        createNodeRun: async () => crypto.randomUUID(),
        updateNodeRun: async () => {},
        updateRunStatus: async () => {},
    };
}

// ── Leer ────────────────────────────────────────────────────────────────────

/** Las ejecuciones de una cadena: las de la base central y las anteriores del proyecto. */
async function listar({ base, dbManager, proyecto, chainFile, limit = 20 }) {
    let nuevas = [];
    if (base?.estaAbierta?.()) {
        nuevas = await chainPersistence.listRuns(base, { chainFile: procesoAbsoluto(proyecto, chainFile), limit });
        // Al cliente, la ruta como la conoce él.
        nuevas = nuevas.map(r => ({ ...r, chain_file: chainFile || r.chain_file }));
    }
    let anteriores = [];
    if (dbManager && await chainPersistence.tieneHistorial(dbManager)) {
        try {
            anteriores = (await chainPersistence.listRuns(dbManager, { chainFile, limit }))
                .map(r => ({ ...r, anterior: true }));
        } catch { /* una base que no se deja leer no tapa el resto */ }
    }
    return [...nuevas, ...anteriores]
        .sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')))
        .slice(0, limit);
}

/** Una ejecución con sus pasos: primero en la base central, luego en la del proyecto. */
async function leer({ base, dbManager, runId }) {
    if (base?.estaAbierta?.()) {
        const run = await chainPersistence.getRun(base, runId);
        if (run) return { run, nodeRuns: await chainPersistence.getNodeRuns(base, runId), anterior: false };
    }
    if (dbManager && await chainPersistence.tieneHistorial(dbManager)) {
        const run = await chainPersistence.getRun(dbManager, runId);
        if (run) return { run: { ...run, anterior: true }, nodeRuns: await chainPersistence.getNodeRuns(dbManager, runId), anterior: true };
    }
    return { run: null, nodeRuns: [], anterior: false };
}

/** Borrar sólo se borra de la base central: el historial anterior es de sólo lectura. */
async function borrar({ base, runId }) {
    if (!base?.estaAbierta?.()) return false;
    const run = await chainPersistence.getRun(base, runId);
    if (!run) return false;
    await chainPersistence.deleteRun(base, runId);
    await base.query(`DELETE FROM ejecuciones WHERE id = $1`, [runId]);
    return true;
}

module.exports = { historialCentral, historialDeReserva, historialMudo, listar, leer, borrar, procesoAbsoluto, ESTADO };
