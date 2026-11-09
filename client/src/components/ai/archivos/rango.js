/**
 * **Una propuesta por líneas, sobre el archivo de ahora** (plan del Assistant, E2).
 *
 * `propose_change` dice qué líneas reemplazar (`objetivo.desde..hasta`) y trae el
 * texto que había (`original`) y las líneas vecinas (`ancla`). Entre que se propuso
 * y que se acepta, el usuario pudo escribir encima o debajo: las líneas se
 * corrieron, pero esa parte sigue igual. Así que se ubica por su texto:
 *
 *   1. donde dice la propuesta, si allí sigue el mismo texto;
 *   2. si no, donde esté ese texto, si aparece una sola vez;
 *   3. si no está (o está más de una vez), la propuesta caducó: esa parte cambió.
 *
 * Una inserción (`hasta = desde - 1`) no tiene texto propio: se ubica por las
 * líneas entre las que va.
 *
 * Puro. Lo usan `propuestas.estadoDe`, la revisión en el editor y el que la aplica.
 */

const lineasDe = (t) => String(t ?? '').replace(/\r/g, '').split('\n');
const igual = (a, b) => a.length === b.length && a.every((l, i) => l.trimEnd() === b[i].trimEnd());

/** ¿Es una propuesta por líneas? */
export const esDeRango = (r) => r?.action === 'propose_change' && r.objetivo?.tipo === 'rango';

/**
 * Dónde cae hoy la propuesta en el texto, o null si caducó.
 * @returns {{ desde: number, hasta: number } | null} líneas desde 1; `hasta = desde - 1` es una inserción
 */
export function ubicarRango(texto, r) {
    if (!esDeRango(r)) return null;
    const lineas = lineasDe(texto);
    const n = lineas.length;
    const { desde, hasta } = r.objetivo;
    const largo = hasta - desde + 1;

    if (largo > 0) {
        const buscado = lineasDe(r.original);
        if (desde >= 1 && hasta <= n && igual(lineas.slice(desde - 1, hasta), buscado)) return { desde, hasta };
        const hallados = [];
        for (let i = 0; i + buscado.length <= n; i++) {
            if (igual(lineas.slice(i, i + buscado.length), buscado)) {
                hallados.push(i);
                if (hallados.length > 1) break;
            }
        }
        return hallados.length === 1 ? { desde: hallados[0] + 1, hasta: hallados[0] + buscado.length } : null;
    }

    // Inserción antes de la línea `desde`: entre `ancla.antes` y `ancla.despues`.
    const { antes = null, despues = null } = r.ancla || {};
    const encaja = (k) => {   // ¿se puede insertar antes de la línea k (1..n+1)?
        const okAntes = antes == null ? k === 1 : (k >= 2 && lineas[k - 2].trimEnd() === antes.trimEnd());
        const okDespues = despues == null ? k === n + 1 || (k === n && lineas[n - 1] === '') : (k <= n && lineas[k - 1].trimEnd() === despues.trimEnd());
        return okAntes && okDespues;
    };
    if (desde >= 1 && desde <= n + 1 && encaja(desde)) return { desde, hasta: desde - 1 };
    const hallados = [];
    for (let k = 1; k <= n + 1; k++) if (encaja(k)) hallados.push(k);
    return hallados.length === 1 ? { desde: hallados[0], hasta: hallados[0] - 1 } : null;
}

/** El texto con la propuesta aplicada, o `{ error }` si caducó. */
export function aplicarRango(texto, r) {
    const donde = ubicarRango(texto, r);
    if (!donde) return { error: 'That part of the file changed since this was proposed.' };
    const lineas = lineasDe(texto);
    const nuevas = r.contenido === '' ? [] : lineasDe(r.contenido);
    lineas.splice(donde.desde - 1, donde.hasta - donde.desde + 1, ...nuevas);
    return { texto: lineas.join('\n'), donde };
}

/** «lines 18–20», «line 4», «before line 7», «at the end». */
export function describirRango(r, donde = null) {
    const d = donde || r?.objetivo || {};
    if (!d.desde) return 'this file';
    if (d.hasta < d.desde) return `before line ${d.desde}`;
    return d.desde === d.hasta ? `line ${d.desde}` : `lines ${d.desde}–${d.hasta}`;
}
