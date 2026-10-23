/**
 * Qué cambió en un proceso (5.14, J9; Dec-53).
 *
 * El diff de texto de un `.sqlchain` habla de llaves y comillas; éste habla de
 * pasos: los que se añadieron, quitaron o cambiaron (por su etiqueta, con cada
 * campo en palabras), las conexiones, los parámetros y las variables. Mover un
 * nodo en el lienzo no es un cambio.
 *
 * Pura: recibe dos definiciones (o su texto) y devuelve el cambio; `describir`
 * lo pone en líneas.
 */

const NOMBRES = {
    sql_file: 'SQL File', sql_inline: 'SQL Query', import_file: 'Import File', import_folder: 'Import Folder',
    export_file: 'Export File', excel: 'Excel', publicar: 'Publish', create_table: 'Create Table', checkpoint: 'Checkpoint',
    fuente: 'Source', table_ref: 'Table Source', merge_tables: 'Merge Tables', assert: 'Assert', join_tables: 'Join Tables',
    filter: 'Filter', group_aggregate: 'Group & Aggregate', select_columns: 'Select Columns', deduplicate: 'Deduplicate',
    add_column: 'Add Column', sort: 'Sort', sample: 'Sample', pivot: 'Pivot', rename_table: 'Rename Table',
    type_cast: 'Type Cast', window_functions: 'Window Functions', unpivot: 'Unpivot', bucket_read: 'Cloud Bucket',
    gsheet_read: 'Google Sheet', ai_enrich: 'AI Enrich', http_fetch: 'HTTP Fetch', clean: 'Clean / Replace',
    date_ops: 'Date / Time', flatten: 'Flatten / Unnest', schema_validation: 'Schema Validation',
    notification: 'Notification', chart: 'Chart', report: 'Report',
};

/** Lo que no es del proceso sino del lienzo. */
const IGNORAR_NODO = new Set(['position', 'positionAbsolute', 'width', 'height', 'measured', 'selected', 'dragging']);

function leer(def) {
    if (def == null || def === '') return { nodes: [], edges: [] };
    if (typeof def === 'string') {
        try { return JSON.parse(def); } catch { throw new Error('It is not a valid process file.'); }
    }
    return def;
}

/** `outputPath` → `output path`; `aggregations[0].func` → `aggregations 1 · func`. */
function campo(ruta) {
    return ruta
        .replace(/\[(\d+)\]/g, (_, i) => ` ${Number(i) + 1}`)
        .split('.')
        .map(p => p.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase())
        .join(' · ');
}

/** Aplana un objeto a `ruta → valor` (las listas de escalares quedan enteras). */
function aplanar(v, prefijo = '', fuera = {}) {
    if (Array.isArray(v)) {
        if (v.every(x => x === null || typeof x !== 'object')) { fuera[prefijo] = v; return fuera; }
        v.forEach((x, i) => aplanar(x, `${prefijo}[${i}]`, fuera));
        if (!v.length) fuera[prefijo] = [];
        return fuera;
    }
    if (v && typeof v === 'object') {
        const claves = Object.keys(v);
        if (!claves.length && prefijo) fuera[prefijo] = {};
        for (const k of claves) aplanar(v[k], prefijo ? `${prefijo}.${k}` : k, fuera);
        return fuera;
    }
    fuera[prefijo] = v;
    return fuera;
}

const vacio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
const igual = (a, b) => (vacio(a) && vacio(b)) || JSON.stringify(a) === JSON.stringify(b);

/** Un valor dicho corto: el texto entre comillas inversas, recortado. */
function valor(v) {
    if (vacio(v)) return '(empty)';
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    const una = s.replace(/\s+/g, ' ').trim();
    return `\`${una.length > 90 ? `${una.slice(0, 87)}…` : una}\``;
}

function camposQueCambian(a, b) {
    const fa = aplanar(a || {});
    const fb = aplanar(b || {});
    const rutas = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort();
    return rutas.filter(r => !igual(fa[r], fb[r])).map(r => ({ campo: campo(r), antes: fa[r], despues: fb[r] }));
}

const etiquetaDe = (n) => n?.label || NOMBRES[n?.type] || n?.type || n?.id || '?';

/**
 * El cambio de `antes` a `despues`. Los nodos se emparejan por `id` (lo que el
 * editor conserva al mover, renombrar o reconfigurar).
 */
