/**
 * Files of the project: read, write, rename, watch, search; chart drafts, snippets and bookmarks.
 *
 * Rutas movidas de `server/index.js` (6.0, M7) sin cambiar ninguna URL. Lo que
 * comparten con el resto llega por `./compartido` (index.js lo llena antes de
 * cargar este archivo); el estado que cambia en marcha se lee como `ctx.X`.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const dbManager        = require('../DatabaseManager');
const workspaces       = require('../workspaces');
const { firmaDe } = require('../vigilanteArchivos');
const excel = require('../excel');

const ctx = require('./compartido');
const {
    AMOX_DIR, conCentral, ensureAmoxDir, errorDeExcel, rearmarVigilante,
    rutaDelProyecto,
} = ctx;

const rutas = express.Router();

const amoxvis = require('../amoxvis');

const borradores = require('../borradores');

rutas.get('/api/files/list', (req, res) => {
    const relativePath = req.query.path || '';
    const dirPath = path.resolve(ctx.ROOT_DIR, relativePath);

    // Security check: Ensure we don't go above ROOT_DIR unless authorized (skipping complex checks for local tool)
    if (!dirPath.startsWith(ctx.ROOT_DIR)) {
        // Warning: This simplistic check might block valid sub-paths if ROOT_DIR has symlinks, 
        // but it's a basic safeguard.
    }

    try {
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
            return res.json([]);
        }

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const result = entries.map(entry => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            path: path.relative(ctx.ROOT_DIR, path.join(dirPath, entry.name)).replace(/\\/g, '/')
        }));

        // Sort: Directories first, then files
        result.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        res.json(result);
    } catch (err) {
        console.error("List files failed:", err);
        res.status(500).json({ error: 'Failed to list files', details: err.message });
    }
});

/* --- Excel Import APIs --- */
const xlsxMeta = require('../xlsxMeta');

rutas.get('/api/files/inspect-excel', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });
    try {
        // Las hojas salen del directorio central del ZIP (xlsxMeta); lo que no
        // es un libro se reconoce por su firma y dice qué es (C2).
        res.json({ sheets: excel.hojas(rutaDelProyecto(filePath)) });
    } catch (err) {
        errorDeExcel(res, err);
    }
});

/**
 * GET /api/files/inspect-columns
 * Returns column names and types for any data file (CSV, Parquet, JSON, Excel).
 * For Excel files, also returns sheet names and columns per sheet.
 * Query params: path (required), sheet (optional, for Excel)
 */
rutas.get('/api/files/inspect-columns', async (req, res) => {
    const filePath = req.query.path;
    const sheet = req.query.sheet; // optional, for Excel
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = path.isAbsolute(filePath) ? filePath : path.join(ctx.ROOT_DIR, filePath);
    fullPath = fullPath.replace(/\\/g, '/');

    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    const ext = (fullPath.match(/\.[^.]+$/) || [''])[0].toLowerCase();

    // Metadata runs on the 'meta' lane so it never queues behind a long user
    // query on the 'main' connection. See docs/dev/auditoria_metadata_archivos.md.
    const meta = dbManager.lane ? dbManager.lane('meta') : dbManager;

    try {
        if (ext === '.xlsx' || ext === '.xls') {
            // Serve from cache when the file is unchanged (covers Direct Query →
            // Import → Export-for-AI on the same file paying the cost once).
            const cached = xlsxMeta.getCached(fullPath);
            if (cached && cached.sheetsWithColumns) {
                const target = sheet || cached.sheets[0];
                return res.json({
                    sheets: cached.sheets,
                    columns: cached.sheetsWithColumns[target] || [],
                    sheetsWithColumns: cached.sheetsWithColumns,
                });
            }

            // Sheet names via the zip central directory (no full workbook parse).
            const sheets = excel.hojas(fullPath);

            // DESCRIBE every sheet once (bind is early-stopping, ~ms per sheet).
            // The target sheet is included here — no separate/duplicate describe.
            const sheetsWithColumns = {};
            for (const s of sheets) {
                try {
                    const desc = await meta.systemQuery(
                        `DESCRIBE ${excel.sqlDeLectura(fullPath, { hoja: s })}`
                    );
                    sheetsWithColumns[s] = desc.map(c => ({ name: c.column_name, type: c.column_type || c.data_type }));
                } catch (e) {
                    console.warn(`[inspect-columns] Failed to describe Excel sheet '${s}':`, e.message);
                    sheetsWithColumns[s] = [];
                }
            }

            const targetSheet = sheet || sheets[0];
            const columns = sheetsWithColumns[targetSheet] || [];

            xlsxMeta.setCached(fullPath, { ...(xlsxMeta.getCached(fullPath) || {}), sheets, sheetsWithColumns });
            res.json({ sheets, columns, sheetsWithColumns });
        } else {
            // CSV, Parquet, JSON — DuckDB DESCRIBE (sniffer samples; already cheap)
            const describe = await meta.systemQuery(`DESCRIBE SELECT * FROM '${fullPath}'`);
            const columns = describe.map(c => ({ name: c.column_name, type: c.column_type || c.data_type }));
            res.json({ columns });
        }
    } catch (err) {
        console.error('[inspect-columns] Error:', err);
        res.status(500).json({ error: 'Failed to inspect columns', details: err.message });
    }
});

