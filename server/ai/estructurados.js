/**
 * **Data Flow, Canvas y diagrama, para el Assistant** (plan del Assistant, E5).
 *
 * Los tres son archivos que se editan en su propio lienzo: reescribir su JSON o su
 * mermaid a mano los rompe o no se ve. Aquí está lo que el servidor necesita de
 * cada uno —puro, sin disco ni red—:
 *
 *   - el texto que lee el modelo (los pasos en orden, las tarjetas, las cajas),
 *     sin posiciones ni fotos;
 *   - la propuesta, validada antes de que el usuario la vea: en Data Flow se
 *     aplica aquí sobre el `.sqlchain` (tipos de paso, ids, ciclos) y se devuelve
 *     el flujo que quedaría con la lista de `diffDeProcesos`; en el Canvas y el
 *     diagrama se comprueba contra lo que el editor admite.
 */
const { diferencias, describir } = require('../diffDeProcesos');

const CERCA = '```';
const ID = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** JSON con las claves en orden: dos objetos iguales dan el mismo texto, vengan de donde vengan. */
function estable(v) {
    return JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
        ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x));
}

// ── Data Flow ───────────────────────────────────────────────────────────────

/** Los tipos de paso que existen (los del generador de Data Flow). */
function tiposDePaso() {
    try { return require('./chainGenerator').NODE_TYPES || []; } catch { return []; }
}

/** El `.sqlchain` sin lo que es del lienzo (posiciones). `null` si no se lee. */
function leerFlujo(texto) {
    let d;
    try { d = typeof texto === 'string' ? JSON.parse(texto) : texto; } catch { return null; }
    if (!d || typeof d !== 'object' || !Array.isArray(d.nodes)) return null;
    return {
        ...d,
        nodes: d.nodes.map(n => ({
            id: String(n.id), type: n.type, label: n.label || '', ...(n.description ? { description: n.description } : {}),
            config: n.config && typeof n.config === 'object' ? n.config : {}, ...(n.disabled ? { disabled: true } : {}),
        })),
        edges: (d.edges || []).map(e => ({ id: String(e.id || `${e.source}__${e.target}`), source: String(e.source), target: String(e.target) })),
    };
}

/** Los pasos en orden de ejecución (Kahn). `{ orden, ciclo }`: `ciclo` si no se puede ordenar. */
function ordenDePasos(def) {
    const ids = def.nodes.map(n => n.id);
    const entran = new Map(ids.map(id => [id, 0]));
    const salen = new Map(ids.map(id => [id, []]));
    for (const e of def.edges) {
        if (!entran.has(e.source) || !entran.has(e.target)) continue;
        entran.set(e.target, entran.get(e.target) + 1);
        salen.get(e.source).push(e.target);
    }
    const cola = ids.filter(id => entran.get(id) === 0);
    const orden = [];
    while (cola.length) {
        const id = cola.shift();
        orden.push(id);
        for (const h of salen.get(id)) { entran.set(h, entran.get(h) - 1); if (entran.get(h) === 0) cola.push(h); }
    }
    return { orden, ciclo: orden.length !== ids.length };
}

/** El flujo como lo lee el modelo: cada paso con su id, tipo, de dónde lee y su configuración. */
function textoDeFlujo(def, { estados = {} } = {}) {
    const { orden } = ordenDePasos(def);
    const porId = new Map(def.nodes.map(n => [n.id, n]));
    const lee = (id) => def.edges.filter(e => e.target === id).map(e => e.source);
    const partes = [];
    if (def.name) partes.push(`Flow: ${def.name}${def.description ? ` — ${def.description}` : ''}`);
    const params = Array.isArray(def.parametros) ? def.parametros : [];
    if (params.length) partes.push(`Parameters (\${name} in configs): ${params.map(p => `${p.nombre} (${p.tipo || 'texto'})`).join(', ')}`);
    const vars = Object.entries(def.variables || {});
    if (vars.length) partes.push(`Variables: ${vars.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ')}`);
    const resto = def.nodes.map(n => n.id).filter(id => !orden.includes(id));
    for (const id of [...orden, ...resto]) {
        const n = porId.get(id);
        const desde = lee(id);
        const est = estados[id];
        const extras = [
            desde.length ? `reads: ${desde.join(', ')}` : 'no input',
            n.disabled ? 'DISABLED' : null,
            est === 'failed' ? 'last run FAILED' : est === 'success' ? 'ran' : null,
        ].filter(Boolean).join(' · ');
        partes.push(`### Step \`${id}\` · ${n.type}${n.label ? ` "${n.label}"` : ''} (${extras})\n${CERCA}json\n${JSON.stringify(n.config || {})}\n${CERCA}`);
    }
    return partes.join('\n\n');
}

/**
 * Aplica las operaciones del modelo al flujo. Devuelve `{ despues, original, lineas }`
 * o `{ error }` con lo que el modelo tiene que corregir.
 *
 * @param {object} def - el flujo de hoy (leerFlujo)
 * @param {object} ops - { add: [{ id, type, label, config, after }], change: [{ id, label, config, disabled }],
 *                         remove: [id], connect: [{ from, to }], disconnect: [{ from, to }] }
 */
