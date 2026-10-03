/**
 * dbt sin bloqueos (I1, adelantada a la 5.10 como fase 2b).
 *
 * dbt abre la base `.duckdb` en SU proceso y en escritura. Si AmoxSQL la tiene
 * adjunta —aunque sea en sólo lectura—, el sistema no le deja abrirla (prueba
 * 0.5). Así que, antes de un comando de dbt que abre la base, AmoxSQL mira qué
 * archivo va a abrir (el `profiles.yml` del proyecto), y si es el suyo lo
 * suelta con DETACH; al terminar dbt —bien, mal o cancelado— lo vuelve a
 * adjuntar. Soltar y volver cuesta unos milisegundos y no se pierde nada: el
 * motor sigue vivo con sus extensiones, el catálogo `fuentes` y las vistas
 * temporales de los cuadernos.
 *
 * Un DuckLake con catálogo SQLite admite varios procesos a la vez (con la misma
 * versión del motor): no hace falta soltar nada. Con catálogo en un archivo
 * DuckDB —lo que crea AmoxSQL hoy— hay un solo escritor y recibe el mismo trato.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { exec } = require('child_process');

// Comandos de dbt que no abren la base.
const NO_ABREN = new Set(['clean', 'deps', 'parse', 'ls', 'list', 'init']);

/** `dbt run --select x --profiles-dir . --target prod` → { accion, profilesDir, target } */
function leerComando(comando) {
    const partes = String(comando || '').trim().split(/\s+/);
    const accion = partes[1] || '';
    const valor = (flag) => {
        const i = partes.indexOf(flag);
        return i > 0 && partes[i + 1] && !partes[i + 1].startsWith('--') ? partes[i + 1].replace(/^['"]|['"]$/g, '') : null;
    };
    return { accion, profilesDir: valor('--profiles-dir'), target: valor('--target') || valor('-t') };
}

const abreLaBase = (accion) => !!accion && !NO_ABREN.has(accion) && !accion.startsWith('-');

/** `{{ env_var('X', 'def') }}` como lo resuelve dbt, para las rutas del perfil. */
function resolverPlantilla(v) {
    return String(v).replace(/\{\{\s*env_var\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?\)\s*\}\}/g,
        (_, nombre, defecto) => process.env[nombre] ?? defecto ?? '');
}

/**
 * Los archivos que dbt abrirá en escritura con este comando: la `path` del
 * target y las de sus `attach`. Para un DuckLake, su catálogo si es un archivo
 * DuckDB; nada si es SQLite (admite varios procesos).
 */
function basesDelPerfil(raiz, { profilesDir = null, target = null } = {}) {
    let proyecto = {};
    try { proyecto = yaml.load(fs.readFileSync(path.join(raiz, 'dbt_project.yml'), 'utf8')) || {}; } catch { return []; }
    const nombre = proyecto.profile;
    if (!nombre) return [];
    const candidatos = [
        profilesDir ? path.resolve(raiz, profilesDir, 'profiles.yml') : null,
        path.join(raiz, 'profiles.yml'),
        process.env.DBT_PROFILES_DIR ? path.join(process.env.DBT_PROFILES_DIR, 'profiles.yml') : null,
        path.join(os.homedir(), '.dbt', 'profiles.yml'),
    ].filter(Boolean);
    let perfiles = null;
    for (const c of candidatos) {
        if (fs.existsSync(c)) { try { perfiles = yaml.load(fs.readFileSync(c, 'utf8')); break; } catch { /* siguiente */ } }
    }
    const perfil = perfiles && perfiles[nombre];
    if (!perfil || !perfil.outputs) return [];
    const salida = perfil.outputs[target || resolverPlantilla(perfil.target || 'dev')];
    if (!salida || String(salida.type).toLowerCase() !== 'duckdb') return [];

    const rutas = [];
    const anotar = (p) => {
        if (!p) return;
        let r = resolverPlantilla(p).trim();
        if (!r || r === ':memory:') return;
        if (/^ducklake:/i.test(r)) {
            r = r.replace(/^ducklake:/i, '');
            if (/^(sqlite|postgres|mysql):/i.test(r)) return;     // catálogo con varios escritores
            r = r.replace(/^duckdb:/i, '');
        }
        // Un esquema de dos letras o más (s3:, http:, un servicio) no es un archivo
        // local; una letra sola es una unidad de Windows (C:).
        if (/^[a-z][a-z0-9+.-]+:/i.test(r)) return;
        rutas.push(path.resolve(raiz, r));
    };
    anotar(salida.path || 'dbt.duckdb');
    for (const a of Array.isArray(salida.attach) ? salida.attach : []) anotar(a && a.path);
    return rutas;
}

const igual = (a, b) => {
    const n = (x) => path.resolve(String(x)).toLowerCase().replace(/\\/g, '/');
    return n(a) === n(b);
};

// ── Prestar la base ─────────────────────────────────────────────────────────
// Puede haber dos comandos de dbt a la vez (dos pestañas): la base se suelta
// una vez y se recupera cuando termina el último.
let prestamos = 0;

/**
 * Si dbt va a abrir la base que tiene AmoxSQL, la suelta. Devuelve una
 * función que la recupera (siempre se llama, termine como termine dbt), y un
 * texto para enseñar, o null si no había nada que soltar.
 */
async function antesDeDbt(dbManager, raiz, comando) {
    const { accion, profilesDir, target } = leerComando(comando);
    const nada = { aviso: null, despues: async () => {} };
    if (!abreLaBase(accion)) return nada;
    const bases = basesDelPerfil(raiz, { profilesDir, target });
    const actual = dbManager.prestada?.ruta || dbManager.attachedPath;
    if (!actual || !bases.some(b => igual(b, actual))) return nada;

    if (!dbManager.prestada) await dbManager.prestar('dbt');
    prestamos++;
    let devuelta = false;
    return {
        aviso: `AmoxSQL released ${path.basename(actual)} so dbt can write to it. It reattaches by itself when dbt finishes.`,
        despues: async () => {
            if (devuelta) return;
            devuelta = true;
            prestamos = Math.max(0, prestamos - 1);
            if (prestamos === 0) await dbManager.recuperar();
        },
    };
}

/** ¿Arrancó dbt? Un fallo antes de su primera línea es el entorno, no el proyecto. */
function noArranco(codigo, lineas) {
    if (codigo === 0) return false;
    const texto = lineas.join('\n');
    return !/Running with dbt=|dbt=\d|Core:\s/i.test(texto) && /Traceback|ModuleNotFoundError|ImportError|is not recognized|command not found|EnvironmentLocationNotFound/i.test(texto);
}

// ── Versiones (2b.5) ────────────────────────────────────────────────────────
// Un lago DuckLake creado por un motor nuevo no lo abre uno más viejo. Se mira
// la versión del motor del entorno de dbt una vez por entorno.
const versiones = new Map();

function versionDelMotorDeDbt({ condaEnv = null, condaPath = null } = {}) {
    const clave = `${condaEnv || ''}|${condaPath || ''}`;
    if (versiones.has(clave)) return versiones.get(clave);
    const py = `python -c "import duckdb; print(duckdb.__version__)"`;
    const cmd = condaEnv && condaEnv !== 'none' ? `"${condaPath || 'conda'}" run -n ${condaEnv} ${py}` : py;
    const p = new Promise((resolve) => {
        exec(cmd, { timeout: 30000 }, (err, stdout) => {
            const m = /(\d+\.\d+\.\d+)/.exec(String(stdout || ''));
            resolve(err || !m ? null : m[1]);
        });
    });
    versiones.set(clave, p);
    return p;
}

const menor = (a, b) => {
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); }
    return false;
};