function diferencias(antes, despues) {
    const a = leer(antes);
    const b = leer(despues);
    const na = new Map((a.nodes || []).map(n => [n.id, n]));
    const nb = new Map((b.nodes || []).map(n => [n.id, n]));
    const nodo = (n) => ({ id: n.id, etiqueta: etiquetaDe(n), tipo: NOMBRES[n.type] || n.type });

    const anadidos = [...nb.values()].filter(n => !na.has(n.id)).map(nodo);
    const quitados = [...na.values()].filter(n => !nb.has(n.id)).map(nodo);
    const cambiados = [];
    for (const [id, n2] of nb) {
        const n1 = na.get(id);
        if (!n1) continue;
        const campos = [];
        if ((n1.label || '') !== (n2.label || '')) campos.push({ campo: 'name', antes: etiquetaDe(n1), despues: etiquetaDe(n2) });
        if (n1.type !== n2.type) campos.push({ campo: 'kind', antes: NOMBRES[n1.type] || n1.type, despues: NOMBRES[n2.type] || n2.type });
        if (!!n1.disabled !== !!n2.disabled) campos.push({ campo: 'enabled', antes: !n1.disabled, despues: !n2.disabled });
        if (!igual(n1.description, n2.description)) campos.push({ campo: 'description', antes: n1.description, despues: n2.description });
        const otros = (n) => Object.fromEntries(Object.entries(n).filter(([k]) => !['id', 'type', 'label', 'disabled', 'description', 'config', ...IGNORAR_NODO].includes(k)));
        campos.push(...camposQueCambian({ config: n1.config || {}, ...otros(n1) }, { config: n2.config || {}, ...otros(n2) })
            .map(c => ({ ...c, campo: c.campo.replace(/^config · /, '') })));
        if (campos.length) cambiados.push({ ...nodo(n2), antes: etiquetaDe(n1), campos });
    }

    const nombreEn = (mapa, otro, id) => etiquetaDe(mapa.get(id) || otro.get(id) || { id });
    const conexion = (e) => `${e.source}→${e.target}`;
    const ea = new Set((a.edges || []).map(conexion));
    const eb = new Set((b.edges || []).map(conexion));
    const conexiones = {
        anadidas: (b.edges || []).filter(e => !ea.has(conexion(e))).map(e => ({ de: nombreEn(nb, na, e.source), a: nombreEn(nb, na, e.target) })),
        quitadas: (a.edges || []).filter(e => !eb.has(conexion(e))).map(e => ({ de: nombreEn(na, nb, e.source), a: nombreEn(na, nb, e.target) })),
    };

    const porNombre = (lista) => new Map((lista || []).map(p => [p.nombre, p]));
    const pa = porNombre(a.parametros);
    const pb = porNombre(b.parametros);
    const parametros = {
        anadidos: [...pb.keys()].filter(k => !pa.has(k)),
        quitados: [...pa.keys()].filter(k => !pb.has(k)),
        cambiados: [...pb.keys()].filter(k => pa.has(k)).map(k => ({ nombre: k, campos: camposQueCambian(pa.get(k), pb.get(k)) })).filter(x => x.campos.length),
    };

    const va = a.variables || {};
    const vb = b.variables || {};
    const variables = {
        anadidas: Object.keys(vb).filter(k => !(k in va)).map(k => ({ nombre: k, valor: vb[k] })),
        quitadas: Object.keys(va).filter(k => !(k in vb)).map(k => ({ nombre: k, valor: va[k] })),
        cambiadas: Object.keys(vb).filter(k => k in va && !igual(va[k], vb[k])).map(k => ({ nombre: k, antes: va[k], despues: vb[k] })),
    };

    const proceso = camposQueCambian(
        { name: a.name, description: a.description, config: a.config || {}, vista: a.vista },
        { name: b.name, description: b.description, config: b.config || {}, vista: b.vista },
    ).map(c => ({ ...c, campo: c.campo.replace(/^config · /, '').replace(/^vista$/, 'opens as') }));

    const cuantos = anadidos.length + quitados.length + cambiados.length + conexiones.anadidas.length + conexiones.quitadas.length
        + parametros.anadidos.length + parametros.quitados.length + parametros.cambiados.length
        + variables.anadidas.length + variables.quitadas.length + variables.cambiadas.length + proceso.length;

    return { nodos: { anadidos, quitados, cambiados }, conexiones, parametros, variables, proceso, cuantos, igual: cuantos === 0 };
}

/** El cambio en líneas, para leer de corrido (y para un mensaje de commit). */
function describir(d) {
    if (d.igual) return ['Nothing changed in the process.'];
    const l = [];
    const nombreCampo = (c) => `${c.campo}: ${valor(c.antes)} → ${valor(c.despues)}`;
    for (const c of d.proceso) l.push(`Process · ${nombreCampo(c)}`);
    for (const n of d.nodos.anadidos) l.push(`Added step «${n.etiqueta}» (${n.tipo})`);
    for (const n of d.nodos.quitados) l.push(`Removed step «${n.etiqueta}» (${n.tipo})`);
    for (const n of d.nodos.cambiados) for (const c of n.campos) l.push(`${n.etiqueta} · ${nombreCampo(c)}`);
    for (const e of d.conexiones.anadidas) l.push(`Connected «${e.de}» → «${e.a}»`);
    for (const e of d.conexiones.quitadas) l.push(`Disconnected «${e.de}» → «${e.a}»`);
    for (const p of d.parametros.anadidos) l.push(`Added parameter ${p}`);
    for (const p of d.parametros.quitados) l.push(`Removed parameter ${p}`);
    for (const p of d.parametros.cambiados) for (const c of p.campos) l.push(`Parameter ${p.nombre} · ${nombreCampo(c)}`);
    for (const v of d.variables.anadidas) l.push(`Added variable ${v.nombre} = ${valor(v.valor)}`);
    for (const v of d.variables.quitadas) l.push(`Removed variable ${v.nombre}`);
    for (const v of d.variables.cambiadas) l.push(`Variable ${v.nombre}: ${valor(v.antes)} → ${valor(v.despues)}`);
    return l;
}

