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

/**
 * Los archivos del proyecto que AmoxSQL entiende en otro sitio (T3): el modelo
 * tiene que saber qué es un `metrics.yml` para tocarlo bien.
 */
function conocido(filePath) {
    const r = String(filePath || '').replace(/\\/g, '/').toLowerCase();
    const base = r.split('/').pop();
    if (/(^|\/)context\/metrics\.ya?ml$/.test(r)) return 'The project\'s measures (metrics.yml): each metric becomes a SQL function named after it, with its columns as arguments, usable in any query of this project.';
    if (/(^|\/)context\/joins\.ya?ml$/.test(r)) return 'How the tables of this project join (joins.yml): AmoxSQL\'s AI reads it to write joins.';
    if (base === 'dbt_project.yml') return 'The dbt project configuration.';
    if (/(^|\/)(models|snapshots|seeds|macros)\/.*\.ya?ml$/.test(r)) return 'A dbt properties file: descriptions and tests of models and their columns.';
    if (/(^|\/)\.amoxsql\/project\.json$/.test(r)) return 'AmoxSQL\'s project manifest: keep every key you were not asked to change.';
    if (/(^|\/)fuentes\/[^/]+\.json$/.test(r)) return 'A named source of AmoxSQL (where a file or folder is read from and how).';
    // M3: los archivos que son el contexto de la propia IA.
    if (base === 'rules.md') return 'The project\'s rules for AmoxSQL\'s AI (RULES.md): the Assistant and Deep Dive follow them in every answer. Write them as short, direct instructions, one per line.';
    if (/(^|\/)context\/glossary\.md$/.test(r)) return 'The project\'s glossary (glossary.md): AmoxSQL\'s AI reads it to understand the business words of this project. One term per entry, with what it means in the data.';
    if (/(^|\/)agent\/skills\/[^/]+\/skill\.md$/.test(r)) return 'A skill of AmoxSQL\'s AI (SKILL.md): front matter (name, description, keywords) and the steps the AI follows when the skill is active.';
    return null;
}

/**
 * El cuaderno como lo lee el modelo (E3): cada celda con su número, su tipo, su
 * nombre y qué lee, en lugar del markdown con marcas. El número es como el modelo
 * señala una celda en `propose_change`.
 */
function textoDeCuaderno(estructura) {
    const partes = [];
    const params = Object.entries(estructura.parametros || {});
    if (params.length) partes.push(`Parameters (used in cells as {{name}}): ${params.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ')}`);
    if (estructura.vivas?.length) partes.push(`Live views in the session (each SQL cell that ran leaves one, named after the cell): ${estructura.vivas.join(', ')}`);
    for (const c of estructura.celdas || []) {
        if (c.tipo === 'texto') {
            partes.push(`### Cell ${c.n} · text${c.borrador ? ' (draft)' : ''}\n${c.texto}`);
            continue;
        }
        const extras = [
            c.lee?.length ? `reads: ${c.lee.join(', ')}` : null,
            c.materializada ? 'materialized' : null,
            c.borrador ? 'draft' : null,
            c.estado === 'error' ? 'last run FAILED' : c.estado === 'corrio' ? `ran${c.filas !== undefined ? `, ${c.filas} rows` : ''}` : 'not run',
        ].filter(Boolean).join(' · ');
        partes.push(`### Cell ${c.n} · SQL${c.nombre ? ` \`${c.nombre}\`` : ' (no name yet)'} (${extras})\n\`\`\`sql\n${c.texto}\n\`\`\``);
    }
    return partes.join('\n\n');
}

/** Quita los valores entre comillas de un mensaje de error (pueden ser datos de una fila). */
function sinLiterales(texto) {
    return String(texto || '').replace(/'(?:[^'\n]|'')*'/g, "'…'").replace(/"(?:[^"\n]){40,}"/g, '"…"');
}

/**
 * Dónde está el usuario y qué falló (E2): la selección o la sentencia bajo el
 * cursor, y el error de la última ejecución. Con la política, el error sale sin
 * los valores que cita; si el archivo no sale, tampoco su selección.
 *
 * @param {object|null} foco - `{ seleccion: { texto, desde, hasta } | null, sentencia: { desde, hasta } | null }`
 */
function prepararFoco({ archivo, foco = null, error = null, datos = 'filas' }) {
    const out = {};
    if (archivo && !archivo.retenido && foco && typeof foco === 'object') {
        const lineas = String(archivo.contenido || '').split(/\r?\n/);
        const rango = (r) => (r && Number.isInteger(r.desde) && Number.isInteger(r.hasta) && r.desde >= 1 && r.hasta >= r.desde && r.desde <= lineas.length
            ? { desde: r.desde, hasta: Math.min(r.hasta, lineas.length) } : null);
        const sel = rango(foco.seleccion);
        if (archivo.tipo === 'cuaderno') {
            // E3: la celda en la que está (por número, el mismo que ve el modelo).
            const c = (archivo.celdas || []).find(x => x.n === foco.celda?.n);
            if (c) out.celda = { n: c.n, tipo: c.tipo, nombre: c.nombre || null };
        } else if (sel && String(foco.seleccion.texto || '').trim()) {
            out.seleccion = { ...sel, texto: String(foco.seleccion.texto).slice(0, 4000) };
        } else if (archivo.tipo === 'markdown') {
            const s = rango(foco.seccion);
            if (s) out.seccion = { ...s, titulo: foco.seccion.titulo ? String(foco.seccion.titulo).slice(0, 200) : null };
        } else {
            const s = rango(foco.sentencia);
            if (s) out.sentencia = { ...s, texto: lineas.slice(s.desde - 1, s.hasta).join('\n').slice(0, 4000) };
        }
    }
    if (error && String(error).trim()) {
        const e = String(error).slice(0, 1500);
        out.error = datos === 'filas' ? e : sinLiterales(e);
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
function prepararArchivo({ filePath = null, fileType = null, contenido = '', datos = 'filas', local = true, estructura = null } = {}) {
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

    // E3: un notebook llega con su estructura (las celdas como las tiene el
    // editor); el modelo lo lee por celdas numeradas y propone por celdas.
    let celdas = null;
    if (tipo === 'cuaderno' && estructura && Array.isArray(estructura.celdas)) {
        celdas = estructura.celdas.slice(0, 300).map(c => ({
            n: Number(c.n), tipo: c.tipo === 'texto' ? 'texto' : 'sql',
            nombre: c.nombre ? String(c.nombre) : null, texto: String(c.texto ?? ''),
            lee: Array.isArray(c.lee) ? c.lee.map(String) : [], materializada: !!c.materializada, borrador: !!c.borrador,
            estado: c.estado || null, filas: Number.isFinite(c.filas) ? c.filas : undefined,
        }));
        texto = textoDeCuaderno({ ...estructura, celdas });
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
        // Qué es, si es un archivo del proyecto que AmoxSQL entiende (T3, M3).
        descripcion: conocido(filePath),
        // Los tipos que se cambian por líneas (E2; Markdown desde E3): el prompt
        // numera sus líneas y el modelo propone un rango con `propose_change`.
        porLineas: tipo === 'sql' || tipo === 'texto' || tipo === 'markdown',
        // El notebook se cambia por celdas (E3), cuando llega su estructura.
        porCeldas: !!celdas,
        celdas,
        idiomaCuerpo: celdas ? 'markdown' : idioma,
    };
}

module.exports = { prepararArchivo, prepararFoco, sinLiterales, conocido, tipoDe, esCredencial, TIPOS, TOPE };
