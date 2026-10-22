/**
 * El proyecto dbt: sus *targets*, producción y lo que trae al crearlo (5.12, fase 2;
 * I4, I9, I11; Dec-29).
 *
 * Dec-29 (respuesta del autor, 2026-10-21): un proyecto que crea AmoxSQL empieza con un
 * solo *target*, `prod`, marcado como producción; `dev` existe sólo si el ingeniero lo
 * crea. Con producción activa la barra lo dice en rojo, y escribir pide confirmar
 * escribiendo el nombre del *target* sólo cuando hay otro al que se podría haber
 * querido apuntar.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const scaffolder = require('../projectScaffolder');
const { escribe } = require('./correr');

const leerYaml = (f) => { try { return yaml.load(fs.readFileSync(f, 'utf8')) || {}; } catch { return null; } };

/** El `profiles.yml` que usará dbt: el del proyecto o, si no hay, el del usuario. */
function archivoDePerfiles(raiz) {
    for (const f of [path.join(raiz, 'profiles.yml'), path.join(os.homedir(), '.dbt', 'profiles.yml')]) {
        if (fs.existsSync(f)) return f;
    }
    return null;
}

/**
 * Los *targets* del perfil del proyecto, cuál está activo y cuáles son producción.
 * `produccion` es null si el proyecto aún no lo dijo (se propone, no se adivina).
 */
function targets(raiz) {
    const proyecto = leerYaml(path.join(raiz, 'dbt_project.yml'));
    if (!proyecto) return { existe: false, targets: [] };
    const archivo = archivoDePerfiles(raiz);
    const perfil = archivo ? (leerYaml(archivo) || {})[proyecto.profile] : null;
    const outputs = perfil?.outputs || {};
    const lista = Object.entries(outputs).map(([nombre, o]) => ({ nombre, tipo: o?.type || null, path: typeof o?.path === 'string' ? o.path : null, schema: o?.schema || null }));
    const cfg = scaffolder.getProjectConfig(raiz)?.dbt || {};
    const porDefecto = perfil?.target || lista[0]?.nombre || null;
    const activo = cfg.target && outputs[cfg.target] ? cfg.target : porDefecto;
    const produccion = Array.isArray(cfg.produccion) ? cfg.produccion.filter(t => outputs[t]) : null;
    const propuesta = produccion === null ? lista.filter(t => /^(prod|production|prd)$/i.test(t.nombre)).map(t => t.nombre) : [];
    return {
        existe: true, archivo, perfil: proyecto.profile || null, targets: lista, porDefecto, activo,
        produccion, propuesta, enProduccion: !!produccion?.includes(activo),
    };
}

/** El *target* de una orden: el de `--target` o el activo del proyecto. */
function targetDeArgs(args) {
    const i = args.findIndex(a => a === '--target' || a === '-t' || String(a).startsWith('--target='));
    if (i < 0) return null;
    return String(args[i]).includes('=') ? String(args[i]).split('=').slice(1).join('=') : args[i + 1] || null;
}

/**
 * ¿Hay que confirmar antes de correr esto? (Dec-29) Devuelve null o
 * { target, motivo }: escribe, en un *target* de producción, y existe otro.
 */
function confirmacionNecesaria(raiz, args) {
    const accion = String(args[0] || '');
    const t = targets(raiz);
    if (!t.existe) return null;
    const objetivo = targetDeArgs(args) || t.activo;
    const fullRefresh = args.includes('--full-refresh');
    if (!(escribe(accion) || fullRefresh)) return null;
    if (!t.produccion?.includes(objetivo)) return null;
    if (t.targets.length < 2) return null;
    return { target: objetivo, motivo: `«dbt ${accion}» writes to ${objetivo}, a production target.` };
}

/**
 * Los argumentos con el *target* activo del proyecto, si la orden no dice otro.
 * `deps` y `clean` no lo aceptan.
 */
function conTarget(raiz, args) {
    if (['deps', 'clean'].includes(args[0]) || targetDeArgs(args)) return args;
    const cfg = scaffolder.getProjectConfig(raiz)?.dbt || {};
    if (!cfg.target) return args;
    return [...args, '--target', cfg.target];
}