function aplicarPasos(def, ops = {}, { tipos = tiposDePaso() } = {}) {
    const errores = [];
    const nodos = def.nodes.map(n => ({ ...n, config: { ...(n.config || {}) } }));
    let aristas = def.edges.map(e => ({ ...e }));
    const existe = (id) => nodos.some(n => n.id === id);
    const original = { nodos: {}, aristas: [] };
    const tocar = (id) => { const n = def.nodes.find(x => x.id === id); if (n && !original.nodos[id]) original.nodos[id] = n; };

    for (const id of ops.remove || []) {
        if (!existe(id)) { errores.push(`there is no step "${id}" to remove`); continue; }
        tocar(id);
        for (let i = nodos.length - 1; i >= 0; i--) if (nodos[i].id === id) nodos.splice(i, 1);
        aristas = aristas.filter(e => e.source !== id && e.target !== id);
    }
    for (const c of ops.change || []) {
        const n = nodos.find(x => x.id === c.id);
        if (!n) { errores.push(`there is no step "${c.id}" to change`); continue; }
        tocar(c.id);
        if (typeof c.label === 'string') n.label = c.label;
        if (c.config && typeof c.config === 'object') n.config = { ...n.config, ...c.config };
        if (typeof c.disabled === 'boolean') { if (c.disabled) n.disabled = true; else delete n.disabled; }
    }
    for (const a of ops.add || []) {
        if (!a.id || !ID.test(a.id)) { errores.push(`"${a.id}" is not a valid step id (letters, digits, _ and -, starting with a letter)`); continue; }
        if (existe(a.id)) { errores.push(`there is already a step "${a.id}"`); continue; }
        if (tipos.length && !tipos.includes(a.type)) { errores.push(`"${a.type}" is not a step type (use one of: ${tipos.join(', ')})`); continue; }
        nodos.push({ id: a.id, type: a.type, label: a.label || '', config: a.config && typeof a.config === 'object' ? a.config : {} });
        for (const desde of a.after || []) {
            if (!existe(desde)) { errores.push(`step "${a.id}" reads "${desde}", which does not exist`); continue; }
            aristas.push({ id: `e_${desde}__${a.id}`, source: desde, target: a.id });
        }
    }
    for (const c of ops.connect || []) {
        if (!existe(c.from) || !existe(c.to)) { errores.push(`cannot connect "${c.from}" → "${c.to}": ${!existe(c.from) ? c.from : c.to} does not exist`); continue; }
        if (aristas.some(e => e.source === c.from && e.target === c.to)) continue;
        aristas.push({ id: `e_${c.from}__${c.to}`, source: c.from, target: c.to });
    }
    for (const c of ops.disconnect || []) {
        const e = def.edges.find(x => x.source === c.from && x.target === c.to);
        if (!e) { errores.push(`"${c.from}" → "${c.to}" is not connected`); continue; }
        original.aristas.push(e);
        aristas = aristas.filter(x => !(x.source === c.from && x.target === c.to));
    }
    if (errores.length) return { error: `Nothing was proposed: ${errores.join('; ')}. Fix it and call again.` };

    const despues = { ...def, nodes: nodos, edges: aristas };
    if (ordenDePasos(despues).ciclo) return { error: 'That change makes a cycle: a step would end up reading its own output. Fix the connections and call again.' };
    const d = diferencias(def, despues);
    if (d.igual) return { error: 'That is the flow as it already is: there is nothing to change.' };
    return { despues, original, lineas: describir(d) };
}

// ── Canvas ──────────────────────────────────────────────────────────────────

/** Los tipos de tarjeta que el Assistant puede crear, y el campo que llevan. */
const TARJETAS_NUEVAS = { query: 'sql', note: 'texto', text: 'texto' };

/** El Canvas como lo lee el modelo: cada tarjeta con lo que lee, sin fotos. */
function textoDeLienzo(e) {
    const partes = [];
    if (e.titulo) partes.push(`Canvas: ${e.titulo}`);
    const params = Object.entries(e.parametros || {});
    if (params.length) partes.push(`Parameters (used as {{name}}): ${params.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ')}`);
    partes.push('Each Source and Query card leaves a session view named after the card, so a query reads another card with FROM <its name>. The arrows come from what each query reads.');
    for (const t of e.tarjetas || []) {
        const extras = [
            t.lee?.length ? `reads: ${t.lee.join(', ')}` : null,
            t.desde ? `shows: ${t.desde}` : null,
            t.marco ? `in frame ${t.marco}` : null,
            t.estado === 'error' ? 'last run FAILED' : t.estado === 'dia' ? 'up to date' : null,
        ].filter(Boolean).join(' · ');
        const cab = `### Card \`${t.id}\` · ${t.tipo}${t.titulo ? ` "${t.titulo}"` : ''}${extras ? ` (${extras})` : ''}`;
        if (t.sql) partes.push(`${cab}\n${CERCA}sql\n${t.sql}\n${CERCA}`);
        else if (t.texto) partes.push(`${cab}\n${t.texto}`);
        else if (t.origen) partes.push(`${cab}\nReads ${t.origen}`);
        else partes.push(cab);
    }
    return partes.join('\n\n');
}