// ── El Canvas (5.15, fase 3) ─────────────────────────────────────────────────

const TIPOS_DE_TARJETA = { source: 'Source', query: 'Query', chart: 'Chart', number: 'Number', note: 'Note', text: 'Text', frame: 'Frame' };
/** Lo que no es del análisis sino de la pantalla o de la última ejecución. */
const IGNORAR_TARJETA = new Set(['x', 'y', 'w', 'h', 'foto', 'modo']);

function leerLienzo(def) {
    const l = leer(def);
    const tarjetas = (l.tarjetas || []).map(t => ({ ...t, sql: Array.isArray(t.sql) ? t.sql.join('\n') : t.sql }));
    return { ...l, tarjetas };
}

/**
 * Qué cambió en un `.amoxcanvas`, con la misma forma que el de un proceso (para
 * pintarlo igual): tarjetas añadidas, quitadas y cambiadas campo a campo —el SQL,
 * la fuente, el gráfico, la cifra, el texto—. Mover, redimensionar, la foto y el
 * modo de ver no cuentan. Las flechas salen del SQL, así que no se comparan
 * aparte; las etiquetas escritas a mano y los parámetros, sí.
 */
function diferenciasDeLienzo(antes, despues) {
    const a = leerLienzo(antes);
    const b = leerLienzo(despues);
    const ta = new Map((a.tarjetas || []).map(t => [t.id, t]));
    const tb = new Map((b.tarjetas || []).map(t => [t.id, t]));
    const tarjeta = (t) => ({ id: t.id, etiqueta: t.titulo || t.id, tipo: TIPOS_DE_TARJETA[t.tipo] || t.tipo });
    const sinPantalla = (t) => Object.fromEntries(Object.entries(t).filter(([k]) => !IGNORAR_TARJETA.has(k) && k !== 'id' && k !== 'tipo'));

    const anadidos = [...tb.values()].filter(t => !ta.has(t.id)).map(tarjeta);
    const quitados = [...ta.values()].filter(t => !tb.has(t.id)).map(tarjeta);
    const cambiados = [];
    for (const [id, t2] of tb) {
        const t1 = ta.get(id);
        if (!t1) continue;
        const campos = [];
        if (t1.tipo !== t2.tipo) campos.push({ campo: 'kind', antes: TIPOS_DE_TARJETA[t1.tipo] || t1.tipo, despues: TIPOS_DE_TARJETA[t2.tipo] || t2.tipo });
        campos.push(...camposQueCambian(sinPantalla(t1), sinPantalla(t2)));
        if (campos.length) cambiados.push({ ...tarjeta(t2), antes: t1.titulo || t1.id, campos });
    }

    const ea = a.etiquetas || {};
    const eb = b.etiquetas || {};
    const proceso = camposQueCambian({ title: a.titulo, description: a.descripcion }, { title: b.titulo, description: b.descripcion });
    for (const k of new Set([...Object.keys(ea), ...Object.keys(eb)])) {
        if (!igual(ea[k], eb[k])) proceso.push({ campo: `label ${k}`, antes: ea[k], despues: eb[k] });
    }
    const pa = a.parametros || {};
    const pb = b.parametros || {};
    const variables = {
        anadidas: Object.keys(pb).filter(k => !(k in pa)).map(k => ({ nombre: k, valor: pb[k] })),
        quitadas: Object.keys(pa).filter(k => !(k in pb)).map(k => ({ nombre: k, valor: pa[k] })),
        cambiadas: Object.keys(pb).filter(k => k in pa && !igual(pa[k], pb[k])).map(k => ({ nombre: k, antes: pa[k], despues: pb[k] })),
    };
    const vacio = { anadidas: [], quitadas: [] };
    const cuantos = anadidos.length + quitados.length + cambiados.length + proceso.length
        + variables.anadidas.length + variables.quitadas.length + variables.cambiadas.length;
    return {
        nodos: { anadidos, quitados, cambiados }, conexiones: vacio, parametros: { anadidos: [], quitados: [], cambiados: [] },
        variables, proceso, cuantos, igual: cuantos === 0,
    };
}

module.exports = { diferencias, diferenciasDeLienzo, describir, valor };
