/**
 * Las variables del proyecto (6.0, fase 2; O1, Dec-98).
 *
 * DuckDB 2 lee una variable con `$nombre` en cualquier expresión (`SET VARIABLE` +
 * `$x`): el valor entra con su tipo y nunca como código, así que no hace falta poner
 * comillas a mano y ningún valor puede cambiar la consulta.
 *
 * Una variable es del PROYECTO, no de una pestaña: vive en
 * `<proyecto>/.amoxsql/variables.json` (viaja con el proyecto, se ve en Git), con su
 * tipo y una descripción que la documenta. Las variables del motor son de cada
 * CONEXIÓN y AmoxSQL usa varias (los carriles; los totales de un gráfico corren en
 * otro), así que se ponen en todas con `dbManager.ponerSesion('variables', …)`: al
 * abrir el proyecto, al cambiarlas, y en cada contexto aislado de Data Flow
 * (`enContexto`). Por eso un gráfico, una celda o un proceso guardados con `$region`
 * funcionan siempre dentro de su proyecto.
 *
 * `${x}` (la barra del editor, los snippets) sigue pegando el texto como siempre: es
 * para plantillas y fragmentos de SQL. Dec-99.
 *
 * Formato: { "version": 1, "variables": [ { "nombre", "tipo", "valor", "descripcion" } ] }
 * tipo ∈ texto · numero · fecha · logico · lista (valor: lista de textos).
 */
const fs = require('fs');
const path = require('path');

class ErrorDeVariable extends Error {}

const TIPOS = ['texto', 'numero', 'fecha', 'logico', 'lista'];
const NOMBRE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
// Palabras que el motor ya usa con `$` o que confundirían (no es exhaustivo: lo
// que el motor rechace, lo dice al ponerla).
const RESERVADOS = new Set(['schema', 'table', 'select', 'from', 'where', 'null', 'true', 'false']);

const archivo = (raiz) => path.join(raiz, '.amoxsql', 'variables.json');
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Normaliza y valida una variable. Lanza ErrorDeVariable con un mensaje para el usuario. */
function normalizar(v) {
    const nombre = String(v?.nombre ?? '').trim();
    if (!NOMBRE.test(nombre)) throw new ErrorDeVariable(`"${nombre}" is not a valid variable name: use letters, digits and _ (not starting with a digit).`);
    if (RESERVADOS.has(nombre.toLowerCase())) throw new ErrorDeVariable(`"${nombre}" is a reserved word; choose another name.`);
    const tipo = TIPOS.includes(v?.tipo) ? v.tipo : 'texto';
    const descripcion = String(v?.descripcion ?? '').trim().slice(0, 500);
    let valor = v?.valor;
    switch (tipo) {
        case 'numero': {
            const t = String(valor ?? '').trim();
            if (t === '') { valor = null; break; }
            if (!/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) throw new ErrorDeVariable(`$${nombre} is a number, and "${t}" is not one.`);
            valor = Number(t);
            break;
        }
        case 'fecha': {
            const t = String(valor ?? '').trim();
            if (t === '') { valor = null; break; }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(`${t}T00:00:00Z`))) throw new ErrorDeVariable(`$${nombre} is a date (YYYY-MM-DD), and "${t}" is not one.`);
            valor = t;
            break;
        }
        case 'logico':
            valor = valor === true || /^(true|1|yes|sí|si)$/i.test(String(valor ?? '').trim());
            break;
        case 'lista':
            valor = (Array.isArray(valor) ? valor : String(valor ?? '').split(','))
                .map(x => String(x).trim()).filter(Boolean).slice(0, 1000);
            break;
        default:
            valor = valor == null ? '' : String(valor);
    }
    return { nombre, tipo, valor, ...(descripcion ? { descripcion } : {}) };
}

/** Las variables del proyecto (vacío si no hay archivo; las inválidas se saltan y se dicen). */
function leer(raiz) {
    if (!raiz) return { variables: [], avisos: [] };
    let datos;
    try { datos = JSON.parse(fs.readFileSync(archivo(raiz), 'utf8')); }
    catch (e) { return { variables: [], avisos: e.code === 'ENOENT' ? [] : [`.amoxsql/variables.json could not be read: ${e.message}`] }; }
    const variables = [], avisos = [], vistos = new Set();
    for (const v of Array.isArray(datos?.variables) ? datos.variables : []) {
        try {
            const n = normalizar(v);
            if (vistos.has(n.nombre.toLowerCase())) { avisos.push(`$${n.nombre} is declared twice; the first one counts.`); continue; }
            vistos.add(n.nombre.toLowerCase());
            variables.push(n);
        } catch (e) { avisos.push(e.message); }
    }
    return { variables, avisos };
}

