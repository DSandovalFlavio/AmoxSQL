/**
 * Lo que sale del Canvas (5.15, fase 3; Dec-60). Puro: decide qué se escribe,
 * y quien llama decide cuándo tocar el disco.
 *
 * - **Present** recorre los marcos en orden de lectura.
 * - **Un marco → Report Flow**: una lámina por marco, con su texto y sus gráficos.
 * - **El lienzo → un cuaderno**: las tarjetas en orden de dependencias.
 * - **Una rama → Data Flow**: los pasos SQL que hacen falta para llegar a una
 *   tarjeta, cada uno como una tabla con su nombre, listos para programarse.
 * - **Una tarjeta → .sql**: su consulta **autónoma** (lo de arriba como CTE).
 *
 * ## Por qué «autónoma»
 *
 * En el lienzo una tarjeta lee la vista de otra, que sólo existe en la sesión. Lo
 * que sale (un .sql, el gráfico de un deck) se ejecuta en otro sitio y otro día,
 * así que lleva dentro todo lo que necesita: cada tarjeta de arriba como un CTE
 * con su nombre, en orden de dependencias, y la suya al final.
 */
import { analizarLienzo, grafoDeLienzo, ordenDeRefresco, sqlDeTarjeta, sqlDeVisual } from './grafoLienzo.js';
import { DEJAN_VISTA } from '../../utils/lienzoFile.js';
import { escribirCuaderno } from '../../utils/cuadernoFile.js';
import { citarIdentificador } from '../../utils/vistaDeCelda.js';

const llave = (n) => String(n || '').toLowerCase();
const sinPuntoFinal = (sql) => String(sql || '').trimEnd().replace(/;+\s*$/, '');
const nombreSql = (n) => (/^[A-Za-z_][\w$]*$/.test(n) ? n : citarIdentificador(n));

/** Orden de lectura: de arriba abajo y, en la misma franja, de izquierda a derecha. */
export function enOrdenDeLectura(tarjetas, franja = 80) {
    return [...(tarjetas || [])].sort((a, b) => {
        const fa = Math.round((a.y ?? 0) / franja), fb = Math.round((b.y ?? 0) / franja);
        return fa - fb || (a.x ?? 0) - (b.x ?? 0);
    });
}

/** Los marcos, en el orden en que se presentan. */
export function marcosEnOrden(lienzo) {
    return enOrdenDeLectura((lienzo?.tarjetas || []).filter(t => t.tipo === 'frame'), 200);
}

/** Lo que tiene dentro un marco, en orden de lectura. */
export function tarjetasDeMarco(lienzo, marco) {
    return enOrdenDeLectura((lienzo?.tarjetas || []).filter(t => t.marco === marco));
}

/** Todo lo que una tarjeta de datos necesita para existir: ella y sus antepasados, en orden. */
export function ramaHasta(lienzo, id) {
    const analisis = analizarLienzo(lienzo);
    const g = grafoDeLienzo(lienzo, analisis);
    const necesarias = new Set([id]);
    const subir = (x) => { for (const p of g.padres.get(x) || []) if (!necesarias.has(p)) { necesarias.add(p); subir(p); } };
    subir(id);
    return ordenDeRefresco(lienzo, { analisis }).orden.filter(x => necesarias.has(x));
}

/**
 * La consulta de una tarjeta lista para ejecutarse fuera del lienzo: lo que
 * lee, como CTE; la suya, al final. Un Chart o un Number, la suya sobre lo que
 * enseñan. `null` si no es una tarjeta de datos ni una visual conectada.
 */
