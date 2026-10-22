/**
 * El puente entre AmoxSQL y dbt (5.12, fase 6; I7 e I6, Dec-31 y Dec-32).
 *
 * I7 — las fuentes con nombre de AmoxSQL como `sources` de dbt. AmoxSQL escribe
 * `models/sources/amoxsql.yml` con una source `amoxsql` y una tabla por fuente, cuyo
 * `external_location` es `{{ env_var('AMOXSQL_FUENTE_<NOMBRE>') }}`: la ruta de cada
 * máquina no se escribe en un archivo que viaja en git (Dec-9). El corredor de dbt pone
 * esas variables (dbt/fuentes.js) con la MISMA lectura que la vista de la fuente en
 * AmoxSQL (el Excel con su rango, el más nuevo de una carpeta…). Comprobado con el dbt
 * real: dbt-duckdb usa tal cual un `external_location` con «(»; `formatter: template`
 * evita que unas llaves del SQL rompan su `format`; sin la variable (dbt fuera de
 * AmoxSQL) el resto del proyecto corre y sólo esa fuente falla, diciendo por qué; y la
 * frescura sale de la fecha del archivo (`loaded_at_query` + `read_blob`).
 *
 * I6 — promover una consulta a modelo: las tablas pasan a `{{ ref('…') }}` (las que son
 * un modelo, una semilla o un snapshot) y `{{ source('amoxsql', '…') }}` (las fuentes
 * con nombre, que se añaden al YAML si no estaban); lo que no se sabe de dónde sale se
 * marca. La consulta original no se toca.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const fuentes = require('../fuentes');
const resultados = require('./resultados');
const modelo = require('./modelo');
const { nombreDeVariable } = require('./fuentes');

const unix = (p) => String(p || '').replace(/\\/g, '/');
const enDbt = (nombre) => String(nombre).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'fuente';
const USABLES = new Set(['archivo', 'carpeta']);

/** Dónde vive el YAML de las fuentes de AmoxSQL. */
function archivoYaml(raiz) {
    const c = modelo.carpetas(raiz);
    return path.join(raiz, c?.modelos?.[0] || 'models', 'sources', 'amoxsql.yml');
}

function leerYaml(raiz) {
    try { return yaml.load(fs.readFileSync(archivoYaml(raiz), 'utf8')) || {}; } catch { return {}; }
}

/** Las fuentes de AmoxSQL que el proyecto puede usar, y si ya están en dbt. */
function estado(raiz) {
    const { fuentes: lista } = fuentes.definiciones({ raiz });
    const y = leerYaml(raiz);
    const src = (y.sources || []).find(s => s.name === 'amoxsql');
    const dentro = new Set((src?.tables || []).map(t => t.meta?.amoxsql_fuente).filter(Boolean));
    return {
        archivo: unix(path.relative(raiz, archivoYaml(raiz))),
        fuentes: lista.map(({ def }) => ({
            nombre: def.nombre, tipo: def.tipo, descripcion: def.descripcion || '', enDbt: dentro.has(def.nombre),
            nombreEnDbt: enDbt(def.nombre),
            usable: USABLES.has(def.tipo),
            motivo: USABLES.has(def.tipo) ? null : 'Buckets and lakes need their credential inside dbt\'s connection: declare them in profiles.yml.',
        })),
    };
}

