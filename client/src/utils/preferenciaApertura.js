/**
 * Cómo quiere el usuario que se abra **este archivo concreto**.
 *
 * ## Por qué no basta un ajuste global
 *
 * Hay un ajuste, `defaultDataFileAction`, que decide qué pasa al abrir un
 * `.csv`, un `.parquet` o un `.json`: previsualizar o consultar. Funciona para
 * los dos primeros, y **no puede funcionar para el tercero**.
 *
 * Un `.json` puede ser un volcado de datos o la configuración de una
 * herramienta, y **por la extensión no se distinguen**. En el mismo proyecto,
 * el mismo día, conviven los dos. Un ajuste global obliga a elegir cuál de los
 * dos casos va a funcionar mal.
 *
 * Así que la elección es **por archivo**: la primera vez la ofrece el menú, y a
 * partir de ahí se recuerda. `config.json` se abre como texto; `eventos.json`
 * sigue abriéndose como datos.
 *
 * ## Por qué va por proyecto
 *
 * Las rutas que maneja el explorador son **relativas a la raíz del proyecto**,
 * así que `config.json` existe en todos. Sin separar por proyecto, marcar uno
 * como texto cambiaría el comportamiento en los demás — y el usuario lo viviría
 * como que la aplicación decide sola.
 *
 * ## Dónde vive
 *
 * En `localStorage`, junto al tema y el acento: es una preferencia **del
 * usuario**, no del proyecto. No tiene por qué acabar en el repositorio de
 * nadie ni viajar con el archivo.
 */
const LLAVE = 'amoxsql-apertura';

/** Los dos modos que se pueden recordar. Cualquier otra cosa se ignora. */
export const MODOS = ['texto', 'datos'];

/** Las rutas llegan con barras de los dos tipos según quién las produzca. */
function normalizar(ruta) {
    return String(ruta || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Nunca lanza: una preferencia rota no es motivo para no abrir un archivo. */
function leerTodo() {
    try {
        const crudo = localStorage.getItem(LLAVE);
        const obj = crudo ? JSON.parse(crudo) : {};
        return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    } catch {
        return {};
    }
}

function escribirTodo(obj) {
    try { localStorage.setItem(LLAVE, JSON.stringify(obj)); } catch { /* modo privado */ }
}

/**
 * Cómo se abrió este archivo la última vez, o `null` si nunca se dijo.
 *
 * `null` significa «decide tú», no «como datos»: quien pregunta se queda con su
 * comportamiento de siempre y no hay que cambiar ninguna rama existente.
 */
export function comoAbrir(proyecto, ruta) {
    const delProyecto = leerTodo()[normalizar(proyecto)];
    if (!delProyecto || typeof delProyecto !== 'object') return null;
    const modo = delProyecto[normalizar(ruta)];
    return MODOS.includes(modo) ? modo : null;
}

/** Recuerda la elección. Con un modo que no conocemos, la olvida. */
export function recordarApertura(proyecto, ruta, modo) {
    if (!MODOS.includes(modo)) return olvidarApertura(proyecto, ruta);
    const todo = leerTodo();
    const p = normalizar(proyecto);
    todo[p] = { ...(todo[p] || {}), [normalizar(ruta)]: modo };
    escribirTodo(todo);
}

/**
 * Deja de recordar. Se llama cuando el usuario hace algo que **contradice** lo
 * guardado —consultar un archivo que había marcado como texto—, porque esa
 * acción es una elección tan explícita como la anterior y tiene que pesar
 * igual. Si no, la aplicación se quedaría discutiendo con el usuario.
 */
export function olvidarApertura(proyecto, ruta) {
    const todo = leerTodo();
    const p = normalizar(proyecto);
    if (!todo[p]) return;
    delete todo[p][normalizar(ruta)];
    if (Object.keys(todo[p]).length === 0) delete todo[p];
    escribirTodo(todo);
}

/** Cuando se renombra o se mueve un archivo, la preferencia lo acompaña. */
export function moverPreferencia(proyecto, rutaVieja, rutaNueva) {
    const modo = comoAbrir(proyecto, rutaVieja);
    if (!modo) return;
    olvidarApertura(proyecto, rutaVieja);
    recordarApertura(proyecto, rutaNueva, modo);
}
