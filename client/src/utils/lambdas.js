/**
 * Las lambdas con flecha, a la sintaxis de DuckDB 2 (6.0, Dec-67).
 *
 * DuckDB 2 dejó de aceptar `x -> x + 1` («Deprecated lambda arrow»): ahora es
 * `lambda x: x + 1`. Lo que escribió alguien en la 5.x, o lo que copió de un ejemplo
 * viejo, falla. Esto reescribe sólo las flechas que son lambdas:
 *   - `x -> …`           → `lambda x: …`
 *   - `(x, i) -> …`      → `lambda x, i: …`
 * y deja como estaban el JSON (`j -> 'clave'`, `j -> 0`, `j ->> '$.a'`), lo que va entre
 * comillas (textos e identificadores) y los comentarios.
 */

const PALABRA = /[A-Za-z0-9_]/;
const UNA = /^([A-Za-z_][A-Za-z0-9_]*)\s*->(?!>)/;
const VARIAS = /^\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*\)\s*->(?!>)/;

/** ¿Lo que sigue a la flecha es una expresión (lambda) y no la clave de un JSON? */
function esCuerpo(texto, desde) {
    let i = desde;
    while (i < texto.length && /\s/.test(texto[i])) i++;
    const c = texto[i];
    return c !== undefined && !/['"0-9$]/.test(c);
}

/** El texto con sus lambdas de flecha reescritas, y cuántas eran. */
export function reescribirLambdas(sql) {
    const t = String(sql ?? '');
    let out = '', n = 0, i = 0;
    while (i < t.length) {
        const c = t[i], d = t[i + 1];
        // Comentarios y lo que va entre comillas: tal cual.
        if (c === '-' && d === '-') { const f = t.indexOf('\n', i); const fin = f < 0 ? t.length : f; out += t.slice(i, fin); i = fin; continue; }
        if (c === '/' && d === '*') { const f = t.indexOf('*/', i + 2); const fin = f < 0 ? t.length : f + 2; out += t.slice(i, fin); i = fin; continue; }
        if (c === "'" || c === '"') {
            let j = i + 1;
            while (j < t.length) { if (t[j] === c) { if (t[j + 1] === c) { j += 2; continue; } break; } j++; }
            out += t.slice(i, j + 1); i = j + 1; continue;
        }
        const antes = i > 0 ? t[i - 1] : '';
        const suelto = !PALABRA.test(antes) && antes !== '.' && antes !== '"';
        if (suelto && c === '(') {
            const m = VARIAS.exec(t.slice(i));
            if (m && esCuerpo(t, i + m[0].length)) {
                out += `lambda ${m[1].split(',').map(s => s.trim()).join(', ')}:`;
                i += m[0].length; n++; continue;
            }
        }
        if (suelto && /[A-Za-z_]/.test(c)) {
            const m = UNA.exec(t.slice(i));
            if (m && m[1].toLowerCase() !== 'lambda' && esCuerpo(t, i + m[0].length)) {
                out += `lambda ${m[1]}:`;
                i += m[0].length; n++; continue;
            }
            // Una palabra entera de una vez (para no volver a mirar sus letras sueltas).
            let j = i; while (j < t.length && PALABRA.test(t[j])) j++;
            out += t.slice(i, j); i = j; continue;
        }
        out += c; i++;
    }
    return { sql: out, cambios: n };
}

/** ¿El error del motor es el de la flecha de DuckDB 2? */
export const esErrorDeFlecha = (error) => /Deprecated lambda arrow/i.test(String(error || ''));