export function sqlAutonomo(lienzo, id) {
    const porId = new Map((lienzo?.tarjetas || []).map(t => [llave(t.id), t]));
    const t = porId.get(llave(id));
    if (!t) return null;
    const visual = t.tipo === 'chart' || t.tipo === 'number';
    const base = visual ? [t.desde, t.cifra?.comparar].filter(Boolean) : [t.id];
    if (!base.length || base.some(b => !DEJAN_VISTA.has(porId.get(llave(b))?.tipo))) return null;
    const rama = [];
    for (const b of base) for (const x of ramaHasta(lienzo, porId.get(llave(b)).id)) if (!rama.includes(x)) rama.push(x);
    const final = visual ? sinPuntoFinal(sqlDeVisual(t)) : null;
    const ctes = (visual ? rama : rama.slice(0, -1))
        .map(x => `${nombreSql(x)} AS (\n${sinPuntoFinal(sqlDeTarjeta(porId.get(llave(x))))}\n)`);
    const cuerpo = visual ? final : sinPuntoFinal(sqlDeTarjeta(t));
    if (!ctes.length) return `${cuerpo}\n`;
    // Una consulta que ya empieza por WITH no admite otro WITH delante: se anida.
    const cuerpoFinal = /^\s*WITH\b/i.test(cuerpo) ? `SELECT * FROM (\n${cuerpo}\n)` : cuerpo;
    return `WITH ${ctes.join(',\n')}\n${cuerpoFinal}\n`;
}

/**
 * El lienzo como cuaderno: las tarjetas en orden de lectura, con las de datos
 * reordenadas lo justo para que ninguna lea algo que esté más abajo. Los textos
 * y las notas pasan a texto; los gráficos y las cifras no tienen equivalente y
 * se dicen en una línea.
 */
export function aCuaderno(lienzo) {
    const tarjetas = (lienzo?.tarjetas || []).filter(t => t.tipo !== 'frame');
    const lectura = enOrdenDeLectura(tarjetas);
    const ordenDatos = ordenDeRefresco(lienzo).orden;
    // Las de datos ocupan los huecos de datos de la lectura, pero en el orden del grafo.
    const cola = [...ordenDatos];
    const ordenadas = lectura.map((t) => {
        if (!DEJAN_VISTA.has(t.tipo)) return t;
        const siguiente = cola.shift();
        return tarjetas.find(x => x.id === siguiente);
    }).filter(Boolean);
    const celdas = [];
    const titulo = lienzo?.titulo;
    if (titulo) celdas.push({ tipo: 'texto', contenido: `# ${titulo}` });
    for (const t of ordenadas) {
        if (t.tipo === 'text' && String(t.texto || '').trim()) celdas.push({ tipo: 'texto', contenido: t.texto.trim() });
        else if (t.tipo === 'note' && String(t.texto || '').trim()) celdas.push({ tipo: 'texto', contenido: `> ${t.texto.trim().replace(/\n/g, '\n> ')}` });
        else if (DEJAN_VISTA.has(t.tipo)) celdas.push({ tipo: 'sql', nombre: t.id, materializada: !!t.materializada, contenido: sqlDeTarjeta(t).trim() });
        else if (t.tipo === 'chart' && t.desde) celdas.push({ tipo: 'texto', contenido: `*Chart of \`${t.desde}\` on the canvas: open the cell's result as a chart.*` });
    }
    const parametros = lienzo?.parametros && Object.keys(lienzo.parametros).length ? { parametros: lienzo.parametros } : {};
    return escribirCuaderno({ meta: { ...(titulo ? { titulo } : {}), ...parametros }, celdas });
}

/**
 * Una rama como proceso de Data Flow: un paso SQL por tarjeta, cada uno deja
 * una tabla con el nombre de la tarjeta (así el SQL de abajo se lee igual que en
 * el lienzo). Los `{{parametro}}` pasan a `${parametro}`, con su valor de ahora
 * como valor por omisión.
 */
