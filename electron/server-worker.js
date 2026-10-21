/**
 * AmoxSQL — Express server worker
 * Runs inside Electron's utilityProcess (separate from the main process).
 * Main process ↔ worker communication via process.parentPort.
 * Renderer ↔ Express communication is unchanged: HTTP at localhost:PORT.
 */

process.parentPort.on('message', async (e) => {
    const msg = e.data;

    if (msg.type === 'start') {
        try {
            const { startServer, arrancarProgramador } = require('../server/index.js');
            const { port: actualPort } = await startServer(msg.port);
            // Lo programado (5.11, D1/D2): los avisos y la próxima hora van al
            // proceso principal; el reloj sólo con la aplicación abierta.
            arrancarProgramador({
                reloj: msg.reloj !== false,
                avisar: (a) => process.parentPort.postMessage({ type: 'aviso', ...a }),
                proximaCambio: (proxima, activo) => process.parentPort.postMessage({ type: 'programador', proxima, activo }),
            });
            process.parentPort.postMessage({ type: 'ready', port: actualPort });
        } catch (err) {
            process.parentPort.postMessage({ type: 'error', message: err.message });
            process.exit(1);
        }
    } else if (msg.type === 'reloj') {
        // El usuario abrió la ventana mientras corría una orden sin ventana.
        require('../server/index.js').arrancarProgramador({ reloj: true });
    } else if (msg.type === 'ejecutar') {
        // Una orden de la línea de comandos (A3). El resultado lo escribe
        // atenderOrden en su archivo; aquí sólo se devuelve el código.
        let codigo = 1;
        try {
            const { atenderOrden } = require('../server/index.js');
            codigo = (await atenderOrden(msg.orden)).codigo;
        } catch (err) {
            console.error('[CLI] La orden falló sin resultado:', err.message);
        }
        process.parentPort.postMessage({ type: 'ejecutado', id: msg.orden.id, codigo });
    }
});
