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
            await startServer(msg.port);
            process.parentPort.postMessage({ type: 'ready' });
        } catch (err) {
            process.parentPort.postMessage({ type: 'error', message: err.message });
            process.exit(1);
        }
    }
});
