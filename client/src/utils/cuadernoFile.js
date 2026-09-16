/**
 * El archivo del cuaderno: **markdown, no JSON**.
 *
 * Hasta ahora un `.sqlnb` era un objeto JSON con las celdas dentro, y eso tenía
 * un coste que no se veía hasta que alguien intentaba revisar el trabajo de otro:
 * **un cambio de una línea de SQL produce un diff enorme**, y el contenido está
 * escapado, así que no se lee. Los dos formatos nuevos del producto —el deck y el
 * diagrama— ya aprendieron esto y son markdown. El cuaderno se quedó atrás.
 *
 * ## La forma
 *
 * Front-matter para lo del documento, y luego el cuerpo:
 *
 *     ---
 *     titulo: Caída de septiembre
 *     parametros:
 *       desde: 2026-09-01
 *     ---
 *
 *     # ¿Por qué cayeron las ventas?
 *
 *     Lo que se escribe suelto es una celda de texto.
 *
 *     <!-- celda: ventas_limpias -->
 *     ```sql
 *     -- Quito devoluciones
 *     SELECT * FROM ventas;
 *     ```
 *
 * **El markdown suelto es una celda de texto** y cada bloque cercado de `sql` es
 * una celda de código, con su nombre en la directiva de encima. Es el mismo
 * vocabulario que el deck (`<!-- layout: … -->` más bloques cercados): quien
 * sepa leer uno, sabe leer el otro.
 *
 * ## Por qué el nombre va FUERA del SQL
 *
 * Podría deducirse del `CREATE VIEW`, pero entonces habría que escribirlo — y
 * que no haya que escribirlo es justamente el objetivo. En la directiva, el
 * nombre es del cuaderno y el SQL se queda limpio.
 *
 * ## Los cuatro formatos
 *
 * Se leen los tres viejos además del nuevo: JSON v3, JSON v2 y los marcadores
 * `-- !CELL:`. **Nadie se queda sin abrir su archivo**; el primer guardado lo
 * pasa al nuevo.
 */

/** La directiva que abre una celda de código. */
const RE_DIRECTIVA = /^<!--\s*celda:\s*([^\s>]+)(\s+materializada)?\s*-->$/;
const CERCA = '```';

let contador = 0;
const idNuevo = () => `c${Date.now().toString(36)}${(contador++).toString(36)}`;

/** Parte el front-matter del cuerpo. Sin front-matter, todo es cuerpo. */
export function partirCabecera(texto) {
    const s = String(texto || '');
    if (!s.startsWith('---')) return { meta: {}, cuerpo: s };
    const fin = s.indexOf('\n---', 3);
    if (fin === -1) return { meta: {}, cuerpo: s };
    const crudo = s.slice(3, fin).replace(/^\r?\n/, '');
    const resto = s.slice(fin + 4).replace(/^\r?\n/, '');
    return { meta: leerMeta(crudo), cuerpo: resto };
}

/**
 * Un lector de front-matter deliberadamente pequeño.
 *
 * Sólo `clave: valor` y un nivel de anidamiento para los parámetros, que es todo
 * lo que este formato usa. Traer un analizador de YAML entero para esto sería
 * pagar un peso por una gramática que no se va a usar.
 */
function leerMeta(crudo) {
    const meta = {};
    let bloque = null;
    for (const linea of String(crudo || '').split('\n')) {
        if (!linea.trim() || linea.trim().startsWith('#')) continue;
        const sangrado = /^\s+/.test(linea);
        const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(linea);
        if (!m) continue;
        const [, clave, valor] = m;
        if (sangrado && bloque) {
            meta[bloque][clave] = desentrecomillar(valor);
            continue;
        }
        if (valor.trim() === '') {
            bloque = clave;
            meta[clave] = {};
            continue;
        }
        bloque = null;
        meta[clave] = desentrecomillar(valor);
    }
    return meta;
}

function desentrecomillar(v) {
    const t = String(v == null ? '' : v).trim();
    if (t.length > 1 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
        return t.slice(1, -1);
    }
    return t;
}