// ── Diagrama ────────────────────────────────────────────────────────────────

/** El diagrama como lo lee el modelo: las cajas, las flechas, los grupos y las capas. */
function textoDeDiagrama(e) {
    const g = e.grafo || {};
    const partes = [`Direction: ${g.direccion || 'LR'}`];
    partes.push(`Boxes:\n${(g.nodos || []).map(n => `- ${n.id}: "${n.texto}" (${n.forma}${n.clases?.length ? `, layer ${n.clases.join(', ')}` : ''})`).join('\n') || '(none)'}`);
    partes.push(`Arrows:\n${(g.aristas || []).map(a => `- ${a.desde} → ${a.hasta}${a.etiqueta ? ` "${a.etiqueta}"` : ''} (${a.estilo})`).join('\n') || '(none)'}`);
    if (g.subgrafos?.length) partes.push(`Groups:\n${g.subgrafos.map(s => `- ${s.id} "${s.titulo}": ${s.nodos.join(', ')}`).join('\n')}`);
    if (e.capas?.length) partes.push(`Layers (colours already defined in the file): ${e.capas.join(', ')}`);
    partes.push(`Shapes: ${(e.formas || []).join(', ')}. Arrow styles: ${(e.estilos || []).join(', ')}.`);
    return partes.join('\n\n');
}

/**
 * Comprueba un diagrama propuesto contra lo que el editor sabe escribir (D1): así
 * lo que entra siempre se puede volver a editar visualmente. Devuelve el grafo en
 * los nombres del cliente, o `{ error }`.
 */
function validarDiagrama(p, { formas = [], estilos = [], capas = [] } = {}) {
    const errores = [];
    const dirs = ['TB', 'TD', 'BT', 'LR', 'RL'];
    const direccion = p.direction || 'LR';
    if (!dirs.includes(direccion)) errores.push(`direction must be one of ${dirs.join(', ')}`);
    const ids = new Set();
    const nodos = [];
    for (const n of p.nodes || []) {
        if (!n.id || !ID.test(n.id)) { errores.push(`"${n.id}" is not a valid box id`); continue; }
        if (ids.has(n.id)) { errores.push(`the box id "${n.id}" is repeated`); continue; }
        const forma = n.shape || 'proceso';
        if (formas.length && !formas.includes(forma)) { errores.push(`"${forma}" is not a shape (use one of: ${formas.join(', ')})`); continue; }
        if (n.layer && capas.length && !capas.includes(n.layer)) { errores.push(`there is no layer "${n.layer}" (layers: ${capas.join(', ')})`); continue; }
        if (n.layer && !capas.length) { errores.push('this diagram has no layers yet: leave layer out'); continue; }
        ids.add(n.id);
        nodos.push({ id: n.id, texto: String(n.text ?? n.id), forma, clases: n.layer ? [n.layer] : [] });
    }
    const aristas = [];
    for (const a of p.edges || []) {
        if (!ids.has(a.from) || !ids.has(a.to)) { errores.push(`the arrow ${a.from} → ${a.to} joins a box that does not exist`); continue; }
        const estilo = a.style || 'lotes';
        if (estilos.length && !estilos.includes(estilo)) { errores.push(`"${estilo}" is not an arrow style (use one of: ${estilos.join(', ')})`); continue; }
        aristas.push({ desde: a.from, hasta: a.to, etiqueta: a.label || '', estilo });
    }
    const enGrupo = new Set();
    const subgrafos = [];
    for (const s of p.groups || []) {
        if (!s.id || !ID.test(s.id) || ids.has(s.id)) { errores.push(`"${s.id}" is not a valid group id (it cannot repeat a box id)`); continue; }
        const dentro = (s.nodes || []).filter(id => ids.has(id));
        const repetidos = dentro.filter(id => enGrupo.has(id));
        if (repetidos.length) { errores.push(`${repetidos.join(', ')} cannot be in two groups (groups inside groups are not drawn)`); continue; }
        dentro.forEach(id => enGrupo.add(id));
        subgrafos.push({ id: s.id, titulo: String(s.title || s.id), nodos: dentro });
    }
    if (!nodos.length) errores.push('the diagram needs at least one box');
    if (errores.length) return { error: `Nothing was proposed: ${errores.join('; ')}. Fix it and call again.` };
    return { grafo: { direccion, nodos, aristas, subgrafos } };
}

module.exports = {
    estable, leerFlujo, ordenDePasos, textoDeFlujo, aplicarPasos, tiposDePaso,
    TARJETAS_NUEVAS, textoDeLienzo, textoDeDiagrama, validarDiagrama,
};
