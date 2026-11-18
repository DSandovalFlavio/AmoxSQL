/**
 * Lo que una celda dice cuando falla, en sus propios términos (6.0.1, F0).
 *
 * Puro: sin React y sin motor, para poder probarlo solo.
 *
 * ## La línea del error es la de la celda
 *
 * La celda no manda al motor lo que se escribió: lo envuelve en
 * `CREATE OR REPLACE TEMP VIEW "x" AS (\n…\n);` (`utils/vistaDeCelda.js`). El
 * motor cuenta las líneas de ESE texto, así que un error en la primera línea de
 * la celda llegaba como «LINE 2». Quien escribió una sola línea no tiene manera
 * de entenderlo. Aquí se resta lo que puso el envoltorio, y la línea que queda
 * es la que se marca en el editor.
 *
 * ## Un parámetro sin valor no llega al motor
 *
 * `{{anio}}` sin declarar se mandaba tal cual y volvía como «Parser Error:
 * syntax error at or near "{"». Se detecta antes y se dice qué falta.
 */

/** Las líneas que el envoltorio pone delante del SQL de la celda. */
export function desfaseDeEnvoltorio(deja) {
    return deja === 'vista' || deja === 'tabla' ? 1 : 0;
}

/**
 * El mensaje con la línea corregida, y esa línea (o `null` si no trae ninguna).
 *
 * El motor escribe `LINE n:` delante del trozo de consulta que falla. Si la
 * línea cae en el envoltorio (n ≤ desfase), el fallo no es de una línea de la
 * celda y no se marca ninguna.
 */
export function lineaDelError(mensaje, desfase = 0) {
    const texto = String(mensaje || '');
    let linea = null;
    const corregido = texto.replace(/\bLINE (\d+):/g, (todo, n) => {
        const propia = Number(n) - desfase;
        if (propia < 1) return todo;
        if (linea === null) linea = propia;
        return `LINE ${propia}:`;
    });
    return { mensaje: corregido, linea };
}

/** Los `{{nombre}}` del texto que no tienen valor, en orden y sin repetir. */
export function parametrosSinValor(texto, parametros) {
    const declarados = parametros || {};
    const faltan = [];
    const re = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g;
    let m;
    while ((m = re.exec(String(texto || ''))) !== null) {
        const n = m[1];
        if (faltan.includes(n)) continue;
        const v = declarados[n];
        if (v === undefined || v === null || String(v).trim() === '') faltan.push(n);
    }
    return faltan;
}