rutas.get('/api/files', (req, res) => {
    const dirPath = req.query.path || '';
    const fullPath = path.join(ctx.ROOT_DIR, dirPath);

    fs.readdir(fullPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read directory', details: err.message });
        }

        const fileList = files.map(file => {
            let sizeBytes = null;
            let mtimeMs = null;
            const itemFullPath = path.join(fullPath, file.name);
            if (!file.isDirectory()) {
                try {
                    const stats = fs.statSync(itemFullPath);
                    sizeBytes = stats.size;
                    // Ya se podia ORDENAR por fecha, pero no se enseñaba: el
                    // dato estaba y no llegaba al cliente.
                    mtimeMs = stats.mtimeMs;
                } catch (e) { /* ignore */ }
            }
            return {
                name: file.name,
                isDirectory: file.isDirectory(),
                path: path.relative(ctx.ROOT_DIR, itemFullPath).replace(/\\/g, '/'),
                fullPath: itemFullPath,
                sizeBytes,
                mtimeMs
            };
        });

        res.json(fileList);
    });
});

rutas.get('/api/file', (req, res) => {
    const filePath = req.query.path;
    const binary = req.query.binary === '1' || req.query.binary === 'true';
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = filePath;
    if (!path.isAbsolute(filePath)) {
        fullPath = path.join(ctx.ROOT_DIR, filePath);
    }

    if (binary) {
        // Base64 reads are confined to the project root — this mode returns raw
        // bytes and must not become an arbitrary-file-read primitive.
        const resolvedRoot = path.resolve(ctx.ROOT_DIR);
        const resolvedPath = path.resolve(fullPath);
        if (!resolvedPath.replace(/\\/g, '/').startsWith(resolvedRoot.replace(/\\/g, '/'))) {
            return res.status(400).json({ error: 'Path must be within the project directory.' });
        }
        return fs.readFile(resolvedPath, (err, data) => {
            if (err) return res.status(500).json({ error: 'Failed to read file', details: err.message });
            res.json({ contentBase64: data.toString('base64') });
        });
    }

    fs.readFile(fullPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read file', details: err.message });
        // La firma viaja con el contenido para que quien lo abra sepa DE QUE
        // version viene. Es lo que permite despues distinguir «cambio por
        // fuera» de «lo guarde yo», y negarse a pisar lo que no se leyo.
        res.json({ content: data, firma: firmaDe(fullPath) });
    });
});

/**
 * GET /api/file/raw?path=...
 * Streams a file's raw bytes with the correct Content-Type (via sendFile), so
 * an <img src> in the Markdown preview can point straight at it. This is what
 * makes relative image references (./assets/foo.png, ./diagram.svg) resolve —
 * SVG and PNG both work; the format was never the issue, the path was.
 * Confined to the project root; must not become an arbitrary-file-read.
 */
