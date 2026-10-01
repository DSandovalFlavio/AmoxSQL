const fs = require('fs');
const path = require('path');

/**
 * Loads user-defined AI rules from a RULES.md file in the project root.
 *
 * B2 (5.9): if the folder is linked to a workspace, that workspace's RULES.md
 * comes first, each under its own heading (server/ai/capaWorkspace.js).
 *
 * @param {string} projectPath - The root directory of the current project.
 * @returns {Promise<string|null>} - The rules text, or null if there are none.
 */
async function loadUserRules(projectPath) {
    if (!projectPath) return null;
    const propias = await leerReglas(path.join(projectPath, 'RULES.md'));
    const { workspaceDelProyecto, fusionarReglas } = require('./capaWorkspace');
    const ws = workspaceDelProyecto(projectPath);
    const delWs = ws ? await leerReglas(path.join(ws.dir, 'RULES.md')) : null;
    return fusionarReglas(delWs, propias, ws?.nombre);
}

async function leerReglas(rulesPath) {
    try {
        if (fs.existsSync(rulesPath)) {
            const content = (await fs.promises.readFile(rulesPath, 'utf8')).trim();
            return content || null;
        }
    } catch (error) {
        console.warn(`[AI User Rules] Error reading RULES.md at ${rulesPath}:`, error.message);
    }
    return null;
}

module.exports = {
    loadUserRules
};
