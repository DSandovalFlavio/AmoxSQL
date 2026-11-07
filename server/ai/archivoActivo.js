/**
 * **El archivo activo, tal como puede llegar al modelo** (plan del Assistant, E1).
 *
 * El Assistant recibe el texto de la pestaña en la que trabaja el usuario. Hasta
 * la E1 ese texto viajaba entero, sin recortar, presentado siempre como «Current
 * query» en un bloque SQL, fuera cual fuera el archivo, y sin pasar por la
 * política de IA. Aquí se decide, en un solo sitio:
 *
 *   - **qué es** (`tipo`, con su nombre real y el idioma de su bloque), para que
 *     el prompt no le llame consulta a un deck ni a un YAML;
 *   - **qué puede salir**: las fotos de un Canvas nunca (son filas y casi todo el
 *     peso del archivo); con la política «solo esquema» o «muestras», tampoco las
 *     filas de un spec de Vega-Lite ni un archivo de datos abierto como texto; y un
 *     archivo de credenciales no sale nunca hacia un modelo en la nube;
 *   - **cuánto**: un tope, para no llenar la ventana de un modelo local;
 *   - **si el Assistant puede proponer cambios** sobre él. En los archivos
 *     estructurados (gráfico, Data Flow, Canvas, diagrama) explica pero no
 *     propone hasta que tengan su propia forma de revisar (E4/E5): reescribir su
 *     JSON a mano lo rompe o no se ve.
 *
 * Puro: no lee disco ni red. Lo usa `politica.sanearOpciones`.
 */
const path = require('path');

/** Lo que cabe del archivo en el prompt (≈4.000 tokens). */
const TOPE = 16000;

/** Los tipos que el Assistant conoce, con lo que el modelo debe leer de cada uno. */
const TIPOS = {
    sql: { nombre: 'SQL file', idioma: 'sql', propone: true },
    cuaderno: { nombre: 'SQL notebook (.sqlnb): markdown with front matter; each SQL cell is a ```sql block preceded by <!-- celda: name -->', idioma: 'markdown', propone: true },
    markdown: { nombre: 'Markdown document', idioma: 'markdown', propone: true },
    deck: { nombre: 'Report Flow deck (.amoxdeck): front matter, slides separated by ---, <!-- layout: X --> directives, ```amoxchart blocks that point to .amoxvis charts', idioma: 'markdown', propone: true },
    grafico: { nombre: 'Story Flow chart (.amoxvis): a Vega-Lite spec whose usermeta.amoxsql holds the chart panels and its query', idioma: 'json', propone: false },
    flujo: { nombre: 'Data Flow process (.sqlchain): JSON with nodes, edges and parameters', idioma: 'json', propone: false },
    lienzo: { nombre: 'Canvas (.amoxcanvas): JSON with cards (source, query, chart, number, note, text, frame); arrows come from what each query reads', idioma: 'json', propone: false },
    diagrama: { nombre: 'Diagram (.amoxdiagram): front matter and one mermaid flowchart', idioma: 'markdown', propone: false },
    texto: { nombre: 'text file', idioma: 'text', propone: true },
};

/** El tipo de la pestaña (`tab.type`) o, si no lo trae, la extensión. */
const POR_TIPO_DE_PESTANA = {
    sql: 'sql', sqlnb: 'cuaderno', notebook: 'cuaderno', md: 'markdown', amoxdeck: 'deck',
    amoxvis: 'grafico', sqlchain: 'flujo', chain: 'flujo', amoxcanvas: 'lienzo', amoxdiagram: 'diagrama', texto: 'texto',
};
const POR_EXTENSION = {
    '.sql': 'sql', '.sqlnb': 'cuaderno', '.md': 'markdown', '.markdown': 'markdown', '.amoxdeck': 'deck',
    '.amoxvis': 'grafico', '.sqlchain': 'flujo', '.amoxcanvas': 'lienzo', '.amoxdiagram': 'diagrama',
};

/** El idioma del bloque de un archivo de texto, por su extensión. */
const IDIOMA_DE_TEXTO = {
    '.yml': 'yaml', '.yaml': 'yaml', '.json': 'json', '.jsonl': 'json', '.ndjson': 'json', '.py': 'python',
    '.js': 'javascript', '.mjs': 'javascript', '.ts': 'typescript', '.toml': 'toml', '.ini': 'ini',
    '.csv': 'csv', '.tsv': 'csv', '.xml': 'xml', '.html': 'html', '.sh': 'bash', '.ps1': 'powershell', '.r': 'r',
};

/** Archivos de texto que son datos: con «esquema» no salen, con «muestras» sus primeras líneas. */
const DE_DATOS = new Set(['.json', '.jsonl', '.ndjson', '.csv', '.tsv', '.xml']);

function tipoDe(filePath, fileType) {
    const t = POR_TIPO_DE_PESTANA[String(fileType || '').toLowerCase()];
    if (t) return t;
    const ext = path.extname(String(filePath || '')).toLowerCase();
    return POR_EXTENSION[ext] || (filePath ? 'texto' : 'sql');
}

/**
 * ¿Parece un archivo de credenciales? Por el nombre: lo que se ve antes de abrirlo
 * es también lo que el usuario reconoce («claro, el .env»).
 */
function esCredencial(filePath) {
    const base = path.basename(String(filePath || '')).toLowerCase();
    if (!base) return false;
    if (base === 'profiles.yml' || base === 'profiles.yaml') return true;            // dbt
    if (base === '.env' || base.startsWith('.env.')) return true;
    if (base === '.npmrc' || base === '.pgpass' || base === '.netrc') return true;
    if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return true;
    if (/\.(pem|key|p12|pfx|keystore|jks)$/.test(base)) return true;
    if (/(^|[._-])(credentials?|secrets?)([._-]|$)/.test(base)) return true;
    return false;
}