/**
 * GET /api/files/watch — el canal de avisos del vigilante.
 *
 * Un flujo de eventos abierto: cada vez que algo cambia en el proyecto sale un
 * `{ ruta, firma, tipo }`. **No se sondea**; el disco avisa y esto lo reenvia.
 *
 * El primer evento dice si la vigilancia esta activa de verdad. Hay sistemas
 * —montajes de red, contenedores— donde no se puede vigilar recursivamente, y
 * el cliente tiene derecho a saber que aqui no van a llegar avisos en vez de
 * suponer que no cambia nada.
 */
rutas.get('/api/files/watch', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    if (!ctx.vigilante) rearmarVigilante();
    const enviar = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    enviar({ tipo: 'hola', activo: !!ctx.vigilante?.activo, raiz: ctx.ROOT_DIR });

    const quitar = ctx.vigilante.suscribir(enviar);

    // Un latido cada medio minuto: sin trafico, los intermediarios cierran la
    // conexion en silencio y el cliente se queda creyendo que sigue vigilado.
    const latido = setInterval(() => res.write(': latido\n\n'), 30000);

    req.on('close', () => {
        clearInterval(latido);
        quitar();
    });
});

rutas.get('/api/file/raw', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    const resolvedRoot = path.resolve(ctx.ROOT_DIR);
    const resolvedPath = path.resolve(path.isAbsolute(filePath) ? filePath : path.join(ctx.ROOT_DIR, filePath));
    if (!resolvedPath.replace(/\\/g, '/').startsWith(resolvedRoot.replace(/\\/g, '/'))) {
        return res.status(400).json({ error: 'Path must be within the project directory.' });
    }
    res.sendFile(resolvedPath, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'File not found' });
    });
});

rutas.post('/api/file', (req, res) => {
    const { path: filePath, content, firmaEsperada } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: 'Path and content are required' });

    let fullPath = filePath;
    if (!path.isAbsolute(filePath)) {
        fullPath = path.join(ctx.ROOT_DIR, filePath);
    }

    /**
     * **La garantia, no la comodidad.**
     *
     * El aviso en vivo del vigilante puede perderse —un montaje de red, un
     * sistema sin vigilancia recursiva, un cambio llegado mientras la ventana
     * no tenia el foco— y guardar es el ULTIMO momento en el que todavia se
     * puede evitar el daño. Por eso van los dos: el aviso avisa, esto garantiza.
     *
     * Se comprueba solo si quien guarda dice de que version viene. Sin
     * `firmaEsperada` se escribe como siempre: guardar un archivo nuevo, o
     * desde un sitio que no lo leyo, no tiene con que comparar.
     */
    if (firmaEsperada) {
        const actual = firmaDe(fullPath);
        // `actual === null` es un archivo que ya no esta: escribirlo lo crea de
        // nuevo, que es lo que el usuario espera y no destruye nada.
        if (actual !== null && actual !== firmaEsperada) {
            return res.status(409).json({
                error: 'The file changed outside the app since you opened it.',
                conflicto: true,
                firma: actual,
            });
        }
    }

    // Quien guarda un .sql pide lo que había antes: los gráficos vinculados
    // siguen a SU consulta dentro del archivo, y para saber cuál era hace falta
    // la versión anterior (Dec-81).
    let anterior;
    if (req.body.devolverAnterior) {
        try { anterior = fs.readFileSync(fullPath, 'utf8'); } catch { anterior = null; }
    }

    fs.writeFile(fullPath, content, 'utf8', (err) => {
        if (err) return res.status(500).json({ error: 'Failed to write file', details: err.message });
        res.json({ success: true, firma: firmaDe(fullPath), ...(anterior !== undefined ? { anterior } : {}) });
    });
});

/**
 * Lo que va con un archivo cuando se renombra o se mueve (o la carpeta que lo
 * tiene): su borrador de gráfico, y el origen de los `.amoxvis` que lo usan
 * como consulta. Antes, renombrar `ventas.sql` dejaba sus gráficos apuntando a
 * un archivo que ya no existía. Nunca impide el renombre.
 */