/** Una copia del *target* `desde` como `dev`, con su propia base (I4). */
function crearDev(raiz, { desde = null, nombre = 'dev' } = {}) {
    const t = targets(raiz);
    if (!t.existe || !t.archivo) throw new Error('This project has no profiles.yml to add a target to.');
    if (path.resolve(t.archivo) !== path.resolve(raiz, 'profiles.yml')) {
        throw new Error(`The profile lives outside the project (${t.archivo}). Add the target there: AmoxSQL only edits the project's own profiles.yml.`);
    }
    const perfiles = leerYaml(t.archivo);
    const perfil = perfiles?.[t.perfil];
    if (!perfil?.outputs) throw new Error(`The profile «${t.perfil}» has no outputs.`);
    if (perfil.outputs[nombre]) throw new Error(`There is already a target named «${nombre}».`);
    const base = perfil.outputs[desde || t.activo || t.porDefecto];
    if (!base) throw new Error('There is no target to copy.');
    const copia = { ...base };
    // Su propia base: x.duckdb → x_dev.duckdb (también dentro de ducklake:…); si
    // no es un archivo, su propio esquema.
    if (typeof copia.path === 'string' && /\.(duckdb|ducklake|db)$/i.test(copia.path)) {
        copia.path = copia.path.replace(/(\.(duckdb|ducklake|db))$/i, `_${nombre}$1`);
    } else {
        copia.schema = `${copia.schema || 'main'}_${nombre}`;
    }
    perfil.outputs[nombre] = copia;
    fs.writeFileSync(t.archivo, yaml.dump(perfiles, { lineWidth: 120 }), 'utf8');
    return { nombre, ...copia };
}

// ── Crear un proyecto (I11, I9) ─────────────────────────────────────────────

/** Los archivos de un proyecto nuevo: capas con un ejemplo que corre a la primera. */
function archivosIniciales(nombre, perfil) {
    const proyecto = {
        name: nombre,
        version: '1.0.0',
        'config-version': 2,
        profile: perfil,
        'model-paths': ['models'],
        'analysis-paths': ['analyses'],
        'test-paths': ['tests'],
        'seed-paths': ['seeds'],
        'macro-paths': ['macros'],
        'snapshot-paths': ['snapshots'],
        'clean-targets': ['target', 'dbt_packages'],
        models: {
            [nombre]: {
                // Dec-30: dbt escribe las descripciones como comentarios de la base,
                // y AmoxSQL las enseña en el explorador y al asistente.
                '+persist_docs': { relation: true, columns: true },
                staging: { '+materialized': 'view' },
                intermediate: { '+materialized': 'view' },
                marts: { '+materialized': 'table' },
            },
        },
        // Las filas que rompen un test quedan en una tabla (I3).
        data_tests: { '+store_failures': true },
    };
    const perfiles = {
        [perfil]: {
            target: 'prod',
            outputs: { prod: { type: 'duckdb', path: `${nombre}.duckdb`, threads: 4 } },
        },
    };
    return {
        'dbt_project.yml': yaml.dump(proyecto, { lineWidth: 120, quotingType: "'", forceQuotes: false }),
        'profiles.yml': yaml.dump(perfiles, { lineWidth: 120 }),
        'seeds/example_orders.csv': [
            'order_id,ordered_at,store,product,quantity,amount',
            '1,2026-09-01,north,coffee,2,7.00',
            '2,2026-09-01,south,tea,1,2.50',
            '3,2026-09-02,north,coffee,1,3.50',
            '4,2026-09-15,east,cake,3,12.00',
            '5,2026-10-01,north,tea,2,5.00',
            '6,2026-10-02,south,coffee,4,14.00',
            '',
        ].join('\n'),
        'models/staging/stg_orders.sql': [
            '-- Staging: one model per source, cleaned and renamed. No joins, no business logic.',
            'select',
            '    order_id,',
            '    cast(ordered_at as date) as ordered_on,',
            '    lower(store) as store,',
            '    product,',
            '    quantity,',
            '    amount',
            "from {{ ref('example_orders') }}",
            '',
        ].join('\n'),
        'models/staging/_staging.yml': [
            'models:',
            '  - name: stg_orders',
            '    description: One row per order, cleaned.',
            '    columns:',
            '      - name: order_id',
            '        description: The order identifier.',
            '        data_tests: [unique, not_null]',
            '      - name: store',
            '        description: The store that sold it.',
            '        data_tests: [not_null]',
            '',
        ].join('\n'),
        'models/intermediate/int_orders_daily.sql': [
            '-- Intermediate: reusable steps between staging and marts.',
            'select',
            '    ordered_on,',
            '    store,',
            '    sum(quantity) as units,',
            '    sum(amount) as revenue',
            "from {{ ref('stg_orders') }}",
            'group by ordered_on, store',
            '',
        ].join('\n'),
        'models/marts/fct_revenue_monthly.sql': [
            '-- Marts: what people read. Materialized as tables.',
            'select',
            "    date_trunc('month', ordered_on) as month,",
            '    store,',
            '    sum(units) as units,',
            '    sum(revenue) as revenue',
            "from {{ ref('int_orders_daily') }}",
            'group by 1, 2',
            '',
        ].join('\n'),
        'models/marts/_marts.yml': [
            'models:',
            '  - name: fct_revenue_monthly',
            '    description: Revenue per store and month.',
            '    columns:',
            '      - name: month',
            '        description: The first day of the month.',
            '      - name: revenue',
            '        description: The sum of the order amounts.',
            '',
        ].join('\n'),
    };
}