/** Guarda la lista entera (validada; un nombre repetido es un error). */
function guardar(raiz, lista) {
    if (!raiz) throw new ErrorDeVariable('Open a project to save its variables.');
    const variables = [], vistos = new Set();
    for (const v of Array.isArray(lista) ? lista : []) {
        const n = normalizar(v);
        if (vistos.has(n.nombre.toLowerCase())) throw new ErrorDeVariable(`$${n.nombre} is declared twice.`);
        vistos.add(n.nombre.toLowerCase());
        variables.push(n);
    }
    fs.mkdirSync(path.dirname(archivo(raiz)), { recursive: true });
    const tmp = archivo(raiz) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, variables }, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, archivo(raiz));
    return variables;
}

/** El literal SQL de un valor con su tipo (lo que va detrás de `SET VARIABLE x =`). */
function literal(v) {
    if (v.valor === null || v.valor === undefined) return 'NULL';
    switch (v.tipo) {
        case 'numero': return Number.isInteger(v.valor) && Math.abs(v.valor) <= Number.MAX_SAFE_INTEGER ? `${v.valor}::BIGINT` : `${v.valor}::DOUBLE`;
        case 'fecha': return `DATE ${lit(v.valor)}`;
        case 'logico': return v.valor ? 'true' : 'false';
        case 'lista': return `[${v.valor.map(lit).join(', ')}]::VARCHAR[]`;
        default: return lit(v.valor);
    }
}

/** Las sentencias que dejan las variables en una conexión (y quitan las que ya no están). */
function sentencias(variables, { antes = [] } = {}) {
    const ahora = new Set(variables.map(v => v.nombre.toLowerCase()));
    const quitar = antes.filter(n => !ahora.has(n.toLowerCase())).map(n => `RESET VARIABLE ${n}`);
    return [...quitar, ...variables.map(v => `SET VARIABLE ${v.nombre} = ${literal(v)}`)];
}

let montadas = [];     // los nombres puestos en la sesión de la interfaz
let actuales = [];     // las variables montadas, para el Assistant y el completado

/** Pone las variables del proyecto abierto en todos los carriles de la interfaz. */
async function montar(dbManager, raiz) {
    const { variables, avisos } = leer(raiz);
    await dbManager.ponerSesion('variables', sentencias(variables, { antes: montadas }));
    montadas = variables.map(v => v.nombre);
    actuales = variables;
    return { variables, avisos };
}

/** Para un contexto aislado (Data Flow, programado, línea de órdenes): una sola conexión. */
async function enContexto(ctx, raiz) {
    const { variables } = leer(raiz);
    for (const s of sentencias(variables)) await ctx.query(s).catch(() => {});
    return variables;
}

/**
 * El error del motor cuando una consulta usa `$x` sin que exista, en palabras:
 * «Values were not provided for the following parameters: x, y».
 */
function explicarError(mensaje) {
    const m = /Values were not provided for the following parameters: ([^\n]+)/i.exec(String(mensaje || ''));
    if (!m) return null;
    const nombres = m[1].split(',').map(s => s.trim()).filter(Boolean);
    const lista = nombres.map(n => `$${n}`).join(', ');
    return `${lista} ${nombres.length === 1 ? 'is not a project variable' : 'are not project variables'}. Declare ${nombres.length === 1 ? 'it' : 'them'} in Library › Snippets › Variables (or the editor's Variables bar).`;
}

/** Cómo se describe al Assistant: una línea por variable. */
function paraElAsistente(variables) {
    if (!variables?.length) return '';
    const valor = (v) => (v.tipo === 'lista' ? `[${v.valor.join(', ')}]` : String(v.valor));
    return variables.map(v => `- $${v.nombre} (${v.tipo}) = ${valor(v)}${v.descripcion ? ` — ${v.descripcion}` : ''}`).join('\n');
}

module.exports = { actuales: () => actuales, ErrorDeVariable, TIPOS, normalizar, leer, guardar, literal, sentencias, montar, enContexto, explicarError, paraElAsistente, archivo };