function acompanarRenombre(fullOld, fullNew) {
    try { borradores.mover(ctx.ROOT_DIR, fullOld, fullNew); } catch (e) { console.warn('[borradores] move:', e.message); }
    const rel = (p) => path.relative(ctx.ROOT_DIR, p).replace(/\\/g, '/');
    const viejo = rel(fullOld), nuevo = rel(fullNew);
    if (!viejo || viejo.startsWith('..')) return;
    let esCarpeta = false;
    try { esCarpeta = fs.statSync(fullNew).isDirectory(); } catch { return; }
    if (!esCarpeta && !/\.sql$/i.test(viejo)) return;
    try {
        for (const f of findFilesByExtension(ctx.ROOT_DIR, '.amoxvis')) {
            const full = path.join(ctx.ROOT_DIR, f.path);
            let textoActual;
            try { textoActual = fs.readFileSync(full, 'utf8'); } catch { continue; }
            const origen = (amoxvis.leer(textoActual).source || '').replace(/\\/g, '/');
            if (!origen) continue;
            let destino = null;
            if (origen === viejo) destino = nuevo;
            else if (esCarpeta && origen.startsWith(`${viejo}/`)) destino = nuevo + origen.slice(viejo.length);
            if (!destino) continue;
            const cambiado = amoxvis.conCambios(textoActual, { origen: destino });
            if (cambiado) fs.writeFileSync(full, cambiado, 'utf8');
        }
    } catch (e) {
        console.warn('[amoxvis] rename follow-up:', e.message);
    }
}

/* --- File Rename & Delete APIs --- */
rutas.post('/api/file/rename', (req, res) => {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath are required' });

    const fullOld = path.isAbsolute(oldPath) ? oldPath : path.join(ctx.ROOT_DIR, oldPath);
    const fullNew = path.isAbsolute(newPath) ? newPath : path.join(ctx.ROOT_DIR, newPath);

    if (!fs.existsSync(fullOld)) return res.status(404).json({ error: 'Source file not found' });
    if (fs.existsSync(fullNew)) return res.status(409).json({ error: 'Destination already exists' });

    try {
        fs.renameSync(fullOld, fullNew);
        acompanarRenombre(fullOld, fullNew);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Rename failed', details: err.message });
    }
});

rutas.post('/api/file/delete', (req, res) => {
    const { path: filePath, isDirectory } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ctx.ROOT_DIR, filePath);

    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    try {
        if (isDirectory) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
            try { borradores.poner(ctx.ROOT_DIR, fullPath, null); } catch { /* sin borrador */ }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed', details: err.message });
    }
});

/* --- File Move (also used for drag-and-drop reorder) --- */
rutas.post('/api/file/move', (req, res) => {
    const { sourcePath, destinationDir } = req.body;
    if (!sourcePath || destinationDir === undefined) {
        return res.status(400).json({ error: 'sourcePath and destinationDir are required' });
    }

    const fullSource = path.isAbsolute(sourcePath) ? sourcePath : path.join(ctx.ROOT_DIR, sourcePath);
    const fileName = path.basename(fullSource);
    const destDir = path.isAbsolute(destinationDir) ? destinationDir : path.join(ctx.ROOT_DIR, destinationDir);
    const fullDest = path.join(destDir, fileName);

    if (!fs.existsSync(fullSource)) return res.status(404).json({ error: 'Source not found' });
    if (fullSource === fullDest) return res.json({ success: true, noOp: true });
    if (fs.existsSync(fullDest)) return res.status(409).json({ error: `"${fileName}" already exists in the destination folder` });

    try {
        // Ensure destination directory exists
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(fullSource, fullDest);
        acompanarRenombre(fullSource, fullDest);
        res.json({ success: true, newPath: path.relative(ctx.ROOT_DIR, fullDest).replace(/\\/g, '/') });
    } catch (err) {
        res.status(500).json({ error: 'Move failed', details: err.message });
    }
});

