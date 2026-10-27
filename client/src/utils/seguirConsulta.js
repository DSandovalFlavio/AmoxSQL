/**
 * **Un gráfico vinculado sigue a su consulta** (Dec-81).
 *
 * Un `.amoxvis` con origen (`ventas.sql`) lleva además una copia de la
 * consulta, para abrirse en cualquier sitio. Cuando se guarda el `.sql`, esa
 * copia tiene que ir detrás: si no, el gráfico enseña la consulta de ayer y el
 * deck que lo usa también.
 *
 * Un `.sql` puede tener varias sentencias y el gráfico salir de una de ellas.
 * Se sigue a la consulta cuando se sabe cuál es, y solo entonces:
 *   - sigue estando en el archivo, entera o como una de sus sentencias → igual;
 *   - era el archivo entero → el archivo nuevo entero;
 *   - era la sentencia i y el archivo sigue teniendo las mismas → la nueva i;
 *   - el archivo ahora es una sola sentencia → esa;
 *   - si no → dudosa: no se toca, y el gráfico lo dice al abrirse.
 * Puro: lo usan LayoutManager al guardar y las pruebas.
 */
import { splitSqlStatements } from './sqlSplitter.js';

const normal = (s) => String(s || '').trim().replace(/;\s*$/, '').trim();

export function consultaQueSigue(consulta, anterior, nuevo) {
    const c = normal(consulta);
    if (!c) return { estado: 'igual' };
    const ahora = splitSqlStatements(nuevo || '');
    const esta = (lista, texto) => lista.findIndex(st => normal(st.raw) === texto || normal(st.code) === texto);

    if (normal(nuevo) === c || esta(ahora, c) >= 0) return { estado: 'igual' };
    if (anterior != null && normal(anterior) === c) return { estado: 'sigue', consulta: String(nuevo).trim() };
    if (anterior != null) {
        const antes = splitSqlStatements(anterior);
        const i = esta(antes, c);
        if (i >= 0 && antes.length === ahora.length) return { estado: 'sigue', consulta: ahora[i].raw };
    }
    if (ahora.length === 1) return { estado: 'sigue', consulta: ahora[0].raw };
    return { estado: 'dudosa' };
}

/**
 * El texto de un `.amoxvis` con otra consulta: solo cambia
 * `usermeta.amoxsql.consulta` (o `query` en el formato anterior). El spec y su
 * huella quedan como estaban. null si el texto no se entiende.
 */
export function conConsulta(texto, consulta) {
    let o;
    try { o = JSON.parse(texto); } catch { return null; }
    if (!o || typeof o !== 'object') return null;
    if (o.usermeta && o.usermeta.amoxsql) o.usermeta.amoxsql.consulta = consulta;
    else o.query = consulta;
    return JSON.stringify(o, null, 2);
}