function tablaDe(def) {
    const v = nombreDeVariable(def.nombre);
    const aviso = `The AmoxSQL source «${def.nombre}» is only available when dbt runs from AmoxSQL.`.replace(/'/g, "''");
    const t = {
        name: enDbt(def.nombre),
        ...(def.descripcion ? { description: def.descripcion } : {}),
        meta: { amoxsql_fuente: def.nombre },
        config: {
            external_location: `{{ env_var('${v}', "(select error('${aviso}'))") }}`,
            formatter: 'template',
            loaded_at_query: `select last_modified from read_blob('{{ env_var('${v}_ARCHIVO', '') }}')`,
        },
    };
    if (def.frescuraDias) t.config.freshness = { warn_after: { count: Number(def.frescuraDias), period: 'day' } };
    return t;
}

/**
 * Deja en el YAML exactamente las fuentes `nombres` (las de AmoxSQL; lo que el usuario
 * haya añadido a mano a esa source, si no es de AmoxSQL, se respeta).
 */
function escribir(raiz, nombres) {
    const { fuentes: lista } = fuentes.definiciones({ raiz });
    const porNombre = new Map(lista.map(x => [x.def.nombre, x.def]));
    const malas = nombres.filter(n => !porNombre.has(n) || !USABLES.has(porNombre.get(n).tipo));
    if (malas.length) throw new Error(`These sources cannot be used in dbt: ${malas.join(', ')} (unknown, or a bucket or lake).`);
    const y = leerYaml(raiz);
    y.sources = Array.isArray(y.sources) ? y.sources : [];
    let src = y.sources.find(s => s.name === 'amoxsql');
    if (!src) {
        src = { name: 'amoxsql', description: 'Named sources of AmoxSQL. Their location on each computer comes from environment variables that AmoxSQL sets when it runs dbt.' };
        y.sources.push(src);
    }
    const aMano = (src.tables || []).filter(t => !t.meta?.amoxsql_fuente);
    src.tables = [...aMano, ...nombres.map(n => tablaDe(porNombre.get(n)))];
    if (!src.tables.length) y.sources = y.sources.filter(s => s !== src);
    const f = archivoYaml(raiz);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const cabecera = '# Written by AmoxSQL (DBT Studio → Sources). The location of each source comes from\n# AMOXSQL_FUENTE_<NAME>, set by AmoxSQL when it runs dbt: it is not written here.\n';
    fs.writeFileSync(f, cabecera + yaml.dump(y, { lineWidth: 200, noRefs: true }), 'utf8');
    return estado(raiz);
}

// ── Promover una consulta a modelo (I6, Dec-32) ─────────────────────────────

const RESERVADAS = new Set(['select', 'lateral', 'unnest', 'read_csv', 'read_parquet', 'read_json', 'read_json_auto', 'read_xlsx', 'generate_series', 'range', 'values']);

/** Los nombres de CTE de una consulta (no son tablas). */
function ctes(sql) {
    const out = new Set();
    const re = /(?:\bwith\b|,)\s*(?:recursive\s+)?("?[\w]+"?)\s+as\s*(?:not\s+materialized\s+|materialized\s+)?\(/gi;
    let m;
    while ((m = re.exec(sql))) out.add(m[1].replace(/"/g, '').toLowerCase());
    return out;
}

/**
 * La consulta como modelo: { texto, cambios: [{ de, a }], dudas: [nombre], fuentesNuevas: [nombre] }.
 */
function convertir(raiz, sql) {
    const m = resultados.manifiesto(raiz);
    const nodos = Object.values(m?.nodes || {}).filter(n => ['model', 'seed', 'snapshot'].includes(n.resource_type));
    const porRelacion = new Map();
    for (const n of nodos) {
        const alias = String(n.alias || n.name).toLowerCase();
        for (const k of [alias, `${n.schema}.${alias}`, `user_db.${n.schema}.${alias}`, `${n.database}.${n.schema}.${alias}`]) porRelacion.set(String(k).toLowerCase(), n.name);
    }
    const { fuentes: definidas } = fuentes.definiciones({ raiz });
    const deFuentes = new Map(definidas.map(x => [x.def.nombre.toLowerCase(), x.def]));
    const sinCtes = ctes(sql);
    const cambios = [], dudas = [], fuentesNuevas = new Set();
    // FROM/JOIN <relación> — la relación puede venir entre comillas y con puntos.
    const re = /\b(from|join)(\s+)((?:"[^"]+"|[\w$]+)(?:\.(?:"[^"]+"|[\w$]+)){0,2})(?![\w$"])(?!\s*\()/gi;
    const texto = sql.replace(re, (todo, palabra, espacio, rel) => {
        const limpio = rel.replace(/"/g, '');
        const k = limpio.toLowerCase();
        if (sinCtes.has(k) || RESERVADAS.has(k)) return todo;
        // fuentes."nombre" → source('amoxsql', 'nombre')
        const f = /^fuentes\.(.+)$/i.exec(limpio);
        if (f) {
            const def = deFuentes.get(f[1].toLowerCase());
            if (def && USABLES.has(def.tipo)) {
                const a = `{{ source('amoxsql', '${enDbt(def.nombre)}') }}`;
                cambios.push({ de: rel, a });
                fuentesNuevas.add(def.nombre);
                return `${palabra}${espacio}${a}`;
            }
            dudas.push(limpio);
            return todo;
        }
        const n = porRelacion.get(k);
        if (n) {
            const a = `{{ ref('${n}') }}`;
            cambios.push({ de: rel, a });
            return `${palabra}${espacio}${a}`;
        }
        dudas.push(limpio);
        return todo;
    });
    return { texto, cambios, dudas: [...new Set(dudas)], fuentesNuevas: [...fuentesNuevas] };
}

/** Escribe `models/<capa>/<nombre>.sql` y, si hace falta, añade las fuentes al YAML. */
function promover(raiz, { sql, nombre, capa = 'marts', origen = null }) {
    const n = String(nombre || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!n) throw new Error('The model needs a name.');
    if (!String(sql || '').trim()) throw new Error('There is no query to promote.');
    const c = modelo.carpetas(raiz);
    if (!c) throw new Error('This folder is not a dbt project (there is no dbt_project.yml).');
    const rel = unix(path.join(c.modelos[0] || 'models', String(capa || '').replace(/[^\w/-]/g, '') || '', `${n}.sql`)).replace(/\/+/g, '/');
    const f = path.join(raiz, rel);
    if (fs.existsSync(f)) throw new Error(`${rel} already exists. Choose another name.`);
    const r = convertir(raiz, String(sql).trim().replace(/;\s*$/, ''));
    const dudas = r.dudas.map(d => `-- AmoxSQL: I do not know where «${d}» comes from. Use {{ ref('…') }} or {{ source('…', '…') }}.`);
    const texto = [
        `-- Promoted from ${origen ? `«${origen}»` : 'a query'} on ${new Date().toISOString().slice(0, 10)}.`,
        ...dudas,
        '',
        r.texto,
        '',
    ].join('\n');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, texto, 'utf8');
    if (r.fuentesNuevas.length) {
        const ya = estado(raiz).fuentes.filter(x => x.enDbt).map(x => x.nombre);
        escribir(raiz, [...new Set([...ya, ...r.fuentesNuevas])]);
    }
    return { archivo: rel, cambios: r.cambios, dudas: r.dudas, fuentesNuevas: r.fuentesNuevas };
}

module.exports = { estado, escribir, convertir, promover, enDbt, archivoYaml };