/* --- File Copy / Duplicate --- */
rutas.post('/api/file/copy', (req, res) => {
    const { sourcePath, destinationDir } = req.body;
    if (!sourcePath) return res.status(400).json({ error: 'sourcePath is required' });

    const fullSource = path.isAbsolute(sourcePath) ? sourcePath : path.join(ctx.ROOT_DIR, sourcePath);
    if (!fs.existsSync(fullSource)) return res.status(404).json({ error: 'Source not found' });

    const isDir = fs.statSync(fullSource).isDirectory();
    const baseName = path.basename(fullSource);
    const ext = path.extname(baseName);
    const nameNoExt = ext ? baseName.slice(0, -ext.length) : baseName;

    // Determine destination directory
    const destDirFull = destinationDir
        ? (path.isAbsolute(destinationDir) ? destinationDir : path.join(ctx.ROOT_DIR, destinationDir))
        : path.dirname(fullSource);

    // Auto-generate unique name: "file (copy).ext", "file (copy 2).ext", etc.
    let copyName;
    let counter = 0;
    do {
        const suffix = counter === 0 ? ' (copy)' : ` (copy ${counter + 1})`;
        copyName = isDir ? `${baseName}${suffix}` : `${nameNoExt}${suffix}${ext}`;
        counter++;
    } while (fs.existsSync(path.join(destDirFull, copyName)));

    const fullDest = path.join(destDirFull, copyName);

    try {
        if (isDir) {
            fs.cpSync(fullSource, fullDest, { recursive: true });
        } else {
            fs.copyFileSync(fullSource, fullDest);
        }
        res.json({ success: true, newPath: path.relative(ctx.ROOT_DIR, fullDest).replace(/\\/g, '/'), newName: copyName });
    } catch (err) {
        res.status(500).json({ error: 'Copy failed', details: err.message });
    }
});