/**
 * Si el perfil usa un DuckLake y el motor de dbt no es el de AmoxSQL, lo dice:
 * el lago lo deja con el formato de quien lo escribió, y el otro puede no
 * entenderlo (comprobado: dbt con un motor más nuevo crea un lago que AmoxSQL
 * no abre, p07).
 */
async function avisoDeVersion(raiz, comando, { condaEnv, condaPath, versionAmox }) {
    const { accion, profilesDir, target } = leerComando(comando);
    if (!abreLaBase(accion) || !versionAmox) return null;
    let perfilTexto = '';
    for (const c of [profilesDir ? path.resolve(raiz, profilesDir, 'profiles.yml') : null, path.join(raiz, 'profiles.yml')].filter(Boolean)) {
        if (fs.existsSync(c)) { perfilTexto = fs.readFileSync(c, 'utf8'); break; }
    }
    if (!/ducklake:/i.test(perfilTexto)) return null;
    const v = await versionDelMotorDeDbt({ condaEnv, condaPath });
    const amox = String(versionAmox).replace(/^v/, '');
    if (!v) return null;
    if (menor(v, amox)) {
        return `dbt runs DuckDB ${v} and AmoxSQL ${amox}. A DuckLake lake written by the newer one may not open in the older one: update the DuckDB package of dbt's environment.`;
    }
    if (menor(amox, v)) {
        return `dbt runs DuckDB ${v} and AmoxSQL ${amox}. A DuckLake lake written by dbt may not open in AmoxSQL: use DuckDB ${amox} in dbt's environment, or update AmoxSQL.`;
    }
    return null;
}

module.exports = {
    leerComando, abreLaBase, basesDelPerfil, antesDeDbt, noArranco, avisoDeVersion, versionDelMotorDeDbt,
    _reiniciar: () => { prestamos = 0; versiones.clear(); },
};
