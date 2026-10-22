/**
 * El entorno de dbt de AmoxSQL (5.12, fase 1; Dec-36, decidido por el autor el
 * 2026-10-21).
 *
 * «Set up dbt…» crea un entorno de Python en `<home>/entornos/dbt-<motor>/` con
 * versiones FIJAS: `duckdb` igual al motor de AmoxSQL (así dbt escribe bases y lagos
 * que AmoxSQL abre: un entorno nuevo de hoy instalaría DuckDB 2.0, que no) y la
 * versión de dbt-core y dbt-duckdb probada con él en la fase 0. Uno por máquina y por
 * versión del motor, para todos los proyectos. Nunca toca los entornos del usuario.
 *
 * Necesita un Python instalado de una versión que dbt admita, y red la primera vez.
 */
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { carpetaDelEntornoPropio, versionDelMotor } = require('./correr');

const WIN = process.platform === 'win32';

/** Las versiones con las que se crea (comprobadas juntas en scripts/poc512/p00_dbt.mjs). */
function versionesFijas() {
    return { 'dbt-core': '1.12.6', 'dbt-duckdb': '1.11.0', duckdb: versionDelMotor() };
}
// Las de Python que admite esa versión de dbt-core.
const PYTHON_MIN = [3, 10], PYTHON_MAX = [3, 13];
const admitida = ([a, b]) => (a > PYTHON_MIN[0] || (a === PYTHON_MIN[0] && b >= PYTHON_MIN[1])) && (a < PYTHON_MAX[0] || (a === PYTHON_MAX[0] && b <= PYTHON_MAX[1]));

const ejecutar = (exe, args, opciones = {}) => new Promise((resolve) => {
    execFile(exe, args, { timeout: 20000, windowsHide: true, ...opciones }, (err, stdout, stderr) => resolve({ ok: !err, salida: String(stdout || ''), error: String(stderr || err?.message || '') }));
});

/** Los Python de esta máquina: [{ ruta, version: '3.13', admitida, motivo? }]. */
async function buscarPythons() {
    const rutas = new Set();
    if (WIN) {
        const py = await ejecutar('py', ['-0p']);
        for (const l of py.salida.split(/\r?\n/)) {
            const m = /([A-Za-z]:\\.*python(?:w)?\.exe)\s*$/i.exec(l.trim());
            if (m) rutas.add(m[1]);
        }
    }
    for (const nombre of WIN ? ['python'] : ['python3', 'python3.13', 'python3.12', 'python3.11', 'python3.10', 'python']) {
        const r = await ejecutar(nombre, ['-c', 'import sys; print(sys.executable)']);
        const ruta = r.salida.trim().split(/\r?\n/).pop();
        // El alias de la Tienda de Windows no es un Python: abre la tienda.
        if (r.ok && ruta && !/WindowsApps/i.test(ruta)) rutas.add(ruta);
    }
    const lista = [];
    for (const ruta of rutas) {
        const r = await ejecutar(ruta, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])']);
        if (!r.ok) continue;
        const version = r.salida.trim();
        const [a, b] = version.split('.').map(Number);
        const ok = admitida([a, b]);
        lista.push({ ruta, version, admitida: ok, motivo: ok ? null : `dbt does not support Python ${version} yet (it needs ${PYTHON_MIN.join('.')} to ${PYTHON_MAX.join('.')})` });
    }
    return lista.sort((x, y) => (y.admitida - x.admitida) || y.version.localeCompare(x.version, undefined, { numeric: true }));
}

const pythonDe = (carpeta) => (WIN ? path.join(carpeta, 'Scripts', 'python.exe') : path.join(carpeta, 'bin', 'python'));
const dbtDe = (carpeta) => (WIN ? path.join(carpeta, 'Scripts', 'dbt.exe') : path.join(carpeta, 'bin', 'dbt'));

/** ¿Está creado el de AmoxSQL para el motor de hoy? */
function estado() {
    const carpeta = carpetaDelEntornoPropio();
    const nota = (() => { try { return JSON.parse(fs.readFileSync(path.join(carpeta, 'amoxsql.json'), 'utf8')); } catch { return null; } })();
    const existe = fs.existsSync(dbtDe(carpeta)) && !!nota?.listo;
    return { existe, carpeta, versiones: nota?.versiones || versionesFijas(), creado: nota?.creado || null, python: nota?.python || null };
}

