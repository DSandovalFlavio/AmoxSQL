/**
 * Dónde está cada cosa en el texto del editor de código: un lector de JSON que,
 * además del valor, apunta en qué caracteres empieza y termina cada nodo. Lo usa
 * el modo Código para marcar las líneas que son extras (Dec-77).
 *
 * `ubicar(texto)` → Map de ruta ('layer/2/mark') a { inicio, fin } (offsets), o
 * null si el JSON no es válido (mientras se escribe, por ejemplo).
 */
export function ubicar(texto) {
    let i = 0;
    const rangos = new Map();
    const blanco = () => { while (i < texto.length && /\s/.test(texto[i])) i++; };
    const fallo = () => { throw new Error('json'); };

    const cadena = () => {
        if (texto[i] !== '"') fallo();
        let r = '';
        i++;
        while (i < texto.length && texto[i] !== '"') {
            if (texto[i] === '\\') { r += texto[i] + texto[i + 1]; i += 2; } else r += texto[i++];
        }
        if (texto[i] !== '"') fallo();
        i++;
        return JSON.parse(`"${r}"`);
    };

    const valor = (ruta) => {
        blanco();
        const inicio = i;
        const ch = texto[i];
        if (ch === '{') {
            i++; blanco();
            if (texto[i] === '}') i++;
            else {
                for (;;) {
                    blanco();
                    const clave = cadena();
                    blanco();
                    if (texto[i] !== ':') fallo();
                    i++;
                    valor([...ruta, clave]);
                    blanco();
                    if (texto[i] === ',') { i++; continue; }
                    if (texto[i] === '}') { i++; break; }
                    fallo();
                }
            }
        } else if (ch === '[') {
            i++; blanco();
            if (texto[i] === ']') i++;
            else {
                for (let n = 0; ; n++) {
                    valor([...ruta, n]);
                    blanco();
                    if (texto[i] === ',') { i++; continue; }
                    if (texto[i] === ']') { i++; break; }
                    fallo();
                }
            }
        } else if (ch === '"') cadena();
        else {
            const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(texto.slice(i, i + 40));
            if (!m) fallo();
            i += m[0].length;
        }
        rangos.set(ruta.join('/'), { inicio, fin: i });
    };

    try {
        valor([]);
        blanco();
        return i === texto.length ? rangos : null;
    } catch {
        return null;
    }
}

/** El rango de una ruta; si no existe (una clave borrada), el de su padre más cercano. */
export function rangoDe(rangos, ruta) {
    for (let n = ruta.length; n >= 0; n--) {
        const r = rangos.get(ruta.slice(0, n).join('/'));
        if (r) return r;
    }
    return null;
}
