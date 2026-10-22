/**
 * El corredor de dbt (5.12, fase 1; Dec-26 y Dec-27).
 *
 * Una sola forma de lanzar dbt para la interfaz, la programación (I10) y la línea
 * de comandos:
 *
 *   - **Sin shell.** dbt se lanza con una lista de argumentos (`spawn`), nunca con
 *     un texto que interprete un shell: un `--select` guardado en una programación
 *     no puede convertirse en otra orden. Lo que llega como texto (lo que escribe la
 *     interfaz) se analiza a esa lista y se rechaza si trae `&&`, `|`, `;`,
 *     redirecciones…
 *   - **Sin tope de tiempo.** Un `dbt build` de una noche tarda lo que tarde; se
 *     cancela con su señal (el cierre de la respuesta, un botón), que en Windows
 *     termina el árbol de procesos (dbt.exe lanza Python).
 *   - **Con el entorno del proyecto** (Dec-27): el que dice `project.json → dbt.entorno`
 *     (el de AmoxSQL, un conda, una carpeta de Python o el del sistema).
 *   - **Por `dbtConvivir`** (I1): si dbt va a abrir la base de AmoxSQL, se suelta
 *     antes y se recupera al terminar, pase lo que pase.
 */
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const dbtConvivir = require('../dbtConvivir');
const { homeAmox } = require('../rutas');

const WIN = process.platform === 'win32';

// Las acciones que se pueden lanzar. `docs serve` (un servidor que no acaba) e
// `init` (pregunta por consola) no: DBT Studio tiene lo suyo para eso.
const ACCIONES = new Set(['run', 'build', 'test', 'compile', 'show', 'seed', 'snapshot', 'deps', 'parse',
    'debug', 'clean', 'ls', 'list', 'run-operation', 'retry', 'clone']);
const COMPUESTAS = { source: ['freshness'], docs: ['generate'] };
// Las que escriben en la base (Dec-29: con producción, piden confirmación).
const ESCRIBEN = new Set(['run', 'build', 'seed', 'snapshot', 'clone', 'retry', 'run-operation']);

class ErrorDeDbt extends Error {}

/**
 * Parte un texto como lo haría un shell sencillo: espacios, comillas simples y
 * dobles. No expande nada. Devuelve null si hay algo que sólo tiene sentido en un
 * shell (encadenar, tuberías, redirecciones, sustituciones).
 */
function partir(texto) {
    const out = [];
    let actual = '', comilla = null, hay = false;
    const s = String(texto || '');
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (comilla) {
            if (comilla === '"' && c === '\\' && s[i + 1] === '"') { actual += '"'; i++; continue; }
            if (c === comilla) comilla = null;
            else actual += c;
            continue;
        }
        if (c === '"' || c === "'") { comilla = c; hay = true; continue; }
        if (/\s/.test(c)) { if (hay || actual) out.push(actual); actual = ''; hay = false; continue; }
        if ('&|;<>`'.includes(c) || (c === '$' && s[i + 1] === '(')) return null;
        actual += c; hay = true;
    }
    if (comilla) return null;
    if (hay || actual) out.push(actual);
    return out;
}

/**
 * «dbt build --select stg+» → { accion: 'build', args: ['build', '--select', 'stg+'] }.
 * Lanza ErrorDeDbt con un mensaje para el usuario si no es una orden de dbt válida.
 */
function analizarComando(texto) {
    const partes = partir(texto);
    if (!partes) throw new ErrorDeDbt('That is not a dbt command: it has something only a shell would run (&&, |, ;, >, <…). Run one dbt command at a time.');
    if (partes[0] !== 'dbt') throw new ErrorDeDbt('Only dbt commands can be run here: start with «dbt».');
    const accion = partes[1];
    if (!accion) throw new ErrorDeDbt('Which dbt command? For example «dbt build».');
    if (COMPUESTAS[accion]) {
        if (!COMPUESTAS[accion].includes(partes[2])) throw new ErrorDeDbt(`«dbt ${accion} ${partes[2] || ''}» is not supported here. Use ${COMPUESTAS[accion].map(x => `«dbt ${accion} ${x}»`).join(' or ')}.`);
        return { accion: `${accion} ${partes[2]}`, args: partes.slice(1) };
    }
    if (!ACCIONES.has(accion)) throw new ErrorDeDbt(`«dbt ${accion}» is not supported here.`);
    return { accion, args: partes.slice(1) };
}