/** Crea el proyecto en `raiz` sin pisar nada de lo que ya haya. */
function crear(raiz, { nombre = 'amox_dbt_project', perfil = null } = {}) {
    const seguro = String(nombre).replace(/[^a-zA-Z0-9_]/g, '_') || 'amox_dbt_project';
    const p = perfil ? String(perfil).replace(/[^a-zA-Z0-9_]/g, '_') : seguro;
    for (const d of ['models/staging', 'models/intermediate', 'models/marts', 'macros', 'tests', 'seeds', 'snapshots', 'analyses']) {
        fs.mkdirSync(path.join(raiz, d), { recursive: true });
    }
    const creados = [];
    for (const [rel, texto] of Object.entries(archivosIniciales(seguro, p))) {
        const f = path.join(raiz, rel);
        if (fs.existsSync(f)) continue;
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, texto, 'utf8');
        creados.push(rel);
    }
    const gitignore = path.join(raiz, '.gitignore');
    const bloque = '\n# DBT\ntarget/\ndbt_packages/\nlogs/\n*.duckdb\n*.duckdb.wal\n';
    if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, bloque.trim() + '\n', 'utf8');
    else if (!fs.readFileSync(gitignore, 'utf8').includes('# DBT')) fs.appendFileSync(gitignore, bloque, 'utf8');
    // Dec-29: se empieza en producción.
    if (creados.includes('profiles.yml')) {
        const cfg = scaffolder.getProjectConfig(raiz)?.dbt || {};
        scaffolder.saveProjectConfig(raiz, { dbt: { ...cfg, target: 'prod', produccion: ['prod'] } });
    }
    return { nombre: seguro, perfil: p, creados };
}

// ── Plantillas que se explican (I9) ─────────────────────────────────────────

const EXPLICACIONES = {
    incremental: 'An incremental model only processes what is new since the last run and adds it to the table: on the first run it builds everything; afterwards, the part inside «is_incremental()» filters the rows newer than what the table already has. Use it for large tables that only grow (events, orders). «--full-refresh» rebuilds it from scratch.',
    snapshot: 'A snapshot keeps the history of a table that changes in place: each run compares the current rows with the last ones it saw and, when a row changed, closes the old version (dbt_valid_to) and adds the new one. Use it when the source overwrites values (a customer\'s address, a product\'s price) and you need to know what they were before. Run it with «dbt snapshot» or «dbt build».',
};

/** Un *snapshot* en YAML (dbt ≥ 1.9; comprobado en la fase 0.7). */
function plantillaSnapshot({ nombre, relacion, clave = 'id', estrategia = 'timestamp', columnaFecha = 'updated_at' }) {
    const seguro = String(nombre || '').replace(/[^a-zA-Z0-9_]/g, '_');
    if (!seguro) throw new Error('The snapshot needs a name.');
    const rel = String(relacion || '').trim() || "ref('stg_orders')";
    const config = estrategia === 'check'
        ? ['      strategy: check', '      check_cols: all']
        : ['      strategy: timestamp', `      updated_at: ${columnaFecha}`];
    return {
        archivo: `snapshots/${seguro}.yml`,
        texto: [
            `# ${EXPLICACIONES.snapshot}`,
            'snapshots:',
            `  - name: ${seguro}`,
            `    relation: ${rel}`,
            '    config:',
            `      unique_key: ${clave}`,
            ...config,
            '',
        ].join('\n'),
    };
}

module.exports = { targets, targetDeArgs, confirmacionNecesaria, conTarget, crearDev, crear, archivosIniciales, plantillaSnapshot, EXPLICACIONES, archivoDePerfiles };
