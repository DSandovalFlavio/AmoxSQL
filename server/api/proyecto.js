/**
 * The project: open, scaffold, its manifest, the .amoxproject package, where you left off, folders.
 *
 * Rutas movidas de `server/index.js` (6.0, M7) sin cambiar ninguna URL. Lo que
 * comparten con el resto llega por `./compartido` (index.js lo llena antes de
 * cargar este archivo); el estado que cambia en marcha se lee como `ctx.X`.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const dbManager        = require('../DatabaseManager');
const baseCentral      = require('../central/BaseCentral');
const manifiesto       = require('../manifiesto');
const contextoDeEjecucion = require('../ejecucion/ContextoDeEjecucion');
const workspaces       = require('../workspaces');
const hermanos         = require('../hermanos');
const gitManager = require('../git/gitManager');
const aiManager = require('../AiManager');

const ctx = require('./compartido');
const {
    conCentral, rearmarVigilante, remontarFuentes,
} = ctx;

const rutas = express.Router();

const scaffolder       = require('../projectScaffolder');

/* --- Project Management APIs --- */
rutas.get('/api/project/path', (req, res) => {
    res.json({ path: ctx.ROOT_DIR });
});

// Lo que sigue abierto aquí, para que una ventana recuperada vuelva a la sesión.
rutas.get('/api/sesion', (req, res) => {
    res.json({
        proyecto: ctx.PROYECTO_ABIERTO ? ctx.ROOT_DIR : null,
        base: dbManager.getCurrentPath(),
        soloLectura: !!dbManager._readOnly,
    });
});