/** Corre un comando y pasa cada línea a `alLinea`. */
function conProgreso(exe, args, { alLinea, senal, env } = {}) {
    return new Promise((resolve) => {
        const hijo = spawn(exe, args, { windowsHide: true, env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', PIP_NO_INPUT: '1', ...env } });
        const cortar = () => { if (WIN) execFile('taskkill', ['/PID', String(hijo.pid), '/T', '/F'], () => {}); else hijo.kill('SIGTERM'); };
        senal?.addEventListener('abort', cortar, { once: true });
        const lineas = [];
        const leer = (data) => { for (const l of data.toString().split(/\r?\n/)) if (l.trim()) { lineas.push(l); if (lineas.length > 200) lineas.shift(); alLinea?.(l); } };
        hijo.stdout.on('data', leer);
        hijo.stderr.on('data', leer);
        hijo.on('error', (e) => resolve({ ok: false, error: e.message, lineas }));
        hijo.on('close', (codigo) => { senal?.removeEventListener('abort', cortar); resolve({ ok: codigo === 0, codigo, lineas }); });
    });
}

/**
 * Crea (o rehace) el entorno de AmoxSQL.
 * @param {{ python: string, alProgreso?: (p: { paso, texto }) => void, senal?: AbortSignal }} o
 */
async function crear({ python, alProgreso = () => {}, senal = null }) {
    const v = versionesFijas();
    if (!v.duckdb) throw new Error("AmoxSQL could not read its engine version.");
    const r0 = await ejecutar(python, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])']);
    if (!r0.ok) throw new Error(`${python} does not run: ${r0.error.trim().split('\n').pop()}`);
    const [a, b] = r0.salida.trim().split('.').map(Number);
    if (!admitida([a, b])) throw new Error(`dbt does not support Python ${a}.${b} yet (it needs ${PYTHON_MIN.join('.')} to ${PYTHON_MAX.join('.')}). Choose another Python.`);

    const carpeta = carpetaDelEntornoPropio();
    fs.mkdirSync(path.dirname(carpeta), { recursive: true });
    try { fs.unlinkSync(path.join(carpeta, 'amoxsql.json')); } catch { /* no estaba */ }
    alProgreso({ paso: 'venv', texto: `Creating the environment with Python ${a}.${b}…` });
    let r = await conProgreso(python, ['-m', 'venv', '--clear', carpeta], { alLinea: (t) => alProgreso({ paso: 'venv', texto: t }), senal });
    if (!r.ok) throw new Error(`The environment could not be created: ${(r.error || r.lineas.slice(-3).join(' ')).trim()}`);
    if (senal?.aborted) throw new Error('Cancelled.');

    const paquetes = [`dbt-core==${v['dbt-core']}`, `dbt-duckdb==${v['dbt-duckdb']}`, `duckdb==${v.duckdb}`];
    alProgreso({ paso: 'pip', texto: `Downloading ${paquetes.join(', ')}…` });
    r = await conProgreso(pythonDe(carpeta), ['-m', 'pip', 'install', ...paquetes], { alLinea: (t) => alProgreso({ paso: 'pip', texto: t }), senal });
    if (!r.ok) {
        const ultimo = r.lineas.slice(-4).join(' ');
        const sinRed = /Could not fetch|connection|getaddrinfo|Temporary failure|NewConnectionError|timed out/i.test(ultimo);
        throw new Error(sinRed ? 'The packages could not be downloaded: check the internet connection and try again.' : `The packages could not be installed: ${ultimo.slice(-400)}`);
    }

    alProgreso({ paso: 'comprobar', texto: 'Checking dbt and the engine…' });
    const motor = await ejecutar(pythonDe(carpeta), ['-c', 'import duckdb; print(duckdb.__version__)']);
    const dbt = await ejecutar(dbtDe(carpeta), ['--version'], { timeout: 60000 });
    if (!dbt.ok || motor.salida.trim() !== v.duckdb) {
        throw new Error(`The environment was created but does not answer as expected (dbt: ${dbt.ok ? 'ok' : dbt.error.trim().slice(-200)}; engine: ${motor.salida.trim() || '?'}).`);
    }
    const nota = { listo: true, creado: new Date().toISOString(), python: { ruta: python, version: `${a}.${b}` }, versiones: v };
    fs.writeFileSync(path.join(carpeta, 'amoxsql.json'), JSON.stringify(nota, null, 2));
    alProgreso({ paso: 'listo', texto: `dbt ${v['dbt-core']} with DuckDB ${v.duckdb} is ready.` });
    return { carpeta, ...nota };
}

module.exports = { versionesFijas, buscarPythons, estado, crear, admitida };
