const fs = require('fs');
const path = require('path');

// In-memory cache: projectPath -> { skills, mtime }
const cache = new Map();

/**
 * Parse YAML-like front-matter from a markdown file.
 * Supports: name, description fields.
 */
function parseFrontMatter(content) {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!match) return { meta: {}, body: content };

    const meta = {};
    for (const line of match[1].split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        if (key && value) meta[key] = value;
    }

    return { meta, body: content.slice(match[0].length).trim() };
}

/**
 * Load all skills from the project's agent/skills/ directory.
 * Skills are markdown files with optional YAML front-matter.
 *
 * @param {string} projectPath - The root directory of the current project
 * @returns {Promise<Array<{id: string, name: string, description: string, content: string, fileName: string}>>}
 */
async function loadSkills(projectPath) {
    if (!projectPath) return [];

    const skillsDir = path.join(projectPath, 'agent', 'skills');

    try {
        if (!fs.existsSync(skillsDir)) return [];

        const dirStat = await fs.promises.stat(skillsDir);
        const cached = cache.get(projectPath);
        if (cached && cached.mtime >= dirStat.mtimeMs) {
            return cached.skills;
        }

        const files = await fs.promises.readdir(skillsDir);
        const mdFiles = files.filter(f => f.endsWith('.md'));

        const skills = [];
        for (const fileName of mdFiles) {
            try {
                const filePath = path.join(skillsDir, fileName);
                const raw = await fs.promises.readFile(filePath, 'utf8');
                const { meta, body } = parseFrontMatter(raw);

                const id = fileName.replace(/\.md$/, '');
                skills.push({
                    id,
                    name: meta.name || id,
                    description: meta.description || '',
                    content: body,
                    fileName,
                });
            } catch (err) {
                console.warn(`[AI Skills] Error reading skill ${fileName}:`, err.message);
            }
        }

        cache.set(projectPath, { skills, mtime: dirStat.mtimeMs });
        return skills;
    } catch (err) {
        console.warn('[AI Skills] Error loading skills:', err.message);
        return [];
    }
}

/**
 * Get a single skill by ID.
 */
async function getSkill(projectPath, skillId) {
    const skills = await loadSkills(projectPath);
    return skills.find(s => s.id === skillId) || null;
}

/**
 * Invalidate the cache for a project (call when files change).
 */
function invalidateCache(projectPath) {
    cache.delete(projectPath);
}

module.exports = { loadSkills, getSkill, invalidateCache };