/** Quita cualquier `values` con filas de los `data` de un spec de Vega-Lite (a cualquier profundidad). */
function sinValoresDeVega(nodo) {
    if (Array.isArray(nodo)) return nodo.map(sinValoresDeVega);
    if (!nodo || typeof nodo !== 'object') return nodo;
    const out = {};
    for (const [k, v] of Object.entries(nodo)) {
        if (k === 'data' && v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.values)) {
            const { values, ...resto } = v;
            out[k] = { ...resto, values: [], valuesNote: `${values.length} rows withheld by the AI policy` };
            continue;
        }
        if (k === 'datasets' && v && typeof v === 'object') {
            out[k] = Object.fromEntries(Object.keys(v).map(n => [n, []]));
            continue;
        }
        out[k] = sinValoresDeVega(v);
    }
    return out;
}

/** Recorta al tope por líneas enteras y dice cuánto quedó fuera. */
function recortar(texto, tope = TOPE) {
    if (texto.length <= tope) return { texto, recortado: false };
    const corte = texto.lastIndexOf('\n', tope);
    const hasta = corte > tope * 0.6 ? corte : tope;
    const resto = texto.slice(hasta);
    const lineas = resto.split('\n').length - (resto.startsWith('\n') ? 1 : 0);
    return { texto: texto.slice(0, hasta), recortado: true, lineasFuera: Math.max(1, lineas) };
}

/**
 * El archivo activo, listo para el prompt.
 *
 * @param {object} p
 * @param {string} [p.filePath]
 * @param {string} [p.fileType] - `tab.type` del cliente
 * @param {string} [p.contenido] - el texto de la pestaña (con sus cambios sin guardar)
 * @param {'esquema'|'muestras'|'filas'} [p.datos] - lo que permite la política para este proveedor
 * @param {boolean} [p.local] - si el modelo corre en esta máquina
 * @returns {{ tipo, nombre, ruta, idioma, contenido, notas: string[], puedeProponer: boolean, retenido: boolean }}
 */
function prepararArchivo({ filePath = null, fileType = null, contenido = '', datos = 'filas', local = true } = {}) {
    const tipo = tipoDe(filePath, fileType);
    const def = TIPOS[tipo];
    const ext = path.extname(String(filePath || '')).toLowerCase();
    const idioma = tipo === 'texto' ? (IDIOMA_DE_TEXTO[ext] || 'text') : def.idioma;
    const notas = [];
    let texto = typeof contenido === 'string' ? contenido : '';
    let retenido = false;

    if (tipo === 'texto' && !local && esCredencial(filePath)) {
        return {
            tipo, nombre: def.nombre, ruta: filePath, idioma, contenido: '',
            notas: ['This file looks like it holds credentials, so its content is never sent to a cloud model. Tell the user it stays on their computer, and that they can switch to a local model to work on it with you.'],
            puedeProponer: false, retenido: true,
        };
    }

    if (tipo === 'lienzo' && texto.trim()) {
        // Las fotos son las primeras filas de cada tarjeta: datos, y casi todo el
        // peso del archivo. El modelo trabaja con el SQL y la forma del lienzo.
        try {
            const doc = JSON.parse(texto);
            if (Array.isArray(doc.tarjetas)) {
                const conFoto = doc.tarjetas.filter(t => t && t.foto).length;
                doc.tarjetas = doc.tarjetas.map(t => {
                    if (!t || typeof t !== 'object') return t;
                    const { foto, ...resto } = t;
                    return resto;
                });
                texto = JSON.stringify(doc, null, 2);
                if (conFoto) notas.push(`The saved snapshots of ${conFoto} card(s) are not included: run a card's SQL with execute_sql to see its rows.`);
            }
        } catch { /* un lienzo que no se lee va como texto, recortado */ }
    }

    if (tipo === 'grafico' && datos !== 'filas' && texto.trim()) {
        try {
            const spec = JSON.parse(texto);
            const limpio = sinValoresDeVega(spec);
            const antes = JSON.stringify(spec);
            const despues = JSON.stringify(limpio);
            if (antes !== despues) {
                texto = JSON.stringify(limpio, null, 2);
                retenido = true;
                notas.push('Inline data rows in this chart were withheld by the AI policy of this workspace.');
            }
        } catch { /* sigue como está */ }
    }

    if (tipo === 'texto' && datos !== 'filas' && DE_DATOS.has(ext) && texto.trim()) {
        retenido = true;
        if (datos === 'esquema') {
            texto = '';
            notas.push('This is a data file: its content is withheld by the AI policy of this workspace (schema only). Query it with execute_sql to see its columns.');
        } else {
            const lineas = texto.split('\n');
            texto = lineas.slice(0, 6).join('\n');
            if (lineas.length > 6) notas.push('This is a data file: only its first lines are sent (AI policy: samples).');
        }
    }

    const r = recortar(texto);
    if (r.recortado) {
        notas.push(`The file is longer than what fits here: ${r.lineasFuera} more line(s) are not shown. Ask the user about the part you need instead of guessing it.`);
    }

    return {
        tipo, nombre: def.nombre, ruta: filePath, idioma, contenido: r.texto, notas,
        puedeProponer: def.propone && !retenido && !r.recortado, retenido,
    };
}

module.exports = { prepararArchivo, tipoDe, esCredencial, TIPOS, TOPE };
