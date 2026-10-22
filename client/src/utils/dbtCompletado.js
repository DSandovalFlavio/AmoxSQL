/**
 * El completado de dbt (5.12, fase 3b; I12, Dec-35). Puro: sin Monaco ni red, para
 * poder probarlo solo (scripts/probarCompletadoDbt.mjs). SqlEditor lo traduce a
 * sugerencias, marcadores y ayuda al pasar el ratón.
 *
 * El catálogo (`cat`) es el de /api/dbt/catalogo: modelos, semillas, snapshots, fuentes,
 * macros con su firma, vars y targets. Nunca se lanza dbt para completar.
 *
 * Cada sugerencia: { label, insert, snippet, kind, detail, doc, sort }.
 *   kind: modulo · tabla · campo · funcion · variable · palabra · valor · fragmento
 */

// ── Lo que se sabe de dbt sin el proyecto ───────────────────────────────────

const CONFIG = [
    { k: 'materialized', v: "materialized='${1|view,table,incremental,ephemeral|}'", d: 'How dbt builds it: view, table, incremental or ephemeral.' },
    { k: 'unique_key', v: "unique_key='${1:id}'", d: 'The column (or list) that identifies a row: incremental models and snapshots use it to update instead of duplicating.' },
    { k: 'incremental_strategy', v: "incremental_strategy='${1|append,delete+insert,merge,microbatch|}'", d: 'How an incremental model adds the new rows.' },
    { k: 'on_schema_change', v: "on_schema_change='${1|ignore,fail,append_new_columns,sync_all_columns|}'", d: 'What an incremental model does when its columns change.' },
    { k: 'schema', v: "schema='${1:marts}'", d: 'The schema it is built in (by default, prefixed with the target schema).' },
    { k: 'alias', v: "alias='${1:name}'", d: 'The table or view name, when it should differ from the file name.' },
    { k: 'tags', v: "tags=['${1:daily}']", d: 'Labels to select it with «--select tag:…».' },
    { k: 'persist_docs', v: 'persist_docs={"relation": true, "columns": true}', d: 'Writes the descriptions as comments in the database (AmoxSQL shows them).' },
    { k: 'pre_hook', v: "pre_hook=\"${1:sql}\"", d: 'SQL that runs before building it.' },
    { k: 'post_hook', v: "post_hook=\"${1:sql}\"", d: 'SQL that runs after building it.' },
    { k: 'enabled', v: 'enabled=${1|true,false|}', d: 'false: dbt ignores it.' },
    { k: 'full_refresh', v: 'full_refresh=${1|false,true|}', d: 'false: «--full-refresh» never rebuilds it.' },
    { k: 'contract', v: 'contract={"enforced": true}', d: 'Checks the columns and their types against the YAML before building.' },
    { k: 'docs', v: 'docs={"show": ${1|true,false|}}', d: 'Whether it shows in the generated documentation.' },
];
const VALORES = {
    materialized: ['view', 'table', 'incremental', 'ephemeral'],
    incremental_strategy: ['append', 'delete+insert', 'merge', 'microbatch'],
    on_schema_change: ['ignore', 'fail', 'append_new_columns', 'sync_all_columns'],
    enabled: ['true', 'false'],
    full_refresh: ['true', 'false'],
};
const TARGET = [
    ['name', 'The active target (prod, dev…).'], ['schema', 'Its default schema.'], ['type', 'The adapter: duckdb.'],
    ['database', 'Its database (the file name, for DuckDB).'], ['threads', 'How many models dbt builds at once.'], ['profile_name', 'The profile in profiles.yml.'],
];
const THIS = [
    ['name', 'The model name.'], ['identifier', 'The table or view name.'], ['schema', 'Its schema.'], ['database', 'Its database.'],
];
const EXPRESIONES = [
    { label: 'ref', insert: "ref('${1:model}')", d: 'Another model, seed or snapshot: dbt builds them in order.' },
    { label: 'source', insert: "source('${1:source}', '${2:table}')", d: 'A table declared in a sources YAML.' },
    { label: 'config', insert: "config(\n    materialized='${1|view,table,incremental,ephemeral|}'\n)", d: 'This model\'s configuration.' },
    { label: 'var', insert: "var('${1:name}')", d: 'A variable from dbt_project.yml or «--vars».' },
    { label: 'env_var', insert: "env_var('${1:NAME}')", d: 'An environment variable (AmoxSQL sources come as AMOXSQL_FUENTE_<NAME>).' },
    { label: 'this', insert: 'this', d: 'This model\'s own table (in incremental models: what is already built).' },
    { label: 'target', insert: 'target', d: 'The active target: target.name, target.schema…' },
    { label: 'is_incremental', insert: 'is_incremental()', d: 'True when an incremental model already exists and the run is not a full refresh.' },
    { label: 'run_query', insert: "run_query('${1:select 1}')", d: 'Runs a query while compiling and returns its result.' },
    { label: 'log', insert: "log('${1:message}', info=True)", d: 'Writes to dbt\'s output.' },
    { label: 'adapter', insert: 'adapter', d: 'The adapter: adapter.get_columns_in_relation(…), adapter.quote(…)…' },
    { label: 'modules', insert: 'modules', d: 'Python modules available in Jinja: modules.datetime, modules.re…' },
];
const SENTENCIAS = [
    { label: 'if', insert: 'if ${1:condition} %}\n    $0\n{% endif', d: 'A condition.' },
    { label: 'if is_incremental', insert: 'if is_incremental() %}\nwhere ${1:updated_at} > (select max(${1:updated_at}) from {{ this }})\n{% endif', d: 'Only the new rows, in an incremental model.' },
    { label: 'for', insert: 'for ${1:item} in ${2:items} %}\n    $0\n{% endfor', d: 'A loop.' },
    { label: 'set', insert: 'set ${1:name} = ${2:value}', d: 'A variable for this file.' },
    { label: 'macro', insert: 'macro ${1:name}(${2:args}) %}\n    $0\n{% endmacro', d: 'A reusable macro.' },
    { label: 'call statement', insert: "call statement('${1:name}', fetch_result=True) %}\n    ${2:select 1}\n{% endcall", d: 'Runs a statement and keeps its result.' },
    { label: 'do', insert: 'do ${1:expression}', d: 'Evaluates without writing anything.' },
    { label: 'else', insert: 'else', d: '' }, { label: 'elif', insert: 'elif ${1:condition}', d: '' },
    { label: 'endif', insert: 'endif', d: '' }, { label: 'endfor', insert: 'endfor', d: '' }, { label: 'endmacro', insert: 'endmacro', d: '' },
];
const TESTS_GENERICOS = [
    { label: 'unique', insert: 'unique', d: 'No two rows have the same value.' },
    { label: 'not_null', insert: 'not_null', d: 'No empty values.' },
    { label: 'accepted_values', insert: 'accepted_values:\n    arguments:\n      values: [${1:\'a\', \'b\'}]', d: 'Only these values.' },
    { label: 'relationships', insert: "relationships:\n    arguments:\n      to: ref('${1:model}')\n      field: ${2:id}", d: 'Every value exists in another model.' },
];