const escribe = (accion) => ESCRIBEN.has(String(accion).split(' ')[0]);

/** El texto de una lista de argumentos, para enseñarla y para el historial. */
function textoDe(args) {
    const citar = (a) => {
        const v = String(a);
        if (v !== '' && !/[\s"']/.test(v)) return v;
        if (!v.includes("'")) return `'${v}'`;                 // rutas de Windows, JSON
        if (!v.includes('"')) return `"${v}"`;
        return `"${v.replace(/"/g, '\\"')}"`;                 // las dos: \" dentro de comillas dobles
    };
    return ['dbt', ...args.map(citar)].join(' ');
}

// ── El entorno (Dec-27, Dec-36) ─────────────────────────────────────────────

/** La versión del motor de AmoxSQL sin el sufijo del paquete: 1.5.6-r.1 → 1.5.6. */
function versionDelMotor() {
    try { return require('@duckdb/node-api/package.json').version.replace(/-.*$/, ''); } catch { return null; }
}

/** La carpeta del entorno de dbt de AmoxSQL para el motor de hoy (Dec-36). */
function carpetaDelEntornoPropio(version = versionDelMotor()) {
    return path.join(homeAmox(), 'entornos', `dbt-${version || 'motor'}`);
}

const ejecutableEn = (carpeta, nombre) => (WIN ? path.join(carpeta, 'Scripts', `${nombre}.exe`) : path.join(carpeta, 'bin', nombre));
const pythonEn = (carpeta) => (WIN ? (fs.existsSync(path.join(carpeta, 'python.exe')) ? path.join(carpeta, 'python.exe') : path.join(carpeta, 'Scripts', 'python.exe')) : path.join(carpeta, 'bin', 'python'));

/** Lo que pone `conda activate` en el PATH de un entorno, para lanzar su dbt sin conda. */
function pathDeConda(carpeta) {
    const partes = WIN
        ? [carpeta, path.join(carpeta, 'Library', 'mingw-w64', 'bin'), path.join(carpeta, 'Library', 'usr', 'bin'), path.join(carpeta, 'Library', 'bin'), path.join(carpeta, 'Scripts'), path.join(carpeta, 'bin')]
        : [path.join(carpeta, 'bin')];
    return [...partes, process.env.PATH || ''].join(path.delimiter);
}

/** El entorno de dbt del proyecto, como lo guarda `project.json → dbt.entorno`. */
function entornoDelProyecto(raiz) {
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(raiz, '.amoxsql', 'project.json'), 'utf8'));
        const e = cfg?.dbt?.entorno || null;
        // `project.json` viaja con el proyecto: de él sólo valen los entornos de
        // verdad. Un ejecutable cualquiera («directo») sólo lo pasa el código.
        return e && ['amoxsql', 'conda', 'python', 'sistema'].includes(e.tipo) ? e : null;
    } catch { return null; }
}

/**
 * Cómo se lanza dbt con un entorno: { exe, pre, env, python, descripcion }.
 *   { tipo: 'amoxsql' }                   el de AmoxSQL (Dec-36)
 *   { tipo: 'conda', nombre, ruta? }      su dbt directamente, con el PATH que pondría conda
 *   { tipo: 'python', ruta }              una carpeta de entorno de Python
 *   { tipo: 'sistema' } o nada            `dbt` del PATH
 *   { tipo: 'directo', exe, pre? }        sólo para las pruebas
 */
