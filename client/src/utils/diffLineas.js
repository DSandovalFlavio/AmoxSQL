/**
 * **Lo que cambia entre dos textos, línea a línea** (plan del Assistant, A4).
 *
 * La propuesta del Assistant se pintaba marcando como «añadida» cualquier línea
 * que no existiera en algún lugar del archivo (un `Set` de líneas): no enseñaba lo
 * que se quita, y una línea movida o repetida salía mal. Esto es un diff de
 * verdad, por la subsecuencia común más larga (LCS).
 *
 * Puro. Lo usan la revisión en el editor (`ai/revision/RevisionEnMonaco.js`) y el
 * bloque del chat (`EditProposalBlock`).
 */

/** Más allá de esto (filas × columnas de la tabla LCS) no se busca lo común: todo sale y todo entra. */
const TOPE_CELDAS = 4_000_000;

const partir = (t) => (Array.isArray(t) ? t : String(t ?? '').replace(/\r/g, '').split('\n'));

/**
 * @param {string|string[]} antes
 * @param {string|string[]} despues
 * @returns {{
 *   operaciones: Array<{ tipo: 'igual'|'sale'|'entra', texto: string, a: number|null, b: number|null }>,
 *   bloques: Array<{ desdeA: number, hastaA: number, desdeB: number, hastaB: number, sale: string[], entra: string[] }>,
 *   quitadas: number, agregadas: number,
 * }}
 * `a` y `b` son índices (desde 0) en `antes` y `despues`. Un bloque es una racha
 * de cambios entre líneas iguales: `[desdeA, hastaA)` sale y `[desdeB, hastaB)` entra.
 */
export function diffLineas(antes, despues) {
    const A = partir(antes);
    const B = partir(despues);

    // Lo igual al principio y al final no entra en la tabla: casi siempre es casi todo.
    let ini = 0;
    while (ini < A.length && ini < B.length && A[ini] === B[ini]) ini++;
    let finA = A.length, finB = B.length;
    while (finA > ini && finB > ini && A[finA - 1] === B[finB - 1]) { finA--; finB--; }

    const medio = [];
    const a = A.slice(ini, finA), b = B.slice(ini, finB);
    if (a.length && b.length && a.length * b.length <= TOPE_CELDAS) {
        // lcs[i][j] = largo de lo común entre a[i..] y b[j..]
        const m = a.length, n = b.length;
        const lcs = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
        for (let i = m - 1; i >= 0; i--) {
            for (let j = n - 1; j >= 0; j--) {
                lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
            }
        }
        let i = 0, j = 0;
        while (i < m && j < n) {
            if (a[i] === b[j]) { medio.push({ tipo: 'igual', i, j }); i++; j++; }
            else if (lcs[i + 1][j] >= lcs[i][j + 1]) { medio.push({ tipo: 'sale', i }); i++; }
            else { medio.push({ tipo: 'entra', j }); j++; }
        }
        while (i < m) medio.push({ tipo: 'sale', i: i++ });
        while (j < n) medio.push({ tipo: 'entra', j: j++ });
    } else {
        for (let i = 0; i < a.length; i++) medio.push({ tipo: 'sale', i });
        for (let j = 0; j < b.length; j++) medio.push({ tipo: 'entra', j });
    }

    const operaciones = [];
    for (let k = 0; k < ini; k++) operaciones.push({ tipo: 'igual', texto: A[k], a: k, b: k });
    for (const o of medio) {
        if (o.tipo === 'igual') operaciones.push({ tipo: 'igual', texto: a[o.i], a: ini + o.i, b: ini + o.j });
        else if (o.tipo === 'sale') operaciones.push({ tipo: 'sale', texto: a[o.i], a: ini + o.i, b: null });
        else operaciones.push({ tipo: 'entra', texto: b[o.j], a: null, b: ini + o.j });
    }
    for (let k = 0; k < A.length - finA; k++) operaciones.push({ tipo: 'igual', texto: A[finA + k], a: finA + k, b: finB + k });

    // Los bloques: rachas de cambios, con su posición en los dos textos.
    const bloques = [];
    let posA = 0, posB = 0, actual = null;
    for (const o of operaciones) {
        if (o.tipo === 'igual') {
            if (actual) { bloques.push(actual); actual = null; }
            posA++; posB++;
            continue;
        }
        if (!actual) actual = { desdeA: posA, hastaA: posA, desdeB: posB, hastaB: posB, sale: [], entra: [] };
        if (o.tipo === 'sale') { actual.sale.push(o.texto); posA++; actual.hastaA = posA; }
        else { actual.entra.push(o.texto); posB++; actual.hastaB = posB; }
    }
    if (actual) bloques.push(actual);

    return {
        operaciones,
        bloques,
        quitadas: operaciones.filter(o => o.tipo === 'sale').length,
        agregadas: operaciones.filter(o => o.tipo === 'entra').length,
    };
}