// ── Dónde está el cursor ────────────────────────────────────────────────────

/**
 * El contexto de dbt del texto hasta el cursor.
 * tipo: ref · fuente · tablaDeFuente · var · target · this · config · valorDeConfig ·
 *       paquete · expresion · sentencia · sql
 */
export function contexto(texto) {
    const t = String(texto || '');
    const ie = t.lastIndexOf('{{'), ce = t.lastIndexOf('}}');
    const is = t.lastIndexOf('{%'), cs = t.lastIndexOf('%}');
    const enExpr = ie > ce && ie > is;
    const enSent = is > cs && is > ie;
    if (!enExpr && !enSent) return { tipo: 'sql' };
    const dentro = t.slice((enExpr ? ie : is) + 2);
    let m;
    if ((m = /\bref\(\s*(?:['"][\w.]+['"]\s*,\s*)?['"]([\w.]*)$/.exec(dentro))) return { tipo: 'ref', prefijo: m[1] };
    if ((m = /\bsource\(\s*['"]([\w]+)['"]\s*,\s*['"]([\w]*)$/.exec(dentro))) return { tipo: 'tablaDeFuente', fuente: m[1], prefijo: m[2] };
    if ((m = /\bsource\(\s*['"]([\w]*)$/.exec(dentro))) return { tipo: 'fuente', prefijo: m[1] };
    if ((m = /\bvar\(\s*['"]([\w]*)$/.exec(dentro))) return { tipo: 'var', prefijo: m[1] };
    if ((m = /\b(target|this)\.(\w*)$/.exec(dentro))) return { tipo: m[1], prefijo: m[2] };
    if ((m = /\bconfig\(([^)]*)$/.exec(dentro))) {
        const v = /(\w+)\s*=\s*(['"]?)([\w+-]*)$/.exec(m[1]);
        if (v) return { tipo: 'valorDeConfig', clave: v[1], comilla: v[2], prefijo: v[3] };
        return { tipo: 'config', prefijo: (/(\w*)$/.exec(m[1]) || ['', ''])[1] };
    }
    if ((m = /\b([a-zA-Z_]\w*)\.(\w*)$/.exec(dentro))) return { tipo: 'paquete', paquete: m[1], prefijo: m[2] };
    const prefijo = (/(\w*)$/.exec(dentro) || ['', ''])[1];
    return { tipo: enExpr ? 'expresion' : 'sentencia', prefijo };
}

const firmaComoSnippet = (firma, nombre) => {
    const m = /\(([\s\S]*)\)$/.exec(firma || '');
    if (!m || !m[1].trim()) return `${nombre}()`;
    // Sólo los argumentos sin valor por defecto: los demás, si se quieren.
    const obligatorios = m[1].split(',').map(a => a.trim()).filter(a => a && !a.includes('=') && !a.startsWith('*'));
    return `${nombre}(${obligatorios.map((a, i) => `\${${i + 1}:${a}}`).join(', ')})`;
};
const docDeMacro = (x) => [x.description, ...(x.arguments || []).map(a => `- \`${a.name}\`${a.type ? ` (${a.type})` : ''}${a.description ? `: ${a.description}` : ''}`)].filter(Boolean).join('\n');

/** Las sugerencias para un contexto. */
export function sugerencias(ctx, cat) {
    if (!ctx || !cat?.disponible) return [];
    const out = [];
    const add = (o) => out.push({ snippet: false, sort: '0', ...o });
    if (ctx.tipo === 'ref') {
        for (const [lista, tipo] of [[cat.modelos, 'model'], [cat.seeds, 'seed'], [cat.snapshots, 'snapshot']]) {
            for (const x of lista || []) add({ label: x.name, insert: x.name, kind: tipo === 'model' ? 'modulo' : 'tabla', detail: `${tipo}${x.materialized ? ` · ${x.materialized}` : ''}${x.nuevo ? ' · not compiled yet' : ''}`, doc: [x.description, x.path].filter(Boolean).join('\n\n'), sort: tipo === 'model' ? '0' : '1' });
        }
    } else if (ctx.tipo === 'fuente') {
        for (const f of cat.fuentes || []) add({ label: f.name, insert: f.name, kind: 'modulo', detail: `source · ${f.tables.length} table${f.tables.length === 1 ? '' : 's'}`, doc: f.description });
    } else if (ctx.tipo === 'tablaDeFuente') {
        const f = (cat.fuentes || []).find(x => x.name === ctx.fuente);
        for (const t of f?.tables || []) add({ label: t.name, insert: t.name, kind: 'tabla', detail: `source table (${f.name})`, doc: t.description });
    } else if (ctx.tipo === 'var') {
        for (const v of cat.vars || []) add({ label: v.name, insert: v.name, kind: 'variable', detail: 'var', doc: v.value != null ? `Default: \`${JSON.stringify(v.value)}\`` : '' });
    } else if (ctx.tipo === 'target' || ctx.tipo === 'this') {
        for (const [n, d] of ctx.tipo === 'target' ? TARGET : THIS) add({ label: n, insert: n, kind: 'campo', detail: `${ctx.tipo}.${n}`, doc: n === 'name' && ctx.tipo === 'target' && cat.targets?.length ? `${d} This project has: ${cat.targets.join(', ')}.` : d });
    } else if (ctx.tipo === 'config') {
        for (const c of CONFIG) add({ label: c.k, insert: c.v, snippet: true, kind: 'campo', detail: 'config', doc: c.d });
    } else if (ctx.tipo === 'valorDeConfig') {
        for (const v of VALORES[ctx.clave] || []) {
            const comilla = ['true', 'false'].includes(v) || ctx.comilla ? '' : "'";
            add({ label: v, insert: `${comilla}${v}${comilla}`, kind: 'valor', detail: ctx.clave });
        }
    } else if (ctx.tipo === 'paquete') {
        for (const x of (cat.macros || []).filter(mm => mm.package === ctx.paquete)) {
            add({ label: x.name, insert: firmaComoSnippet(x.firma, x.name), snippet: true, kind: 'funcion', detail: `${x.package}.${x.firma}`, doc: docDeMacro(x) });
        }
    } else if (ctx.tipo === 'expresion') {
        for (const e of EXPRESIONES) add({ label: e.label, insert: e.insert, snippet: /\$\{/.test(e.insert), kind: e.label === 'this' || e.label === 'target' ? 'variable' : 'funcion', detail: 'dbt', doc: e.d, sort: '0' });
        for (const x of (cat.macros || []).filter(mm => mm.propio)) add({ label: x.name, insert: firmaComoSnippet(x.firma, x.name), snippet: true, kind: 'funcion', detail: `macro · ${x.firma}`, doc: docDeMacro(x), sort: '1' });
        for (const p of [...new Set((cat.macros || []).filter(mm => !mm.propio).map(mm => mm.package))]) {
            add({ label: p, insert: `${p}.`, kind: 'modulo', detail: `package · ${(cat.macros || []).filter(mm => mm.package === p).length} macros`, doc: '', sort: '2' });
        }
    } else if (ctx.tipo === 'sentencia') {
        for (const s of SENTENCIAS) add({ label: s.label, insert: s.insert, snippet: /\$/.test(s.insert), kind: 'palabra', detail: 'Jinja', doc: s.d });
    }
    return out;
}

// ── Columnas a través de ref() y source() ───────────────────────────────────

const RESERVADAS = new Set(['where', 'join', 'left', 'right', 'inner', 'full', 'cross', 'on', 'group', 'order', 'limit', 'union', 'select', 'having', 'qualify', 'window', 'using', 'natural', 'lateral', 'except', 'intersect']);

/** alias (o nombre de CTE) → { ref } | { fuente, tabla } en el texto de un modelo. */
export function aliasDeRefs(texto) {
    const t = String(texto || '');
    const out = new Map();
    const reAlias = /\{\{\s*(ref|source)\(\s*['"]([\w.]+)['"](?:\s*,\s*['"]([\w.]+)['"])?\s*\)\s*\}\}(?:\s+(?:as\s+)?([a-zA-Z_]\w*))?/gi;
    let m;
    while ((m = reAlias.exec(t))) {
        const destino = m[1].toLowerCase() === 'ref' ? { ref: m[3] || m[2] } : { fuente: m[2], tabla: m[3] };
        if (m[4] && !RESERVADAS.has(m[4].toLowerCase())) out.set(m[4], destino);
    }
    // with fuente as (select * from {{ source(...) }})  — el patrón de staging
    const reCte = /\b([a-zA-Z_]\w*)\s+as\s*\(\s*select\s+\*\s+from\s+\{\{\s*(ref|source)\(\s*['"]([\w.]+)['"](?:\s*,\s*['"]([\w.]+)['"])?\s*\)\s*\}\}/gi;
    while ((m = reCte.exec(t))) {
        out.set(m[1], m[2].toLowerCase() === 'ref' ? { ref: m[4] || m[3] } : { fuente: m[3], tabla: m[4] });
    }
    return out;
}

/** Las columnas de un destino de ref()/source(). */
export function columnasDe(destino, cat) {
    if (!destino || !cat?.disponible) return [];
    if (destino.ref) {
        const x = [...(cat.modelos || []), ...(cat.seeds || []), ...(cat.snapshots || [])].find(y => y.name === destino.ref);
        return x?.columns || [];
    }
    const f = (cat.fuentes || []).find(y => y.name === destino.fuente);
    return f?.tables.find(y => y.name === destino.tabla)?.columns || [];
}

/** Tras «v.», las columnas de lo que es v; null si v no es un alias de ref/source. */
export function columnasTrasPunto(textoHastaCursor, textoCompleto, cat) {
    const m = /\b([a-zA-Z_]\w*)\.(\w*)$/.exec(String(textoHastaCursor || ''));
    if (!m) return null;
    const destino = aliasDeRefs(textoCompleto).get(m[1]);
    if (!destino) return null;
    const nombre = destino.ref || `${destino.fuente}.${destino.tabla}`;
    return columnasDe(destino, cat).map(c => ({ label: c.name, insert: c.name, kind: 'campo', detail: `${c.type || 'column'} (${nombre})`, doc: c.description || '', snippet: false, sort: '0' }));
}

/** Todas las columnas de lo que el modelo lee, para la lista general de un modelo. */
export function columnasDelModelo(textoCompleto, cat) {
    const vistos = new Set();
    const out = [];
    const t = String(textoCompleto || '');
    const re = /\{\{\s*(ref|source)\(\s*['"]([\w.]+)['"](?:\s*,\s*['"]([\w.]+)['"])?\s*\)\s*\}\}/gi;
    let m;
    while ((m = re.exec(t))) {
        const destino = m[1].toLowerCase() === 'ref' ? { ref: m[3] || m[2] } : { fuente: m[2], tabla: m[3] };
        const nombre = destino.ref || `${destino.fuente}.${destino.tabla}`;
        for (const c of columnasDe(destino, cat)) {
            if (vistos.has(c.name)) continue;
            vistos.add(c.name);
            out.push({ label: c.name, insert: c.name, kind: 'campo', detail: `${c.type || 'column'} (${nombre})`, doc: c.description || '', snippet: false, sort: '1_b' });
        }
    }
    return out;
}

// ── Avisos: un ref() o source() que no existe ───────────────────────────────

function distancia(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
}
const parecido = (nombre, lista) => {
    let mejor = null, dist = Infinity;
    for (const x of lista) { const dd = distancia(nombre.toLowerCase(), x.toLowerCase()); if (dd < dist) { dist = dd; mejor = x; } }
    return mejor && dist <= Math.max(2, Math.floor(nombre.length / 4)) ? mejor : null;
};

/** [{ linea, desde, hasta, mensaje }] (columnas desde 1, como Monaco). */
export function diagnosticos(texto, cat) {
    if (!cat?.disponible) return [];
    const nombres = [...(cat.modelos || []), ...(cat.seeds || []), ...(cat.snapshots || [])].map(x => x.name);
    const fuentes = cat.fuentes || [];
    const out = [];
    String(texto || '').split('\n').forEach((linea, i) => {
        let m;
        const reRef = /\bref\(\s*(?:['"]([\w.]+)['"]\s*,\s*)?['"]([\w.]+)['"]\s*\)/g;
        while ((m = reRef.exec(linea))) {
            if (m[1]) continue;            // ref('paquete', 'modelo'): de otro proyecto
            const n = m[2];
            if (nombres.includes(n)) continue;
            const p = parecido(n, nombres);
            const desde = m.index + m[0].indexOf(n, 4) + 1;
            out.push({ linea: i + 1, desde, hasta: desde + n.length, mensaje: `No model, seed or snapshot named «${n}» in this project.${p ? ` Did you mean «${p}»?` : ''}`, sugerencia: p });
        }
        const reSrc = /\bsource\(\s*['"]([\w]+)['"]\s*,\s*['"]([\w]+)['"]\s*\)/g;
        while ((m = reSrc.exec(linea))) {
            const f = fuentes.find(x => x.name === m[1]);
            const desde = m.index + 1;
            if (!f) {
                const p = parecido(m[1], fuentes.map(x => x.name));
                out.push({ linea: i + 1, desde, hasta: desde + m[0].length, mensaje: `No source named «${m[1]}».${p ? ` Did you mean «${p}»?` : ''}`, sugerencia: p });
            } else if (!f.tables.some(t => t.name === m[2])) {
                const p = parecido(m[2], f.tables.map(t => t.name));
                out.push({ linea: i + 1, desde, hasta: desde + m[0].length, mensaje: `The source «${m[1]}» has no table «${m[2]}».${p ? ` Did you mean «${p}»?` : ''}`, sugerencia: p });
            }
        }
    });
    return out;
}

// ── Al pasar el ratón ───────────────────────────────────────────────────────

/** Markdown de lo que hay bajo la columna `col` (desde 1) de una línea, o null. */
export function ayuda(linea, col, cat) {
    if (!cat?.disponible) return null;
    const c0 = col - 1;
    const dentro = (m) => c0 >= m.index && c0 <= m.index + m[0].length;
    let m;
    const reRef = /\bref\(\s*(?:['"][\w.]+['"]\s*,\s*)?['"]([\w.]+)['"]\s*\)/g;
    while ((m = reRef.exec(linea))) {
        if (!dentro(m)) continue;
        const x = [...(cat.modelos || []), ...(cat.seeds || []), ...(cat.snapshots || [])].find(y => y.name === m[1]);
        if (!x) return { md: `**${m[1]}** — not found in this project.`, desde: m.index + 1, hasta: m.index + m[0].length + 1 };
        const cols = (x.columns || []).slice(0, 15).map(cc => `- \`${cc.name}\`${cc.type ? ` ${cc.type}` : ''}${cc.description ? ` — ${cc.description}` : ''}`).join('\n');
        const mas = (x.columns || []).length > 15 ? `\n- …and ${x.columns.length - 15} more` : '';
        return {
            md: [`**${x.name}**${x.materialized ? ` · ${x.materialized}` : ''}${x.nuevo ? ' · not compiled yet' : ''}`, x.description, x.relation ? `\`${x.relation}\`` : null, cols ? `**Columns**\n${cols}${mas}` : null, x.path ? `_${x.path}_` : null].filter(Boolean).join('\n\n'),
            desde: m.index + 1, hasta: m.index + m[0].length + 1,
        };
    }
    const reSrc = /\bsource\(\s*['"]([\w]+)['"]\s*,\s*['"]([\w]+)['"]\s*\)/g;
    while ((m = reSrc.exec(linea))) {
        if (!dentro(m)) continue;
        const f = (cat.fuentes || []).find(y => y.name === m[1]);
        const t = f?.tables.find(y => y.name === m[2]);
        if (!t) return { md: `**${m[1]}.${m[2]}** — not found in this project.`, desde: m.index + 1, hasta: m.index + m[0].length + 1 };
        const cols = (t.columns || []).slice(0, 15).map(cc => `- \`${cc.name}\`${cc.description ? ` — ${cc.description}` : ''}`).join('\n');
        return { md: [`**${f.name}.${t.name}** · source`, t.description, cols ? `**Columns**\n${cols}` : null, f.path ? `_${f.path}_` : null].filter(Boolean).join('\n\n'), desde: m.index + 1, hasta: m.index + m[0].length + 1 };
    }
    // Una macro: «dbt_utils.star(» o «mi_macro(»
    const reMacro = /\b(?:([a-zA-Z_]\w*)\.)?([a-zA-Z_]\w*)\s*\(/g;
    while ((m = reMacro.exec(linea))) {
        if (!(c0 >= m.index && c0 < m.index + m[0].length - 1)) continue;
        const x = (cat.macros || []).find(y => y.name === m[2] && (m[1] ? y.package === m[1] : y.propio));
        if (x) return { md: [`\`${x.package}.${x.firma}\``, docDeMacro(x)].filter(Boolean).join('\n\n'), desde: m.index + 1, hasta: m.index + m[0].length };
    }
    return null;
}

// ── schema.yml ──────────────────────────────────────────────────────────────

const sangria = (l) => (/^(\s*)/.exec(l) || ['', ''])[1].length;

/**
 * Sugerencias en un YAML de dbt (models, sources…). `texto` es todo lo que hay hasta
 * el cursor. Mira la línea actual y las claves de las que cuelga, por sangría.
 */
export function sugerenciasYaml(texto, cat) {
    const lineas = String(texto || '').split('\n');
    const actual = lineas[lineas.length - 1];
    const ind = sangria(actual);
    const enLista = /^\s*-\s*/.test(actual);
    // Las claves de las que cuelga (de dentro afuera). Una línea «- clave: …» de más
    // arriba con el contenido a la misma sangría es el MISMO elemento de la lista:
    // no es un padre; su padre es la clave de encima del guion.
    const padres = [];
    let limite = ind;
    let lineaDeColumns = -1;
    for (let i = lineas.length - 2; i >= 0; i--) {
        const l = lineas[i];
        if (!l.trim() || l.trim().startsWith('#')) continue;
        const s = sangria(l);
        const guion = /^(\s*-\s*)/.exec(l);
        const contenido = guion ? guion[1].length : s;
        if (guion && contenido === limite) { limite = s; continue; }
        const k = /^\s*-?\s*([\w-]+)\s*:/.exec(l);
        if (s < limite && k) {
            padres.push(k[1]);
            if (k[1] === 'columns' && lineaDeColumns < 0) lineaDeColumns = i;
            limite = s;
        }
        if (s === 0) break;
    }
    // El modelo del que cuelgan las columnas: el «- name:» del elemento que tiene
    // ese «columns:».
    let modeloActual = null;
    if (lineaDeColumns >= 0) {
        const ic = sangria(lineas[lineaDeColumns]);
        for (let i = lineaDeColumns - 1; i >= 0; i--) {
            const nm = /^(\s*)-\s*name\s*:\s*([\w.]+)/.exec(lineas[i]);
            if (nm && nm[1].length < ic) { modeloActual = nm[2]; break; }
            if (sangria(lineas[i]) < ic - 2 && lineas[i].trim()) break;
        }
    }
    const p0 = padres[0], p1 = padres[1];
    const valorDe = /^\s*-?\s*([\w-]+)\s*:\s*([\w.]*)$/.exec(actual);
    const add = (label, insert, kind, detail, doc = '', snippet = false) => ({ label, insert, kind, detail, doc, snippet, sort: '0' });

    // Valores
    if (valorDe && valorDe[1] === 'name') {
        if (p0 === 'models') return [...(cat?.modelos || [])].map(x => add(x.name, x.name, 'modulo', `model${x.materialized ? ` · ${x.materialized}` : ''}`, x.description));
        if (p0 === 'seeds') return (cat?.seeds || []).map(x => add(x.name, x.name, 'tabla', 'seed'));
        if (p0 === 'snapshots') return (cat?.snapshots || []).map(x => add(x.name, x.name, 'tabla', 'snapshot'));
        if (p0 === 'columns' && modeloActual) {
            const x = [...(cat?.modelos || []), ...(cat?.seeds || []), ...(cat?.snapshots || [])].find(y => y.name === modeloActual);
            return (x?.columns || []).map(c => add(c.name, c.name, 'campo', `${c.type || 'column'} (${modeloActual})`, c.description));
        }
        return [];
    }
    if (valorDe && valorDe[1] === 'materialized') return VALORES.materialized.map(v => add(v, v, 'valor', 'materialized'));
    if (valorDe && valorDe[2] !== undefined && valorDe[2] !== '' && !enLista) return [];
    // Tests genéricos
    if (p0 === 'data_tests' || p0 === 'tests') return TESTS_GENERICOS.map(t => add(t.label, t.insert, 'fragmento', 'generic test', t.d, /\$\{/.test(t.insert)));
    // Claves
    if (ind === 0 && !enLista) return ['version: 2', 'models:', 'sources:', 'seeds:', 'snapshots:', 'macros:', 'exposures:'].map(k => add(k.replace(/:.*$/, ''), k.endsWith(':') ? `${k}\n  - ` : k, 'palabra', 'dbt YAML'));
    if (p0 === 'columns') return ['name', 'description', 'data_type', 'data_tests', 'meta'].map(k => add(k, `${k}: `, 'campo', 'column'));
    if (p0 === 'models' || p0 === 'seeds' || p0 === 'snapshots') return ['name', 'description', 'config', 'columns', 'data_tests', 'docs', 'meta'].map(k => add(k, k === 'columns' ? 'columns:\n  - name: ' : `${k}: `, 'campo', p0.replace(/s$/, '')));
    if (p0 === 'sources') return ['name', 'description', 'database', 'schema', 'tables', 'loaded_at_field', 'freshness', 'config'].map(k => add(k, k === 'tables' ? 'tables:\n  - name: ' : `${k}: `, 'campo', 'source'));
    if (p0 === 'tables' && p1 === 'sources') return ['name', 'description', 'identifier', 'columns', 'loaded_at_field', 'freshness', 'config'].map(k => add(k, `${k}: `, 'campo', 'source table'));
    if (p0 === 'config') return CONFIG.map(c => add(c.k, `${c.k}: `, 'campo', 'config', c.d));
    return [];
}