function comandoDeEntorno(entorno) {
    const e = entorno || { tipo: 'sistema' };
    if (e.tipo === 'directo') return { exe: e.exe, pre: e.pre || [], env: {}, python: e.python || null, descripcion: 'test' };
    if (e.tipo === 'amoxsql' || e.tipo === 'python') {
        const carpeta = e.tipo === 'amoxsql' ? carpetaDelEntornoPropio(e.version) : e.ruta;
        if (!carpeta) throw new ErrorDeDbt('The project points to a Python environment without a folder. Choose the dbt environment again in DBT Studio.');
        const exe = ejecutableEn(carpeta, 'dbt');
        if (!fs.existsSync(exe)) {
            throw new ErrorDeDbt(e.tipo === 'amoxsql'
                ? "AmoxSQL's dbt environment is not set up on this computer. Use «Set up dbt…» in DBT Studio."
                : `There is no dbt in ${carpeta}. Choose the dbt environment again in DBT Studio.`);
        }
        return { exe, pre: [], env: { PATH: [path.dirname(exe), carpeta, process.env.PATH || ''].join(path.delimiter), VIRTUAL_ENV: carpeta }, python: pythonEn(carpeta), descripcion: e.tipo === 'amoxsql' ? "AmoxSQL's dbt environment" : carpeta };
    }
    if (e.tipo === 'conda') {
        if (e.ruta && fs.existsSync(ejecutableEn(e.ruta, 'dbt'))) {
            return { exe: ejecutableEn(e.ruta, 'dbt'), pre: [], env: { PATH: pathDeConda(e.ruta), CONDA_PREFIX: e.ruta, CONDA_DEFAULT_ENV: e.nombre || path.basename(e.ruta) }, python: pythonEn(e.ruta), descripcion: `conda: ${e.nombre || path.basename(e.ruta)}` };
        }
        if (!e.nombre || !/^[\w.-]+$/.test(e.nombre)) throw new ErrorDeDbt('The conda environment of the project has no valid name. Choose it again in DBT Studio.');
        // Sin su carpeta: `conda run`, con el conda.exe (un .bat no se lanza sin shell).
        let conda = e.conda || 'conda';
        if (/\.bat$/i.test(conda)) {
            const exe = path.join(path.dirname(path.dirname(conda)), 'Scripts', 'conda.exe');
            if (fs.existsSync(exe)) conda = exe;
            else throw new ErrorDeDbt('conda is only available as a script here. Choose the environment again in DBT Studio so AmoxSQL can use its folder.');
        }
        return { exe: conda, pre: ['run', '--no-capture-output', '-n', e.nombre, 'dbt'], env: {}, python: null, descripcion: `conda: ${e.nombre}` };
    }
    return { exe: WIN ? 'dbt.exe' : 'dbt', pre: [], env: {}, python: null, descripcion: 'dbt on the PATH' };
}

/** Termina el proceso y sus hijos (dbt.exe lanza Python). */
function terminar(hijo) {
    if (!hijo || hijo.exitCode !== null) return;
    if (WIN) execFile('taskkill', ['/PID', String(hijo.pid), '/T', '/F'], { windowsHide: true }, () => {});
    else { try { hijo.kill('SIGTERM'); } catch { /* ya no está */ } }
}

/**
 * Corre dbt.
 * @param {object} o
 * @param {string} o.raiz           carpeta del proyecto dbt
 * @param {string[]} o.args         los argumentos después de «dbt» (['build', '--select', 'x'])
 * @param {object} [o.entorno]      el entorno (por defecto, el del proyecto)
 * @param {object} [o.dbManager]    para soltar y recuperar la base (I1)
 * @param {object} [o.env]          variables de entorno añadidas (I7: las fuentes)
 * @param {function} [o.alLinea]    ({ tipo: 'stdout'|'stderr'|'amox', texto }) => void
 * @param {AbortSignal} [o.senal]   cancela
 * @returns {Promise<{ codigo, cancelado, ms, inicio, comando, lineas, noArranco }>}
 */
