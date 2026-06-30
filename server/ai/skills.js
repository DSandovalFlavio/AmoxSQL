const fs = require('fs');
const path = require('path');

// In-memory cache: projectPath -> { skills, mtime }
const cache = new Map();

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
 * Read and parse every skill in a directory.
 * Supports two formats:
 *   - Flat:   <dir>/<id>.md
 *   - Folder: <dir>/<id>/SKILL.md  (Anthropic Skills canon format)
 *
 * Frontmatter fields:
 *   name        — display name
 *   description — one-line description (used in UI and intent matching)
 *   keywords    — comma-separated keywords for auto-activation scoring
 *   next        — comma-separated skill IDs to suggest after this one completes
 */
async function readSkillsDir(skillsDir, builtin = false) {
    if (!fs.existsSync(skillsDir)) return [];

    const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });
    const skills = [];

    for (const entry of entries) {
        try {
            let raw, id, fileName;

            if (entry.isDirectory()) {
                // Folder format: <dir>/<id>/SKILL.md
                const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
                if (!fs.existsSync(skillFile)) continue;
                raw = await fs.promises.readFile(skillFile, 'utf8');
                id = entry.name;
                fileName = `${entry.name}/SKILL.md`;
            } else if (entry.name.endsWith('.md')) {
                // Flat format: <dir>/<id>.md
                const filePath = path.join(skillsDir, entry.name);
                raw = await fs.promises.readFile(filePath, 'utf8');
                id = entry.name.replace(/\.md$/, '');
                fileName = entry.name;
            } else {
                continue;
            }

            const { meta, body } = parseFrontMatter(raw);
            skills.push({
                id,
                name: meta.name || id,
                description: meta.description || '',
                // Scope groups skills by use-case: 'analysis' (SQL/notebook, the default)
                // or 'engineering' (Chains data-pipeline building). Lets the UI surface
                // the right set per editor.
                scope: (meta.scope || 'analysis').toLowerCase(),
                keywords: meta.keywords
                    ? meta.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
                    : [],
                next: meta.next
                    ? meta.next.split(',').map(k => k.trim()).filter(Boolean)
                    : [],
                content: body,
                fileName,
                builtin,
            });
        } catch (err) {
            console.warn(`[AI Skills] Error reading skill ${entry.name}:`, err.message);
        }
    }

    return skills;
}

/**
 * Resolve the directory that ships the built-in starter skills.
 *   - Packaged app: <resources>/builtin-skills  (via electron-builder extraResources)
 *   - Dev:          <repo root>/agent/skills
 */
function getBuiltinSkillsDir() {
    if (process.resourcesPath) {
        const packaged = path.join(process.resourcesPath, 'builtin-skills');
        if (fs.existsSync(packaged)) return packaged;
    }
    // Dev fallback: skills.js lives in server/ai/, repo root is two levels up.
    return path.join(__dirname, '..', '..', 'agent', 'skills');
}

let builtinCache = null;

/**
 * Load the built-in starter skills that ship with AmoxSQL. Cached for the
 * process lifetime (they don't change at runtime).
 */
async function loadBuiltinSkills() {
    if (builtinCache) return builtinCache;
    try {
        builtinCache = await readSkillsDir(getBuiltinSkillsDir(), true);
    } catch (err) {
        console.warn('[AI Skills] Error loading built-in skills:', err.message);
        builtinCache = [];
    }
    return builtinCache;
}

/**
 * Load all skills available for a project: the built-in starter set plus any
 * skills in the project's own agent/skills/ directory. Project skills override
 * built-ins with the same id.
 */
async function loadSkills(projectPath) {
    const builtins = await loadBuiltinSkills();

    let projectSkills = [];
    if (projectPath) {
        const skillsDir = path.join(projectPath, 'agent', 'skills');
        try {
            if (fs.existsSync(skillsDir)) {
                const dirStat = await fs.promises.stat(skillsDir);
                const cached = cache.get(projectPath);
                if (cached && cached.mtime >= dirStat.mtimeMs) {
                    projectSkills = cached.skills;
                } else {
                    projectSkills = await readSkillsDir(skillsDir, false);
                    cache.set(projectPath, { skills: projectSkills, mtime: dirStat.mtimeMs });
                }
            }
        } catch (err) {
            console.warn('[AI Skills] Error loading project skills:', err.message);
        }
    }

    // Merge: built-ins first, project skills override by id.
    const byId = new Map();
    for (const s of builtins) byId.set(s.id, s);
    for (const s of projectSkills) byId.set(s.id, s);
    return Array.from(byId.values());
}

/**
 * Get a single skill by ID.
 */
async function getSkill(projectPath, skillId) {
    const skills = await loadSkills(projectPath);
    return skills.find(s => s.id === skillId) || null;
}

/**
 * Match a skill to a user message using keyword scoring.
 * Returns { skillId, skillName, confidence } or null if no good match.
 * confidence is 0.0–1.0. Threshold for auto-activation: 0.5.
 *
 * Scoring: for each keyword in (skill.keywords ∪ description words), count
 * how many appear in the message. Normalize by sqrt(keyword count) so skills
 * with many keywords don't dominate unfairly.
 */
function matchSkillByIntent(userMessage, skills) {
    if (!userMessage || !skills.length) return null;

    const msg = userMessage.toLowerCase();

    let best = null;
    let bestScore = 0;

    for (const skill of skills) {
        // Combine explicit keywords with long words from description
        const descWords = skill.description
            .toLowerCase()
            .split(/\W+/)
            .filter(w => w.length > 4);
        const allKeywords = [...new Set([...skill.keywords, ...descWords])];
        if (allKeywords.length === 0) continue;

        let matches = 0;
        for (const kw of allKeywords) {
            if (msg.includes(kw)) matches++;
        }

        const score = matches / Math.sqrt(allKeywords.length);
        if (score > bestScore) {
            bestScore = score;
            best = skill;
        }
    }

    if (!best || bestScore < 0.25) return null;

    return {
        skillId: best.id,
        skillName: best.name,
        confidence: Math.min(1.0, +(bestScore).toFixed(2)),
    };
}

/**
 * Invalidate the cache for a project (call when skill files change).
 */
function invalidateCache(projectPath) {
    cache.delete(projectPath);
}

module.exports = { loadSkills, loadBuiltinSkills, getSkill, matchSkillByIntent, invalidateCache };
