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
            const { startServer } = require('../server/index.js');
            const { port: actualPort } = await startServer(msg.port);
            process.parentPort.postMessage({ type: 'ready', port: actualPort });
        } catch (err) {
            process.parentPort.postMessage({ type: 'error', message: err.message });
            process.exit(1);
        }
    }
});
