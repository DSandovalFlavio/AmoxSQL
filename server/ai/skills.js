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
 * Load all skills from the project's agent/skills/ directory.
 * Supports two formats:
 *   - Flat:   agent/skills/<id>.md
 *   - Folder: agent/skills/<id>/SKILL.md  (Anthropic Skills canon format)
 *
 * Frontmatter fields:
 *   name        — display name
 *   description — one-line description (used in UI and intent matching)
 *   keywords    — comma-separated keywords for auto-activation scoring
 *   next        — comma-separated skill IDs to suggest after this one completes
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

        const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });
        const skills = [];

        for (const entry of entries) {
            try {
                let raw, id, fileName;

                if (entry.isDirectory()) {
                    // Folder format: agent/skills/<id>/SKILL.md
                    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
                    if (!fs.existsSync(skillFile)) continue;
                    raw = await fs.promises.readFile(skillFile, 'utf8');
                    id = entry.name;
                    fileName = `${entry.name}/SKILL.md`;
                } else if (entry.name.endsWith('.md')) {
                    // Flat format: agent/skills/<id>.md
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
                });
            } catch (err) {
                console.warn(`[AI Skills] Error reading skill ${entry.name}:`, err.message);
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

module.exports = { loadSkills, getSkill, matchSkillByIntent, invalidateCache };
