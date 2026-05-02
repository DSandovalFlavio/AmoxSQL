/**
 * AmoxSQL — Git Manager (MVP)
 * Wraps simple-git for local operations only (no push/pull).
 * All public methods return plain JS objects safe for JSON serialization.
 */
const simpleGit = require('simple-git');
const path       = require('path');
const fs         = require('fs');

// ─── .gitignore template ──────────────────────────────────────────────────────
const GITIGNORE_TEMPLATE = `# AmoxSQL — generated .gitignore
# ── DuckDB files (binary, large) ──
*.duckdb
*.db
*.duckdb.wal

# ── AmoxSQL internal state ──
.amoxsql/

# ── Data files (often large, machine-specific) ──
data/

# ── Export outputs ──
exports/

# ── Node.js (if server-side code lives here) ──
node_modules/
.env

# ── OS junk ──
.DS_Store
Thumbs.db
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a configured simple-git instance for `dir`.
 * Does NOT verify that a repo exists — callers must handle errors.
 */
function git(dir) {
    return simpleGit({ baseDir: dir, binary: 'git', maxConcurrentProcesses: 2 });
}

/**
 * Parse `git status --porcelain=v1` output into an array of file status objects.
 * Each object: { path, status, staged: bool, untracked: bool }
 */
function parseStatusFiles(statusResult) {
    return statusResult.files.map(f => ({
        path:      f.path,
        from:      f.from || null,
        status:    f.working_dir || f.index || '?',
        staged:    !!f.index && f.index !== ' ',
        untracked: f.index === '?' && f.working_dir === '?',
    }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether git is available on the system.
 */
async function isGitAvailable() {
    try {
        await simpleGit().version();
        return true;
    } catch {
        return false;
    }
}

/**
 * Check whether `dir` is inside a git repository.
 */
async function isRepo(dir) {
    try {
        const g = git(dir);
        const isRepo = await g.checkIsRepo();
        return isRepo;
    } catch {
        return false;
    }
}

/**
 * Initialize a new git repository in `dir`.
 * Also writes a .gitignore if one doesn't exist.
 * Returns { success, branch, gitignoreCreated }
 */
async function initRepo(dir) {
    const g = git(dir);
    await g.init();

    let gitignoreCreated = false;
    const gitignorePath = path.join(dir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, GITIGNORE_TEMPLATE, 'utf8');
        gitignoreCreated = true;
    }

    // Get branch name after init
    let branch = 'main';
    try {
        const br = await g.branch();
        branch = br.current || 'main';
    } catch {}

    return { success: true, branch, gitignoreCreated };
}

/**
 * Returns the current status of the repo.
 * { isRepo, branch, ahead, behind, files: [...] }
 */
async function getStatus(dir) {
    const g = git(dir);
    const statusResult = await g.status();
    return {
        branch:  statusResult.current || 'HEAD',
        ahead:   statusResult.ahead  || 0,
        behind:  statusResult.behind || 0,
        files:   parseStatusFiles(statusResult),
        isClean: statusResult.isClean(),
    };
}

/**
 * Stage one or more files. `files` is an array of paths relative to `dir`.
 */
async function stageFiles(dir, files) {
    const g = git(dir);
    await g.add(files);
    return { success: true };
}

/**
 * Unstage (reset HEAD) one or more files.
 */
async function unstageFiles(dir, files) {
    const g = git(dir);
    await g.reset(['HEAD', '--', ...files]);
    return { success: true };
}

/**
 * Commit staged changes. Returns the short commit hash.
 */
async function commit(dir, message, { amend = false } = {}) {
    if (!amend && (!message || !message.trim())) throw new Error('Commit message is required');
    const g = git(dir);
    const opts = amend ? ['--amend'] : [];
    if (message && message.trim()) opts.push('-m', message.trim());
    const result = await g.commit(message?.trim() || '', opts);
    return { success: true, hash: result.commit, summary: result.summary };
}

/**
 * Returns a unified diff for a file.
 * If `staged` is true, returns the staged diff (index vs HEAD).
 * Otherwise returns the working tree diff.
 */
async function getDiff(dir, filePath, staged = false) {
    const g = git(dir);
    const args = staged
        ? ['--cached', '--', filePath]
        : ['--', filePath];
    const diff = await g.diff(args);
    return { diff };
}

/**
 * Returns the recent commit log (default last 50).
 */
async function getLog(dir, limit = 50) {
    const g = git(dir);
    try {
        const log = await g.log({ maxCount: limit });
        return {
            commits: (log.all || []).map(c => ({
                hash:    c.hash,
                message: c.message,
                author:  c.author_name,
                date:    c.date,
            })),
        };
    } catch (err) {
        // Log fails if there are no commits yet (empty repo)
        return { commits: [] };
    }
}

/**
 * Returns branch information: current branch + list of all local branches.
 */
async function getBranches(dir) {
    const g = git(dir);
    try {
        const br = await g.branch(['-v']);
        return {
            current:  br.current,
            branches: Object.values(br.branches).map(b => ({
                name:    b.name,
                current: b.current,
                commit:  b.commit,
                label:   b.label,
            })),
        };
    } catch (err) {
        // Fails if there are no commits
        return { current: null, branches: [] };
    }
}

/**
 * Create a new branch and optionally check it out.
 */
async function createBranch(dir, branchName, checkout = true) {
    const g = git(dir);
    if (checkout) {
        await g.checkoutLocalBranch(branchName);
    } else {
        await g.branch([branchName]);
    }
    return { success: true, branch: branchName };
}

/**
 * Checkout an existing branch.
 */
async function checkoutBranch(dir, branchName) {
    const g = git(dir);
    await g.checkout(branchName);
    return { success: true, branch: branchName };
}

/**
 * Discard working-tree changes for one or more files.
 * For untracked files, deletes them. For modified files, restores from HEAD.
 */
async function discardChanges(dir, files) {
    const g = git(dir);
    const status = await g.status();
    const untracked = [];
    const tracked = [];

    for (const filePath of files) {
        const entry = status.files.find(f => f.path === filePath);
        if (entry && entry.index === '?' && entry.working_dir === '?') {
            untracked.push(filePath);
        } else {
            tracked.push(filePath);
        }
    }

    // Restore tracked files
    if (tracked.length > 0) {
        await g.checkout(['--', ...tracked]);
    }

    // Delete untracked files
    for (const f of untracked) {
        const fullPath = path.join(dir, f);
        if (fs.existsSync(fullPath)) {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(fullPath);
            }
        }
    }

    return { success: true, discarded: files.length };
}

/**
 * Delete a local branch. Cannot delete current branch.
 */
async function deleteBranch(dir, branchName, force = false) {
    const g = git(dir);
    const flag = force ? '-D' : '-d';
    await g.branch([flag, branchName]);
    return { success: true };
}

/**
 * Stash current changes.
 */
async function stash(dir, message) {
    const g = git(dir);
    const args = message ? ['push', '-m', message] : ['push'];
    await g.stash(args);
    return { success: true };
}

/**
 * Pop the latest stash.
 */
async function stashPop(dir) {
    const g = git(dir);
    await g.stash(['pop']);
    return { success: true };
}

/**
 * List stashes.
 */
async function getStashList(dir) {
    const g = git(dir);
    const result = await g.stashList();
    return {
        stashes: (result.all || []).map(s => ({
            index: s.hash,
            message: s.message,
            date: s.date,
        })),
    };
}

module.exports = {
    isGitAvailable,
    isRepo,
    initRepo,
    getStatus,
    stageFiles,
    unstageFiles,
    commit,
    getDiff,
    getLog,
    getBranches,
    createBranch,
    checkoutBranch,
    discardChanges,
    deleteBranch,
    stash,
    stashPop,
    getStashList,
    GITIGNORE_TEMPLATE,
};