function escribirMeta(meta) {
    const lineas = [];
    for (const [clave, valor] of Object.entries(meta || {})) {
        if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
            if (Object.keys(valor).length === 0) continue;
            lineas.push(`${clave}:`);
            for (const [k, v] of Object.entries(valor)) lineas.push(`  ${k}: ${v}`);
            continue;
        }
        if (valor === '' || valor == null) continue;
        lineas.push(`${clave}: ${valor}`);
    }
    return lineas;
}

/**
 * Lee el cuerpo en celdas.
 *
 * Lo que hay entre dos bloques de código es **una** celda de texto. No se parte
 * por encabezados: el índice se construye leyendo los `#` de dentro, así que
 * partir aquí sería inventar celdas que el usuario no escribió.
 */
function leerCuerpo(cuerpo) {
    const lineas = String(cuerpo || '').split('\n');
    const celdas = [];
    let texto = [];
    let pendiente = null;   // la directiva leída, esperando su bloque

    const volcarTexto = () => {
        const t = texto.join('\n').trim();
        texto = [];
        if (t) celdas.push({ id: idNuevo(), tipo: 'texto', contenido: t });
    };

    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        const dir = RE_DIRECTIVA.exec(linea.trim());
        if (dir) {
            volcarTexto();
            pendiente = { nombre: dir[1], materializada: !!dir[2] };
            continue;
        }
        const abre = /^\s*```(\w*)\s*$/.exec(linea);
        if (abre && abre[1].toLowerCase() === 'sql') {
            volcarTexto();
            const dentro = [];
            i++;
            while (i < lineas.length && !/^\s*```\s*$/.test(lineas[i])) {
                dentro.push(lineas[i]);
                i++;
            }
            celdas.push({
                id: idNuevo(),
                tipo: 'sql',
                nombre: pendiente?.nombre || '',
                materializada: !!pendiente?.materializada,
                contenido: dentro.join('\n').trim(),
            });
            pendiente = null;
            continue;
        }
        // Una directiva sin su bloque detrás no se pierde: vuelve al texto.
        if (pendiente) {
            texto.push(`<!-- celda: ${pendiente.nombre}${pendiente.materializada ? ' materializada' : ''} -->`);
            pendiente = null;
        }
        texto.push(linea);
    }
    if (pendiente) texto.push(`<!-- celda: ${pendiente.nombre} -->`);
    volcarTexto();
    return celdas;
}

/** Un cuaderno vacío tiene una celda de código, para que haya dónde escribir. */
export const CUADERNO_INICIAL = { meta: {}, celdas: [{ id: 'c0', tipo: 'sql', nombre: '', materializada: false, contenido: '' }] };

/**
 * Lee un cuaderno venga en el formato que venga.
 *
 * Nunca devuelve `null`: un archivo que no se entiende se abre **como una celda
 * de texto con su contenido dentro**, que es mejor que no abrirlo. Perder el
 * archivo de alguien por no reconocer su forma sería el peor fallo posible aquí.
 */
export function leerCuaderno(texto) {
    const s = String(texto == null ? '' : texto);
    if (!s.trim()) return { ...CUADERNO_INICIAL, celdas: [{ ...CUADERNO_INICIAL.celdas[0], id: idNuevo() }] };

    // ── los formatos viejos ──
    const recortado = s.trimStart();
    if (recortado.startsWith('{')) {
        try {
            const j = JSON.parse(s);
            if (Array.isArray(j?.cells)) return deJson(j);
        } catch { /* no era JSON; sigue como markdown */ }
    }
    if (s.includes('-- !CELL:')) return deMarcadores(s);

    const { meta, cuerpo } = partirCabecera(s);
    const celdas = leerCuerpo(cuerpo);
    return { meta, celdas: celdas.length ? celdas : [{ id: idNuevo(), tipo: 'sql', nombre: '', materializada: false, contenido: '' }] };
}

