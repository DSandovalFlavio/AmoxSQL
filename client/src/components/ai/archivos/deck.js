/**
 * **El Assistant en un deck de Report Flow** (plan del Assistant, E4).
 *
 * Un deck no se cambia entero ni por líneas: se cambia **por láminas** (R1). Una
 * propuesta cambia una lámina (`cambiar`) o añade una después de otra
 * (`despues_de`), y nunca toca las demás, la cabecera ni las rutas de los
 * gráficos que no nombra.
 *
 * La propuesta no trae el crudo de la lámina: trae sus partes —el diseño, el texto,
 * los gráficos y las notas— y aquí se compone con `buildSlideRaw`, el mismo que usa
 * el Studio. Así las directivas que el modelo no ve (antetítulo, pie, tono) se
 * conservan, y un bloque mal escrito no puede romper el archivo.
 *
 * Las láminas no tienen identificador en el archivo: una propuesta las señala por
 * su número y por su crudo, que no cambia sin que el usuario la toque. Si la lámina
 * se movió, se encuentra; si su texto cambió, la propuesta caducó.
 *
 * Puro. Lo usan el panel (estado), el Studio (que la aplica con su historial) y las
 * pruebas.
 */
import { parseDeck, serializeDeck, DECK_LAYOUTS } from '../../../utils/deckParser.js';
import { splitSlideContent, buildSlideRaw, slideTitle } from '../../../utils/deckTemplates.js';

const limpio = (t) => String(t ?? '').replace(/\r/g, '').trim();

/** ¿Es una propuesta por láminas? */
export const esDeLamina = (r) => r?.action === 'propose_change' && r.objetivo?.tipo === 'lamina';

/**
 * Lo que el Assistant ve del deck: cada lámina con su número, su diseño, su texto,
 * sus gráficos y sus notas, y los diseños que existen. Viaja en el foco; el
 * servidor lo convierte en texto para el modelo y valida la propuesta con él.
 */
export function estructuraDeDeck(deck) {
    return {
        titulo: deck?.frontMatter?.title || null,
        disenos: [...DECK_LAYOUTS],
        laminas: (deck?.slides || []).slice(0, 200).map((s, i) => {
            const partes = splitSlideContent(s.markdown);
            return {
                n: i + 1,
                diseno: s.layout,
                titulo: slideTitle(s.markdown),
                prosa: partes.prose,
                graficos: partes.charts.map(c => c.src),
                notas: partes.notes || '',
                raw: s.raw,
            };
        }),
    };
}

/** La lámina a la que apunta: por número con su crudo, o por su crudo si es único. */
function hallar(slides, n, original) {
    const texto = limpio(original);
    if (n >= 1 && n <= slides.length && limpio(slides[n - 1].raw) === texto) return n - 1;
    const iguales = slides.map((s, i) => [s, i]).filter(([s]) => limpio(s.raw) === texto);
    return iguales.length === 1 ? iguales[0][1] : null;
}

/**
 * Dónde cae hoy la propuesta, o null si caducó.
 * @returns {{ indice: number, insertar: boolean } | null} `indice` desde 0: la lámina que cambia, o dónde entra la nueva
 */
export function ubicarLamina(slides, r) {
    if (!esDeLamina(r)) return null;
    const o = r.objetivo;
    if (o.accion === 'despues_de') {
        if (!o.n) return { indice: 0, insertar: true };
        const i = hallar(slides, o.n, r.original);
        return i === null ? null : { indice: i + 1, insertar: true };
    }
    const i = hallar(slides, o.n, r.original);
    return i === null ? null : { indice: i, insertar: false };
}

/**
 * El crudo de la lámina propuesta. Lo que la propuesta no dice se queda como
 * estaba: los gráficos (si no trae `graficos`), las notas (si no trae `notas`) y
 * siempre el antetítulo, el pie y el tono, que el modelo no cambia.
 * @param {object|null} slide - la lámina de hoy (null si es nueva)
 */
export function componerLamina(slide, propuesta) {
    const p = propuesta || {};
    const actual = slide ? splitSlideContent(slide.markdown) : { prose: '', charts: [], notes: '' };
    const graficos = Array.isArray(p.graficos)
        ? p.graficos.map(src => actual.charts.find(c => c.src === src) || { src })
        : actual.charts;
    return buildSlideRaw({
        layout: p.diseno || slide?.layout || 'content',
        eyebrow: slide ? slide.eyebrow : null,
        footer: slide ? slide.footer : null,
        tone: slide ? slide.tone : null,
        prose: p.prosa !== undefined && p.prosa !== null ? String(p.prosa) : actual.prose,
        charts: graficos,
        notes: p.notas !== undefined && p.notas !== null ? String(p.notas) : actual.notes,
    });
}

/** La lámina propuesta, leída como la lee el Studio (para dibujarla). */
export function laminaPropuesta(texto, r) {
    const { slides } = parseDeck(texto || '');
    const donde = ubicarLamina(slides, r);
    if (!donde) return null;
    const raw = componerLamina(donde.insertar ? null : slides[donde.indice], r.lamina);
    const leida = parseDeck(raw).slides[0];
    return leida ? { ...leida, id: `propuesta-${donde.indice}`, raw, donde } : null;
}

/**
 * El deck con la propuesta aplicada (las demás láminas, byte a byte), o `{ error }`.
 * Se comprueba la ida y vuelta: si la lámina compuesta no se lee como UNA lámina,
 * no se aplica.
 */
export function aplicarALaminas(texto, r) {
    const deck = parseDeck(texto || '');
    const donde = ubicarLamina(deck.slides, r);
    if (!donde) return { error: 'That slide changed since this was proposed.' };
    const raw = componerLamina(donde.insertar ? null : deck.slides[donde.indice], r.lamina);
    if (parseDeck(raw).slides.length !== 1) return { error: 'The proposed slide would not read as one slide.' };
    const laminas = deck.slides.map(s => ({ raw: s.raw }));
    if (donde.insertar) laminas.splice(donde.indice, 0, { raw });
    else laminas[donde.indice] = { raw };
    const nuevo = serializeDeck(deck.frontMatterText, laminas);
    if (parseDeck(nuevo).slides.length !== laminas.length) return { error: 'The deck would not read back the same.' };
    return { texto: nuevo, donde };
}

/** «Change to slide 3», «New slide after slide 2». */
export function describirLamina(r, donde = null) {
    const o = r?.objetivo || {};
    const n = donde ? (donde.insertar ? donde.indice : donde.indice + 1) : o.n;
    if (o.accion === 'despues_de') return n ? `New slide after slide ${n}` : 'New slide at the start';
    return `Change to slide ${n}`;
}

/** Qué cambia, en una lista corta: «Layout: content → finding», «Text», «Notes». */
export function cambiosDeLamina(slide, r) {
    const p = r?.lamina || {};
    if (!slide) return [`New ${p.diseno || 'content'} slide`];
    const actual = splitSlideContent(slide.markdown);
    const out = [];
    if (p.diseno && p.diseno !== slide.layout) out.push(`Layout: ${slide.layout} → ${p.diseno}`);
    if (p.prosa !== undefined && p.prosa !== null && limpio(p.prosa) !== limpio(actual.prose)) out.push('Text');
    if (Array.isArray(p.graficos) && JSON.stringify(p.graficos) !== JSON.stringify(actual.charts.map(c => c.src))) out.push('Charts');
    if (p.notas !== undefined && p.notas !== null && limpio(p.notas) !== limpio(actual.notes)) out.push('Speaker notes');
    return out.length ? out : ['No visible change'];
}