rutas.post('/api/project/open', async (req, res) => {
    const { path: newPath } = req.body;
    if (!newPath) return res.status(400).json({ error: 'Path is required' });

    if (!fs.existsSync(newPath)) return res.status(404).json({ error: 'Path does not exist' });
    if (!fs.statSync(newPath).isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

    try {
        // Abrir una carpeta ya NO toca el motor. En el modelo actual la sesion
        // empieza al elegir la base, y es connect() quien garantiza que arranca
        // limpia (ver DatabaseManager.hasSessionState). Reiniciar tambien aqui
        // era un resto del modelo viejo —workspace = carpeta, y cambiabas de base
        // dentro de la sesion— y costaba ~620 ms en cada apertura.

        // Las bases de trabajo de Data Flow que siguieran abiertas son del
        // proyecto que se deja: se sueltan, para no retener sus archivos.
        if (path.resolve(newPath) !== path.resolve(ctx.ROOT_DIR)) {
            contextoDeEjecucion.soltarTrabajos(ctx.ROOT_DIR).catch(() => {});
        }
        ctx.ROOT_DIR = newPath;
        process.chdir(ctx.ROOT_DIR);
        ctx.PROYECTO_ABIERTO = true;
        // La base de AmoxSQL anota que se abrió (y la ruta, si la carpeta se
        // movió). Sin esperar: abrir no depende de ella.
        // 5.14 (F5): la apertura ANTERIOR, para «Donde lo dejaste». registrar()
        // devuelve la fila de antes de anotar esta; recién creada, no hay anterior.
        aperturaAnterior = { ruta: ctx.ROOT_DIR, cuando: null, lista: false };
        const estaApertura = aperturaAnterior;
        baseCentral.abrir()
            .then(() => workspaces.registrar(ctx.ROOT_DIR, { abrir: true }))
            .then((r) => {
                const antes = r?.fila?.ultimo_abierto ? new Date(`${String(r.fila.ultimo_abierto).replace(' ', 'T')}Z`) : null;
                estaApertura.cuando = antes && Date.now() - antes.getTime() > 10000 ? antes : null;
                estaApertura.lista = true;
            })
            .then(() => workspaces.refrescarPolitica(ctx.ROOT_DIR))
            .catch(() => {});
        // Las fuentes del proyecto (C1): ya, sin esperar al registro. Lo que se
        // consulte de `fuentes.` mientras tanto espera a que termine.
        remontarFuentes();
        // El vigilante mira UNA raiz: al cambiar de proyecto hay que rearmarlo,
        // o seguiria avisando de los archivos del proyecto anterior.
        rearmarVigilante();
        console.log(`Project root changed to: ${ctx.ROOT_DIR}`);
        res.json({ success: true, path: ctx.ROOT_DIR });
    } catch (err) {
        console.error("Failed to change directory", err);
        res.status(500).json({ error: 'Failed to change directory', details: err.message });
    }
});

/* ─── Project Scaffolding ─── */

rutas.get('/api/project/scaffold-status', (req, res) => {
    try {
        const status = scaffolder.getScaffoldStatus(ctx.ROOT_DIR);
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/project/scaffold', (req, res) => {
    const { folders = [] } = req.body;
    try {
        const created = scaffolder.createFolders(ctx.ROOT_DIR, folders);
        res.json({ success: true, created });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.get('/api/project/config', (req, res) => {
    try {
        const config = scaffolder.getProjectConfig(ctx.ROOT_DIR);
        res.json({ config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.put('/api/project/config', (req, res) => {
    const { updates } = req.body;
    if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'updates object required' });
    }
    try {
        const config = scaffolder.saveProjectConfig(ctx.ROOT_DIR, updates);
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.get('/api/project/folder-defs', (req, res) => {
    res.json({ folders: scaffolder.getFolderDefs() });
});

rutas.get('/api/project/scan-dbs', (req, res) => {
    try {
        const files = fs.readdirSync(ctx.ROOT_DIR, { withFileTypes: true });
        // 6.0 (M1, F1): la última base que se usó en el proyecto va primero; los
        // respaldos de «Upgrade…» (`x.before-6.duckdb`) al final y marcados, para no
        // abrir la copia vieja sin querer. Un `.wal` no es una base: es su diario.
        const ultima = ctx.PROYECTO_ABIERTO ? (scaffolder.getProjectConfig(ctx.ROOT_DIR)?.ultimaBase || null) : null;
        const esRespaldo = (n) => /\.before-6(-\d+)?\.duckdb$/i.test(n);
        const rango = (f) => (f.name === ultima ? 0 : f.respaldo ? 2 : 1);
        const dbFiles = files
            .filter(file => file.isFile() && (file.name.endsWith('.duckdb') || file.name.endsWith('.db') || file.name.endsWith('.ducklake') || file.name.endsWith('.ducklake.sqlite')))
            .map(file => ({
                name: file.name,
                path: file.name, // Relative path from root is enough for now
                ...(esRespaldo(file.name) ? { respaldo: true } : {}),
                ...(file.name === ultima ? { ultima: true } : {}),
            }))
            .sort((a, b) => rango(a) - rango(b) || a.name.localeCompare(b.name));
        res.json(dbFiles);
    } catch (err) {
        res.status(500).json({ error: 'Failed to scan for databases', details: err.message });
    }
});

rutas.post('/api/folder', (req, res) => {
    const { path: folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = folderPath;
    if (!path.isAbsolute(folderPath)) {
        fullPath = path.join(ctx.ROOT_DIR, folderPath);
    }

    fs.mkdir(fullPath, { recursive: true }, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to create folder', details: err.message });
        res.json({ success: true });
    });
});

const getDirectories = (srcPath) => {
    let dirs = [];
    try {
        const items = fs.readdirSync(srcPath, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory() && item.name !== 'node_modules' && item.name !== '.git') {
                const relativePath = path.relative(ctx.ROOT_DIR, path.join(srcPath, item.name)).replace(/\\/g, '/');
                dirs.push({ name: item.name, path: relativePath });
                const subDirs = getDirectories(path.join(srcPath, item.name));
                dirs = dirs.concat(subDirs);
            }
        }
    } catch (err) {
    }
    return dirs;
};

rutas.get('/api/folders', (req, res) => {
    try {
        const folders = getDirectories(ctx.ROOT_DIR);
        folders.unshift({ name: 'Root', path: '' });
        res.json(folders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.get('/api/project/marca', conCentral(async () => ({
    marca: ctx.PROYECTO_ABIERTO ? await workspaces.marcaDelProyecto(ctx.ROOT_DIR) : null,
})));

rutas.get('/api/project/metricas', (_req, res) => {
    res.json({ metricas: ctx.PROYECTO_ABIERTO ? workspaces.metricasDelProyecto(ctx.ROOT_DIR).map(m => ({ name: m.name, description: m.description })) : [] });
});

// La vista de workspaces (B3) y los proyectos que AmoxSQL conoce.
rutas.get('/api/inicio', conCentral(async () => workspaces.resumenInicio()));

rutas.get('/api/proyectos', conCentral(async (req) => ({ proyectos: await workspaces.buscarProyectos(req.query.q) })));

rutas.put('/api/proyectos/:id', conCentral(async (req) => workspaces.actualizarProyecto(req.params.id, req.body || {})));

rutas.put('/api/proyectos-enlace', conCentral(async (req) => {
    const r = await workspaces.enlazarRuta(req.body?.ruta, req.body?.workspaceId || null);
    if (ctx.PROYECTO_ABIERTO) await workspaces.refrescarPolitica(ctx.ROOT_DIR);
    remontarFuentes();
    return r;
}));

// El enlace de la carpeta abierta: qué es, y cambiarlo.
rutas.get('/api/project/workspace', conCentral(async () => {
    if (!ctx.PROYECTO_ABIERTO) return { estado: 'sin_proyecto', preguntar: false };
    return workspaces.estadoDelEnlace(ctx.ROOT_DIR);
}));

rutas.put('/api/project/workspace', conCentral(async (req) => {
    if (!ctx.PROYECTO_ABIERTO) throw new Error('No project is open.');
    const { workspaceId = null, noPreguntar } = req.body || {};
    const r = await workspaces.enlazar(ctx.ROOT_DIR, workspaceId, { noPreguntar });
    await workspaces.refrescarPolitica(ctx.ROOT_DIR);
    remontarFuentes();
    return r;
}));

// 5.14 (G2 + G3, Dec-47 y Dec-48): el paquete de un proyecto (.amoxproject).
const paquete = require('../paquete');

const conPaquete = (fn) => async (req, res) => {
    try { res.json(await fn(req)); } catch (err) { res.status(err instanceof paquete.ErrorDePaquete ? 400 : 500).json({ error: err.message }); }
};

rutas.get('/api/proyecto/paquete', conPaquete(async () => {
    if (!ctx.PROYECTO_ABIERTO) throw new paquete.ErrorDePaquete('Open a project first.');
    return paquete.contenido(ctx.ROOT_DIR);
}));

rutas.post('/api/proyecto/exportar', conPaquete(async (req) => {
    if (!ctx.PROYECTO_ABIERTO) throw new paquete.ErrorDePaquete('Open a project first.');
    const { destino, incluir = null, plantilla = false } = req.body || {};
    if (!destino || !path.isAbsolute(destino)) throw new paquete.ErrorDePaquete('Choose where to save the package.');
    const ruta = /\.amoxproject$/i.test(destino) ? destino : `${destino}.amoxproject`;
    return paquete.exportar(ctx.ROOT_DIR, ruta, { incluir, plantilla });
}));

rutas.post('/api/paquete/leer', conPaquete(async (req) => paquete.leer(String(req.body?.ruta || ''))));

rutas.post('/api/proyecto/desde-paquete', conPaquete(async (req) => {
    const { paquete: ruta, carpeta } = req.body || {};
    if (!ruta || !carpeta || !path.isAbsolute(String(carpeta))) throw new paquete.ErrorDePaquete('Choose the package and a new folder for the project.');
    const r = paquete.extraer(String(ruta), String(carpeta));
    // Lo que le falta en esta máquina (A2): credenciales, extensiones y fuentes.
    let comprobado = null;
    try { comprobado = await manifiesto.comprobar(r.raiz, dbManager, aiManager.getConfig()); } catch { /* se verá al abrirlo */ }
    return { ...r, faltan: comprobado?.faltan || null, completo: comprobado ? comprobado.completo : null };
}));

// 5.14 (F5, Dec-46): «Donde lo dejaste», al abrir un proyecto.
let aperturaAnterior = { ruta: null, cuando: null, lista: false };

rutas.get('/api/proyecto/retomar', conCentral(async () => {
    if (!ctx.PROYECTO_ABIERTO) return { hayAlgo: false };
    // El registro de la apertura va sin esperar; si aún no terminó, un momento.
    for (let i = 0; i < 40 && !aperturaAnterior.lista; i++) await new Promise(r => setTimeout(r, 50));
    const desde = aperturaAnterior.ruta && path.resolve(aperturaAnterior.ruta) === path.resolve(ctx.ROOT_DIR) ? aperturaAnterior.cuando : null;
    return require('../retomar').resumen({ base: baseCentral, raiz: ctx.ROOT_DIR, desde, git: gitManager });
}));

// 5.14 (J1, Dec-51): mirar otro proyecto del workspace, su base en sólo lectura.
rutas.get('/api/proyecto/hermanos', conCentral(async () => {
    if (!ctx.PROYECTO_ABIERTO) return { workspace: null, proyectos: [] };
    return hermanos.listar(dbManager, { raiz: ctx.ROOT_DIR });
}));

rutas.post('/api/proyecto/hermanos/mirar', conCentral(async (req) => {
    if (!ctx.PROYECTO_ABIERTO) throw new Error('Open a project first.');
    return hermanos.mirar(dbManager, { raiz: ctx.ROOT_DIR, ruta: String(req.body?.ruta || '') });
}));

rutas.post('/api/proyecto/hermanos/soltar', conCentral(async (req) => hermanos.soltar(dbManager, String(req.body?.alias || ''))));

rutas.get('/api/proyecto/hermanos/tablas', conCentral(async (req) => ({ tablas: await hermanos.tablas(dbManager, String(req.query.alias || '')) })));

rutas.get('/api/project/requisitos', async (_req, res) => {
    if (!ctx.PROYECTO_ABIERTO) return res.json({ requiere: { credenciales: [], extensiones: [], fuentes: [] }, faltan: { credenciales: [], extensiones: [], fuentes: [] }, completo: true });
    try {
        res.json(await manifiesto.comprobar(ctx.ROOT_DIR, dbManager, aiManager.getConfig()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = rutas;
