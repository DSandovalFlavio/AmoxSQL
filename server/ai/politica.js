/**
 * La política de IA de un workspace (B4), fase 7.3 del plan de la 5.9.
 *
 * Un workspace puede decir dos cosas:
 *
 *   proveedores  'local' — sólo modelos que corren en esta máquina (Ollama).
 *                'nube'  — también los de la nube.
 *   datos        qué puede salir hacia un modelo en la nube:
 *                'esquema'  — nombres de tablas y columnas, tipos y recuentos;
 *                             ningún valor de una fila.
 *                'muestras' — además, unas pocas filas (5).
 *                'filas'    — todo, como hasta la 5.8.
 *
 * Se aplica EN EL SERVIDOR, no en la interfaz: una regla que sólo esconde un
 * botón no protege nada. Hay dos puertas:
 *
 *   1. `comprobarProveedor` en AiManager.getModel: elegir un modelo en la nube
 *      con una política «local» falla con un mensaje claro. Toda llamada a un
 *      modelo pasa por getModel.
 *   2. `envolver` pone un middleware al modelo que, antes de cada llamada,
 *      recorre lo que se le va a enviar y filtra el resultado de cada
 *      herramienta (execute_sql, describe_table, read_file…), también los que
 *      vienen del historial de la conversación. Es el embudo: no hay que
 *      acordarse de cada herramienta nueva.
 *
 * Lo que va en el texto del prompt (el resultado que el usuario tiene en
 * pantalla, las filas de un artefacto citado, las muestras de un archivo, las
 * memorias) no se puede filtrar después de escrito: `sanearOpciones` lo quita
 * en origen, antes de componer el prompt. Y la extracción de memorias no corre.
 *
 * Con un modelo local no se restringe nada: los datos no salen de la máquina.
 */
const fs = require('fs');
const path = require('path');

const LOCALES = new Set(['ollama']);
const POR_DEFECTO = { proveedores: 'nube', datos: 'filas' };
const DATOS = ['esquema', 'muestras', 'filas'];
const MUESTRA = 5;

// Claves de un resultado que llevan filas o valores de las tablas.
const CON_DATOS = new Set(['data', 'rows', 'sampleRows', 'sample', 'samples', 'preview', 'topValues', 'top_values', 'distinctValues', 'values']);
// read_file con «esquema»: sólo lo que es código o documentación, no datos.
const LEGIBLES_CON_ESQUEMA = new Set(['.sql', '.md', '.yml', '.yaml']);

function normalizar(p) {
    const x = (p && typeof p === 'object') ? p : {};
    return {
        proveedores: x.proveedores === 'local' ? 'local' : 'nube',
        datos: DATOS.includes(x.datos) ? x.datos : 'filas',
    };
}

// ── La del proyecto abierto ─────────────────────────────────────────────────
// getModel es síncrono: la política activa se guarda aquí y la pone al día
// quien sabe que cambió (abrir, enlazar, editar el workspace).
let activa = { ...POR_DEFECTO, workspace: null };

function fijar(politica, workspace = null) {
    activa = { ...normalizar(politica), workspace };
    return activa;
}
const actual = () => activa;
const restringe = (p = activa) => p.proveedores === 'local' || p.datos !== 'filas';

const esLocal = (proveedor) => LOCALES.has(String(proveedor || '').toLowerCase());

/** Lo que puede salir hacia este proveedor con la política activa. */
function datosPara(proveedor, p = activa) {
    return esLocal(proveedor) ? 'filas' : p.datos;
}

function quien(p) {
    const w = p.workspace;
    return w ? `the ${w.palabra || 'workspace'} “${w.nombre}”` : 'this workspace';
}

function comprobarProveedor(proveedor, p = activa) {
    if (p.proveedores === 'local' && !esLocal(proveedor)) {
        throw new Error(`The AI policy of ${quien(p)} only allows local models. Pick an Ollama model in the assistant, or change the policy in Settings.`);
    }
}

// ── Filtrar lo que sale ─────────────────────────────────────────────────────

const RETENIDO = 'withheld by the AI policy of this workspace (schema only); the user sees them in AmoxSQL';

/** Recorre un valor y retiene o recorta lo que lleva filas. */
function filtrarValor(valor, datos) {
    if (datos === 'filas' || valor == null) return valor;
    if (Array.isArray(valor)) return valor.map(v => filtrarValor(v, datos));
    if (typeof valor !== 'object') return valor;
    const out = {};
    for (const [k, v] of Object.entries(valor)) {
        if (CON_DATOS.has(k) && (Array.isArray(v) || (v && typeof v === 'object'))) {
            if (datos === 'esquema') {
                out[k] = Array.isArray(v) ? [] : {};
                out[`${k}Note`] = `Values ${RETENIDO}.`;
            } else {
                out[k] = Array.isArray(v) ? v.slice(0, MUESTRA) : v;
                if (Array.isArray(v) && v.length > MUESTRA) out[`${k}Note`] = `Only the first ${MUESTRA} rows are sent to the model (AI policy: samples).`;
            }
            continue;
        }
        out[k] = filtrarValor(v, datos);
    }
    return out;
}

