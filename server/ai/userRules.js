const fs = require('fs');
const path = require('path');

/**
 * Loads user-defined AI rules from a RULES.md file in the project root.
 * 
 * @param {string} projectPath - The root directory of the current project.
 * @returns {Promise<string|null>} - The contents of RULES.md, or null if not found.
 */
async function loadUserRules(projectPath) {
    if (!projectPath) return null;

    const rulesPath = path.join(projectPath, 'RULES.md');
    
    try {
        if (fs.existsSync(rulesPath)) {
            const content = await fs.promises.readFile(rulesPath, 'utf8');
            return content.trim();
        }
    } catch (error) {
        console.warn(`[AI User Rules] Error reading RULES.md at ${rulesPath}:`, error.message);
    }
    
    return null;
}

module.exports = {
    loadUserRules
};