export function aDataFlow(lienzo, id) {
    const porId = new Map((lienzo?.tarjetas || []).map(t => [t.id, t]));
    const rama = ramaHasta(lienzo, id);
    const analisis = analizarLienzo(lienzo);
    const g = grafoDeLienzo(lienzo, analisis);
    const aDolar = (sql) => String(sql || '').replace(/\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g, '${$1}');
    const usados = new Set();
    const nodos = rama.map((x, i) => {
        const sql = aDolar(sinPuntoFinal(sqlDeTarjeta(porId.get(x))));
        for (const m of sql.matchAll(/\$\{([A-Za-z_][\w-]*)\}/g)) usados.add(m[1]);
        return {
            id: `paso_${i + 1}`,
            type: 'sql_inline',
            label: x,
            position: { x: 80 + i * 300, y: 120 + (i % 2) * 60 },
            config: { query: `CREATE OR REPLACE TABLE ${nombreSql(x)} AS\n${sql}` },
            disabled: false,
        };
    });
    const idDe = new Map(rama.map((x, i) => [x, `paso_${i + 1}`]));
    const conexiones = [];
    for (const x of rama) for (const p of g.padres.get(x) || []) {
        if (idDe.has(p)) conexiones.push({ id: `e_${idDe.get(p)}_${idDe.get(x)}`, source: idDe.get(p), target: idDe.get(x) });
    }
    const variables = Object.fromEntries([...usados].map(n => [n, String(lienzo?.parametros?.[n] ?? '')]));
    return {
        version: '1.0',
        name: `${lienzo?.titulo || 'Canvas'} · ${id}`,
        description: `From the canvas: the steps that lead to "${id}". Add an Excel or Export File step at the end to deliver it.`,
        config: { base: 'trabajo' },
        nodes: nodos,
        edges: conexiones,
        variables,
    };
}

/**
 * Las láminas de Report Flow: una por marco (o, sin marcos, una por gráfico).
 * Devuelve `{ graficos: [{ archivo, contenido }], laminas: [{ layout, prose, charts }] }`
 * y quien llama escribe los `.amoxvis` y compone el deck.
 */
export function planDeDeck(lienzo, base = 'canvas') {
    // «¿Cómo va 2024?» → como_va_2024: sin acentos ni signos sueltos en el nombre
    // del archivo (antes salía «_C_mo_va_2024_»).
    const nombre = String(base || 'canvas').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'canvas';
    const graficos = [];
    const grafico = (t) => {
        const consulta = sqlAutonomo(lienzo, t.id);
        if (!consulta) return null;
        const archivo = `charts/${nombre}_${t.id}.amoxvis`;
        graficos.push({ archivo, contenido: JSON.stringify({ ...(t.grafico || { chartType: 'bar' }), query: consulta.trim() }, null, 2) });
        return archivo;
    };
    const lamina = (titulo, tarjetas) => {
        const textos = [];
        if (titulo) textos.push(`## ${titulo}`);
        const charts = [];
        for (const t of tarjetas) {
            if (t.tipo === 'text' && t.texto) textos.push(t.texto.trim());
            else if (t.tipo === 'note' && t.texto) textos.push(`> ${t.texto.trim()}`);
            else if (t.tipo === 'number' && t.foto?.valor !== undefined) {
                textos.push(`**${Number.isFinite(Number(t.foto.valor)) ? Number(t.foto.valor).toLocaleString('en-US', { maximumFractionDigits: 2 }) : t.foto.valor}** — ${t.cifra?.etiqueta || t.id}`);
            } else if (t.tipo === 'chart') {
                const a = grafico(t);
                if (a) charts.push({ src: a });
            }
        }
        const layout = charts.length === 1 ? 'chart-full' : charts.length > 1 ? 'chart-grid' : 'content';
        return { layout, prose: textos.join('\n\n'), charts };
    };
    const marcos = marcosEnOrden(lienzo);
    const laminas = marcos.length
        ? marcos.map(m => lamina(m.titulo || m.id, tarjetasDeMarco(lienzo, m.id)))
        : enOrdenDeLectura((lienzo?.tarjetas || []).filter(t => t.tipo === 'chart')).map(t => lamina(t.id, [t]));
    return { graficos, laminas: laminas.filter(l => l.prose || l.charts.length) };
}