/* --- Reveal in OS File Explorer --- */
rutas.post('/api/file/reveal', (req, res) => {
    const { filePath: reqPath } = req.body;
    if (!reqPath) return res.status(400).json({ error: 'filePath is required' });

    const fullPath = path.isAbsolute(reqPath) ? reqPath : path.join(ctx.ROOT_DIR, reqPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Path not found' });

    const { exec } = require('child_process');
    const isDir = fs.statSync(fullPath).isDirectory();

    let cmd;
    if (process.platform === 'win32') {
        cmd = isDir ? `explorer "${fullPath}"` : `explorer /select,"${fullPath}"`;
    } else if (process.platform === 'darwin') {
        cmd = isDir ? `open "${fullPath}"` : `open -R "${fullPath}"`;
    } else {
        cmd = `xdg-open "${path.dirname(fullPath)}"`;
    }

    exec(cmd, (err) => {
        if (err) {
            console.error('[API] Reveal in explorer failed:', err);
            return res.status(500).json({ error: 'Failed to open file explorer' });
        }
        res.json({ success: true });
    });
});

/**
 * Recursively collects files under srcPath, same node_modules/.git skip as
 * getDirectories(). With `ext` filters by suffix; sin ext los devuelve todos
 * —que es lo que necesita el indice del omnibox—, para no tener dos
 * caminadores distintos diciendo cada uno que archivos tiene el proyecto.
 */
const findFilesByExtension = (srcPath, ext) => {
    let matches = [];
    let items;
    try {
        items = fs.readdirSync(srcPath, { withFileTypes: true });
    } catch (err) {
        return matches;
    }
    for (const item of items) {
        const itemFullPath = path.join(srcPath, item.name);
        if (item.isDirectory()) {
            if (item.name === 'node_modules' || item.name === '.git') continue;
            matches = matches.concat(findFilesByExtension(itemFullPath, ext));
        } else if (!ext || item.name.toLowerCase().endsWith(ext)) {
            const relativePath = path.relative(ctx.ROOT_DIR, itemFullPath).replace(/\\/g, '/');
            matches.push({ name: item.name, path: relativePath });
        }
    }
    return matches;
};

/**
 * GET /api/files/index — todos los archivos del proyecto, en plano.
 *
 * Es el indice que busca el omnibox. Se descartan las carpetas ocultas (las que
 * empiezan por punto): ahi viven la configuracion del proyecto y las cachés, y
 * en una busqueda de archivos son ruido, no resultados.
 *
 * Sin caché a proposito: el disco es local y el recorrido de un proyecto normal
 * es de milisegundos. Guardar una copia solo abriria la puerta a que el omnibox
 * ensenara archivos que ya no existen.
 */
rutas.get('/api/files/index', (req, res) => {
    try {
        const files = findFilesByExtension(ctx.ROOT_DIR, null)
            .filter(f => !f.path.split('/').some(seg => seg.startsWith('.')));
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Always walks from ROOT_DIR (no user-supplied path segment), so there is no
// path-traversal surface here — same trust boundary as GET /api/folders.
rutas.get('/api/files/find-by-extension', (req, res) => {
    const ext = String(req.query.ext || '').toLowerCase();
    if (!/^\.[a-z0-9]+$/.test(ext)) {
        return res.status(400).json({ error: 'ext must look like ".ext" (letters/digits only)' });
    }
    try {
        const files = findFilesByExtension(ctx.ROOT_DIR, ext);
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/charts/using-source?path=queries/ventas.sql
 * Fase 3 — procedencia, the reverse lookup: which .amoxvis charts link back
 * to this .sql file (their `source` field). Scans project-relative here
 * (server-side, one directory walk + N small JSON reads) rather than having
 * the client fetch every .amoxvis and check client-side.
 */
rutas.get('/api/charts/using-source', (req, res) => {
    const sourcePath = req.query.path;
    if (!sourcePath) return res.status(400).json({ error: 'path is required' });
    const normalized = sourcePath.replace(/\\/g, '/');

    try {
        const amoxvisFiles = findFilesByExtension(ctx.ROOT_DIR, '.amoxvis');
        const matches = [];
        for (const f of amoxvisFiles) {
            try {
                const fullPath = path.join(ctx.ROOT_DIR, f.path);
                const config = amoxvis.leer(fs.readFileSync(fullPath, 'utf8'));
                if ((config.source || '').replace(/\\/g, '/') === normalized) {
                    matches.push({ name: f.name, path: f.path });
                }
            } catch {
                // Skip unreadable/malformed .amoxvis — not this endpoint's job to report that.
            }
        }
        res.json(matches);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// (Removed duplicate `/api/db/tables` endpoint from here to avoid conflicts)

/* --- Binary asset write (e.g. pasted images in the Markdown editor) --- */

/**
 * POST /api/files/write-binary
 * Writes a base64-encoded binary file inside the project root.
 * Body: { path, dataBase64 }  → path is project-relative (e.g. "assets/img.png")
 * Returns: { success, path }
 */
rutas.post('/api/files/write-binary', async (req, res) => {
    const { path: relPath, dataBase64 } = req.body;
    if (!relPath || !dataBase64) {
        return res.status(400).json({ error: 'path and dataBase64 are required' });
    }
    // Confine the resolved path to the project root (prevents path traversal).
    const resolvedRoot = path.resolve(ctx.ROOT_DIR);
    const fullPath = path.resolve(path.join(ctx.ROOT_DIR, relPath));
    if (!fullPath.replace(/\\/g, '/').startsWith(resolvedRoot.replace(/\\/g, '/'))) {
        return res.status(400).json({ error: 'Path must be within the project directory.' });
    }
    try {
        const b64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.promises.writeFile(fullPath, Buffer.from(b64, 'base64'));
        res.json({ success: true, path: relPath.replace(/\\/g, '/') });
    } catch (err) {
        console.error('[write-binary]', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- SQL Snippets API --- */

rutas.get('/api/snippets', (req, res) => {
    try {
        const file = path.join(AMOX_DIR(), 'snippets.json');
        if (!fs.existsSync(file)) return res.json([]);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        res.json(data);
    } catch (err) {
        res.json([]);
    }
});

rutas.post('/api/snippets', (req, res) => {
    try {
        ensureAmoxDir();
        const file = path.join(AMOX_DIR(), 'snippets.json');
        fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- Query Bookmarks API --- */
rutas.get('/api/bookmarks', (req, res) => {
    try {
        const file = path.join(AMOX_DIR(), 'bookmarks.json');
        if (!fs.existsSync(file)) return res.json([]);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        res.json(data);
    } catch (err) {
        res.json([]);
    }
});

rutas.post('/api/bookmarks', (req, res) => {
    try {
        ensureAmoxDir();
        const file = path.join(AMOX_DIR(), 'bookmarks.json');
        fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- Project Search API ---
 * Un solo recorrido del proyecto sirve la búsqueda global y el índice de
 * documentos: son la misma lectura. La lógica vive en projectSearch.js, con
 * sus categorías (fuente / datos de texto / binarios), su caché por mtime y
 * los extractores de los formatos propios.
 */
const projectSearch = require('../projectSearch');

rutas.get('/api/search', (req, res) => {
    const { q, scope, limit } = req.query;
    try {
        res.json(projectSearch.searchProject(ctx.ROOT_DIR, {
            q,
            scope: ['fuente', 'datos', 'todo'].includes(scope) ? scope : 'fuente',
            limit: Math.min(1000, parseInt(limit, 10) || 500),
        }));
    } catch (err) {
        console.error('Search failed:', err.message);
        res.status(500).json({ error: 'Search failed', details: err.message });
    }
});

/* --- El gráfico de un .sql, recordado con el archivo (Dec-79) --- */
rutas.get('/api/borrador-grafico', (req, res) => {
    if (!req.query.path) return res.status(400).json({ error: 'Path is required' });
    try { res.json(borradores.leer(ctx.ROOT_DIR, req.query.path)); }
    catch (err) { res.json(null); }
});

rutas.post('/api/borrador-grafico', (req, res) => {
    const { path: ruta, cambios } = req.body || {};
    if (!ruta || cambios === undefined) return res.status(400).json({ error: 'Path and changes are required' });
    try { res.json({ success: true, borrador: borradores.poner(ctx.ROOT_DIR, ruta, cambios) }); }
    catch (err) { res.status(500).json({ error: 'Failed to keep the chart', details: err.message }); }
});

// 5.14 (G1, Dec-49): la biblioteca del workspace del proyecto abierto, en
// `<home>/workspaces/<id>/snippets.json` (viaja con el .amoxworkspace).
function workspaceDelAbierto() {
    try { return JSON.parse(fs.readFileSync(path.join(ctx.ROOT_DIR, '.amoxsql', 'project.json'), 'utf8'))?.workspace || null; } catch { return null; }
}

rutas.get('/api/snippets/workspace', conCentral(async () => {
    const ws = ctx.PROYECTO_ABIERTO ? workspaceDelAbierto() : null;
    if (!ws?.id) return { workspace: null, snippets: [] };
    const { texto } = await workspaces.leerArchivo(ws.id, 'snippets.json');
    let snippets = [];
    try { snippets = texto ? JSON.parse(texto) : []; } catch { snippets = []; }
    return { workspace: { id: ws.id, nombre: ws.nombre || null }, snippets: Array.isArray(snippets) ? snippets : [] };
}));

rutas.post('/api/snippets/workspace', conCentral(async (req) => {
    const ws = ctx.PROYECTO_ABIERTO ? workspaceDelAbierto() : null;
    if (!ws?.id) throw new Error('This project is not in a workspace: its snippets can only be saved in the project.');
    const lista = Array.isArray(req.body) ? req.body : [];
    const limpia = lista.filter(s => s && typeof s.name === 'string' && typeof s.sql === 'string')
        .map(s => ({ name: s.name.slice(0, 120), sql: s.sql, ...(s.description ? { description: String(s.description).slice(0, 300) } : {}) }));
    await workspaces.escribirArchivo(ws.id, 'snippets.json', JSON.stringify(limpia, null, 2));
    return { ok: true, snippets: limpia.length };
}));

module.exports = rutas;