/** El resultado de una herramienta, tal como puede llegar al modelo. */
function filtrarSalida(herramienta, salida, datos) {
    if (datos === 'filas') return salida;
    if (herramienta === 'read_file' && datos === 'esquema' && salida && typeof salida === 'object' && typeof salida.content === 'string') {
        const ext = path.extname(String(salida.path || '')).toLowerCase();
        if (!LEGIBLES_CON_ESQUEMA.has(ext)) {
            return { path: salida.path, size: salida.size, lines: salida.lines, content: '', contentNote: `File content ${RETENIDO}.` };
        }
    }
    return filtrarValor(salida, datos);
}

/** Recorre el prompt (LanguageModelV3Prompt) y filtra cada resultado de herramienta. */
function filtrarPrompt(prompt, datos) {
    if (datos === 'filas' || !Array.isArray(prompt)) return prompt;
    return prompt.map(m => {
        if (!Array.isArray(m?.content)) return m;
        return {
            ...m,
            content: m.content.map(parte => {
                if (parte?.type !== 'tool-result' || !parte.output) return parte;
                const o = parte.output;
                if (o.type === 'json' || o.type === 'error-json') {
                    return { ...parte, output: { ...o, value: filtrarSalida(parte.toolName, o.value, datos) } };
                }
                if (o.type === 'text' || o.type === 'error-text') {
                    let json = null;
                    try { json = JSON.parse(o.value); } catch { /* texto llano */ }
                    if (json && typeof json === 'object') {
                        return { ...parte, output: { ...o, value: JSON.stringify(filtrarSalida(parte.toolName, json, datos)) } };
                    }
                }
                return parte;
            }),
        };
    });
}

/**
 * El modelo, con la política puesta. Se decide en cada llamada —no al
 * crearlo—: si el usuario cambia la política a mitad de conversación, la
 * siguiente llamada ya la respeta.
 */
function envolver(modelo, proveedor) {
    if (!modelo || esLocal(proveedor) || typeof modelo !== 'object') return modelo;
    const { wrapLanguageModel } = require('ai');
    return wrapLanguageModel({
        model: modelo,
        middleware: {
            specificationVersion: 'v3',
            transformParams: async ({ params }) => {
                const datos = datosPara(proveedor);
                return datos === 'filas' ? params : { ...params, prompt: filtrarPrompt(params.prompt, datos) };
            },
        },
    });
}

/**
 * Lo que el prompt lleva escrito y no se puede filtrar después: se quita aquí,
 * en las opciones, antes de componerlo. Devuelve opciones nuevas.
 */
function sanearOpciones(opciones, proveedor) {
    const datos = datosPara(proveedor);
    if (datos === 'filas') return opciones;
    const o = { ...opciones };
    if (o.currentResult) o.currentResult = filtrarValor(o.currentResult, datos);
    if (Array.isArray(o.referencedArtifacts)) o.referencedArtifacts = o.referencedArtifacts.map(r => filtrarValor(r, datos));
    if (Array.isArray(o.files)) o.files = o.files.map(f => filtrarValor(f, datos));
    // Las memorias son frases sacadas de conversaciones anteriores, que pudieron
    // tener valores. Con «esquema» no se mandan.
    if (datos === 'esquema') o.memoriasRetenidas = true;
    return o;
}

/** ¿Se pueden extraer memorias (otra llamada con la conversación entera)? */
const permiteMemorias = (proveedor) => datosPara(proveedor) === 'filas';

/** ¿Puede Data Flow mandar filas a este proveedor (el paso de IA)? */
function comprobarFilas(proveedor, p = activa) {
    comprobarProveedor(proveedor, p);
    if (datosPara(proveedor, p) !== 'filas') {
        throw new Error(`The AI policy of ${quien(p)} doesn't allow sending rows to a cloud model. Use a local model for this step.`);
    }
}

// ── La política de cualquier proyecto (no sólo el abierto) ──────────────────

/** Para quien conoce la carpeta (Data Flow, la línea de comandos). */
async function deProyecto(raiz) {
    let pj = {};
    try { pj = JSON.parse(fs.readFileSync(path.join(raiz, '.amoxsql', 'project.json'), 'utf8')); } catch { /* sin manifiesto */ }
    if (!pj.workspace || !pj.workspace.id) return { ...POR_DEFECTO, workspace: null };
    try {
        const baseCentral = require('../central/BaseCentral');
        if (!baseCentral.estaAbierta()) return { ...POR_DEFECTO, workspace: null };
        const [w] = await baseCentral.query(`SELECT nombre, politica_ia FROM workspaces WHERE id = $1`, [String(pj.workspace.id)]);
        if (!w) return { ...POR_DEFECTO, workspace: null };
        let p = null;
        try { p = JSON.parse(w.politica_ia || 'null'); } catch { p = null; }
        const palabra = await require('../workspaces').etiqueta().then(require('../workspaces').singular).catch(() => 'workspace');
        return { ...normalizar(p), workspace: { id: pj.workspace.id, nombre: w.nombre, palabra } };
    } catch {
        return { ...POR_DEFECTO, workspace: null };
    }
}

module.exports = {
    POR_DEFECTO, DATOS, normalizar,
    fijar, actual, restringe, esLocal, datosPara,
    comprobarProveedor, comprobarFilas, permiteMemorias,
    filtrarSalida, filtrarPrompt, envolver, sanearOpciones, deProyecto,
};
