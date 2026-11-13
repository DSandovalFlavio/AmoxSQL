/**
 * Git: estado, diferencias, ramas, commits.
 *
 * Rutas movidas de `server/index.js` (6.0, M7) sin cambiar ninguna URL. Lo que
 * comparten con el resto llega por `./compartido` (index.js lo llena antes de
 * cargar este archivo); el estado que cambia en marcha se lee como `ctx.X`.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const gitManager = require('../git/gitManager');

const ctx = require('./compartido');

const rutas = express.Router();

rutas.get('/api/git/available', async (req, res) => {
    try {
        const available = await gitManager.isGitAvailable();
        res.json({ available });
    } catch (err) {
        res.json({ available: false });
    }
});

rutas.get('/api/git/status', async (req, res) => {
    try {
        const isRepo = await gitManager.isRepo(ctx.ROOT_DIR);
        if (!isRepo) return res.json({ isRepo: false });
        const status = await gitManager.getStatus(ctx.ROOT_DIR);
        res.json({ isRepo: true, ...status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/git/init', async (req, res) => {
    try {
        const result = await gitManager.initRepo(ctx.ROOT_DIR);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/git/stage', async (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0)
        return res.status(400).json({ error: 'files array required' });
    try {
        const result = await gitManager.stageFiles(ctx.ROOT_DIR, files);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/git/unstage', async (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0)
        return res.status(400).json({ error: 'files array required' });
    try {
        const result = await gitManager.unstageFiles(ctx.ROOT_DIR, files);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/git/commit', async (req, res) => {
    const { message, amend } = req.body;
    if (!amend && !message) return res.status(400).json({ error: 'message required' });
    try {
        const result = await gitManager.commit(ctx.ROOT_DIR, message, { amend: !!amend });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.get('/api/git/diff', async (req, res) => {
    const { file, staged } = req.query;
    if (!file) return res.status(400).json({ error: 'file param required' });
    try {
        const result = await gitManager.getDiff(ctx.ROOT_DIR, file, staged === 'true');
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.get('/api/git/log', async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    try {
        const isRepo = await gitManager.isRepo(ctx.ROOT_DIR);
        if (!isRepo) return res.json({ commits: [] });
        const result = await gitManager.getLog(ctx.ROOT_DIR, limit);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.get('/api/git/branches', async (req, res) => {
    try {
        const isRepo = await gitManager.isRepo(ctx.ROOT_DIR);
        if (!isRepo) return res.json({ current: null, branches: [] });
        const result = await gitManager.getBranches(ctx.ROOT_DIR);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/git/branch', async (req, res) => {
    const { name, checkout = true } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
        const result = await gitManager.createBranch(ctx.ROOT_DIR, name, checkout);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/git/checkout', async (req, res) => {
    const { branch } = req.body;
    if (!branch) return res.status(400).json({ error: 'branch required' });
    try {
        const result = await gitManager.checkoutBranch(ctx.ROOT_DIR, branch);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/git/discard', async (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0)
        return res.status(400).json({ error: 'files array required' });
    try {
        const result = await gitManager.discardChanges(ctx.ROOT_DIR, files);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/git/branch/delete', async (req, res) => {
    const { name, force = false } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
        const result = await gitManager.deleteBranch(ctx.ROOT_DIR, name, force);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/git/stash', async (req, res) => {
    try {
        const result = await gitManager.stash(ctx.ROOT_DIR, req.body.message);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/git/stash/pop', async (req, res) => {
    try {
        const result = await gitManager.stashPop(ctx.ROOT_DIR);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.get('/api/git/stash/list', async (req, res) => {
    try {
        const result = await gitManager.getStashList(ctx.ROOT_DIR);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- Add to .gitignore --- */
rutas.post('/api/git/ignore', (req, res) => {
    const { pattern } = req.body;
    if (!pattern) return res.status(400).json({ error: 'pattern is required' });

    const gitignorePath = path.join(ctx.ROOT_DIR, '.gitignore');

    try {
        let content = '';
        if (fs.existsSync(gitignorePath)) {
            content = fs.readFileSync(gitignorePath, 'utf8');
        }
        // Check if pattern already present
        const lines = content.split(/\r?\n/);
        if (lines.some(line => line.trim() === pattern.trim())) {
            return res.json({ success: true, alreadyExists: true });
        }
        // Append with newline safety
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        fs.writeFileSync(gitignorePath, content + separator + pattern.trim() + '\n', 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update .gitignore', details: err.message });
    }
});

module.exports = rutas;
