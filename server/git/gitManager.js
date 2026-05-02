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
async function commit(dir, message) {
    if (!message || !message.trim()) throw new Error('Commit message is required');
    const g = git(dir);
    const result = await g.commit(message.trim());
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
    const log = await g.log({ maxCount: limit });
    return {
        commits: (log.all || []).map(c => ({
            hash:    c.hash,
            message: c.message,
            author:  c.author_name,
            date:    c.date,
        })),
    };
}

/**
 * Returns branch information: current branch + list of all local branches.
 */
async function getBranches(dir) {
    const g = git(dir);
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
    GITIGNORE_TEMPLATE,
};