async function correr({ raiz, args, entorno, dbManager = null, env = {}, alLinea = () => {}, senal = null, prioridadBaja = false }) {
    if (!raiz || !fs.existsSync(path.join(raiz, 'dbt_project.yml'))) throw new ErrorDeDbt('This folder is not a dbt project (there is no dbt_project.yml).');
    const lista = [...args];
    if (!lista.some(a => a === '--profiles-dir' || String(a).startsWith('--profiles-dir=')) && fs.existsSync(path.join(raiz, 'profiles.yml'))) {
        lista.push('--profiles-dir', raiz);
    }
    const comando = textoDe(lista);
    const c = comandoDeEntorno(entorno || entornoDelProyecto(raiz));
    const amox = (texto) => alLinea({ tipo: 'amox', texto });
    const inicio = new Date();

    let prestamo = { aviso: null, despues: async () => {} };
    if (dbManager) {
        try { prestamo = await dbtConvivir.antesDeDbt(dbManager, raiz, comando); } catch (e) { amox(`AmoxSQL could not release the database for dbt: ${e.message}`); }
        if (prestamo.aviso) amox(prestamo.aviso);
        try {
            const v = (await dbManager.systemQuery('SELECT version() AS v', { lane: 'meta' }))?.[0]?.v;
            const aviso = await dbtConvivir.avisoDeVersion(raiz, comando, { python: c.python, condaEnv: entorno?.tipo === 'conda' && !c.python ? entorno.nombre : null, condaPath: c.exe, versionAmox: v });
            if (aviso) amox(aviso);
        } catch { /* sólo es un aviso */ }
    }

    const lineas = [];
    const r = await new Promise((resolve) => {
        let hijo;
        try {
            // Sin colores: la salida va a una ventana y al historial, no a una consola.
            hijo = spawn(c.exe, [...c.pre, ...lista], { cwd: raiz, env: { ...process.env, DBT_USE_COLORS: 'false', ...c.env, ...env }, windowsHide: true });
        } catch (e) { resolve({ codigo: 1, error: e.message }); return; }
        // 5.13 (Dec-42): de fondo, con la aplicación abierta, por debajo de lo
        // normal. Lo hereda lo que lance (el python.exe de dbt.exe, fase 0.5).
        if (prioridadBaja && hijo?.pid) {
            try { require('os').setPriority(hijo.pid, require('os').constants.priority.PRIORITY_BELOW_NORMAL); amox('Running in the background at low priority, so the computer stays usable.'); } catch { /* sin permiso: a la normal */ }
        }
        let cancelado = false;
        const alCancelar = () => { cancelado = true; terminar(hijo); };
        if (senal) { if (senal.aborted) alCancelar(); else senal.addEventListener('abort', alCancelar, { once: true }); }
        const salida = (tipo) => {
            let resto = '';
            return (data) => {
                const texto = resto + data.toString();
                const partes = texto.split(/\r?\n/);
                resto = partes.pop();
                for (const l of partes) { if (!l.trim()) continue; if (lineas.length < 2000) lineas.push(l); alLinea({ tipo, texto: l }); }
            };
        };
        hijo.stdout.on('data', salida('stdout'));
        hijo.stderr.on('data', salida('stderr'));
        hijo.on('error', (e) => {
            const no = e.code === 'ENOENT';
            resolve({ codigo: 1, cancelado, error: no ? `dbt was not found (${c.descripcion}). Choose the dbt environment in DBT Studio, or use «Set up dbt…».` : e.message });
        });
        hijo.on('close', (codigo) => { if (senal) senal.removeEventListener('abort', alCancelar); resolve({ codigo: codigo ?? 1, cancelado }); });
    });

    try { await prestamo.despues(); } catch (e) { amox(`AmoxSQL could not reattach the database: ${e.message}. Open it again from the title bar.`); }
    if (prestamo.aviso) amox('AmoxSQL has the database again.');
    if (r.error) alLinea({ tipo: 'stderr', texto: r.error });
    const noArranco = !r.cancelado && dbtConvivir.noArranco(r.codigo, lineas);
    if (noArranco) amox("dbt did not start: its environment fails before running any project code (see the error above). Fix dbt's environment — for example, check that its Python version is supported by dbt — or use «Set up dbt…».");
    return { codigo: r.codigo, cancelado: !!r.cancelado, ms: Date.now() - inicio.getTime(), inicio, comando, lineas, noArranco, error: r.error || null };
}

module.exports = {
    ErrorDeDbt, ACCIONES, analizarComando, partir, textoDe, escribe,
    versionDelMotor, carpetaDelEntornoPropio, entornoDelProyecto, comandoDeEntorno, correr,
};