/** JSON v2 y v3: `{ cells: [{ type, content }], environment }`. */
function deJson(j) {
    const celdas = j.cells.map((c) => {
        if (c.type === 'markdown') {
            return { id: idNuevo(), tipo: 'texto', contenido: String(c.content || '') };
        }
        if (c.type === 'input') {
            // Una celda de Input era un parámetro disfrazado de celda. Pasa a
            // serlo de verdad: al front-matter, y desaparece del cuerpo.
            return { id: idNuevo(), tipo: 'parametro', nombre: c.metadata?.varName || '', contenido: String(c.content ?? '') };
        }
        return { id: idNuevo(), tipo: 'sql', nombre: '', materializada: false, contenido: String(c.content || '') };
    });

    const parametros = { ...(j.environment || {}) };
    for (const c of celdas) {
        if (c.tipo === 'parametro' && c.nombre) parametros[c.nombre] = c.contenido;
    }
    return {
        meta: Object.keys(parametros).length ? { parametros } : {},
        celdas: celdas.filter((c) => c.tipo !== 'parametro'),
    };
}

/** El formato más viejo: `-- !CELL:CODE!` / `-- !CELL:MARKDOWN!`. */
function deMarcadores(s) {
    const celdas = [];
    let tipo = 'sql';
    let buf = [];
    const volcar = () => {
        const t = buf.join('\n').trim();
        buf = [];
        if (!t) return;
        celdas.push(tipo === 'texto'
            ? { id: idNuevo(), tipo: 'texto', contenido: t }
            : { id: idNuevo(), tipo: 'sql', nombre: '', materializada: false, contenido: t });
    };
    for (const linea of s.split('\n')) {
        const t = linea.trim();
        if (t === '-- !CELL:CODE!') { volcar(); tipo = 'sql'; continue; }
        if (t === '-- !CELL:MARKDOWN!') { volcar(); tipo = 'texto'; continue; }
        // En las celdas de texto el contenido iba comentado.
        buf.push(tipo === 'texto' ? linea.replace(/^\s*--\s?/, '') : linea);
    }
    volcar();
    return { meta: {}, celdas };
}

/**
 * Escribe el cuaderno.
 *
 * **Estable por requisito, no por casualidad**: estos archivos se versionan, y
 * un guardado que reordena o reformatea convierte cada commit en ruido. Leer y
 * volver a escribir sin tocar nada tiene que devolver el mismo texto.
 */
export function escribirCuaderno({ meta = {}, celdas = [] } = {}) {
    const partes = [];
    const cabecera = escribirMeta(meta);
    if (cabecera.length) partes.push(['---', ...cabecera, '---'].join('\n'));

    for (const celda of celdas) {
        if (celda.tipo === 'texto') {
            const t = String(celda.contenido || '').trim();
            if (t) partes.push(t);
            continue;
        }
        const nombre = String(celda.nombre || '').trim();
        const marca = celda.materializada ? ' materializada' : '';
        const dir = nombre ? `<!-- celda: ${nombre}${marca} -->` : null;
        const sql = String(celda.contenido || '').trim();
        partes.push([dir, `${CERCA}sql`, sql, CERCA].filter((x) => x !== null).join('\n'));
    }

    return partes.join('\n\n') + '\n';
}

/** El título del cuaderno: el del front-matter, o el primer `#` del cuerpo. */
export function tituloDe({ meta = {}, celdas = [] } = {}) {
    if (meta.titulo) return meta.titulo;
    for (const c of celdas) {
        if (c.tipo !== 'texto') continue;
        const m = /^#\s+(.+)$/m.exec(c.contenido || '');
        if (m) return m[1].trim();
    }
    return '';
}

/**
 * El índice, construido de los encabezados de las celdas de texto.
 *
 * Se mantiene solo escribiendo, que es la única forma de que un índice siga
 * siendo cierto: nadie sostiene uno a mano.
 */
export function indiceDe({ celdas = [] } = {}) {
    const entradas = [];
    for (const c of celdas) {
        if (c.tipo !== 'texto') continue;
        let enBloque = false;
        for (const linea of String(c.contenido || '').split('\n')) {
            // Un `#` dentro de un bloque de código no es un encabezado.
            if (/^\s*```/.test(linea)) { enBloque = !enBloque; continue; }
            if (enBloque) continue;
            const m = /^(#{1,3})\s+(.+)$/.exec(linea);
            if (m) entradas.push({ celda: c.id, nivel: m[1].length, texto: m[2].trim() });
        }
    }
    return entradas;
}
