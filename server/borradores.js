/**
 * **El gráfico de un `.sql` se recuerda con el archivo** (Dec-79).
 *
 * Al pasar de la tabla al gráfico en los resultados de un `.sql` y
 * configurarlo, eso no es un documento: es una vista de la consulta. No hay
 * nada que guardar ni que preguntar al cerrar, pero tampoco se pierde: al volver
 * a abrir el archivo, mañana, el gráfico está como lo dejaste. Cuando el
 * gráfico tiene que vivir por su cuenta (un deck, el Lienzo, compartirlo) se
 * guarda como `.amoxvis`, que sí es un documento.
 *
 * Vive en `<proyecto>/.amoxsql/borradores/graficos.json`, una entrada por
 * archivo (la ruta relativa al proyecto), con su propio `.gitignore`: es el
 * estado de quien trabaja en esta máquina, no parte del proyecto, y no viaja en
 * el `.amoxproject`.
 */
const fs = require('fs');
const path = require('path');

const CARPETA = path.join('.amoxsql', 'borradores');
const ARCHIVO = 'graficos.json';

const carpetaDe = (proyecto) => path.join(proyecto, CARPETA);
const archivoDe = (proyecto) => path.join(carpetaDe(proyecto), ARCHIVO);

/** La clave de un archivo: relativa al proyecto con `/`; absoluta si está fuera. */
function claveDe(proyecto, ruta) {
    const abs = path.isAbsolute(ruta) ? ruta : path.join(proyecto, ruta);
    const rel = path.relative(proyecto, abs);
    const fuera = !rel || rel.startsWith('..') || path.isAbsolute(rel);
    return (fuera ? path.resolve(abs) : rel).replace(/\\/g, '/');
}

function leerTodo(proyecto) {
    try {
        const o = JSON.parse(fs.readFileSync(archivoDe(proyecto), 'utf8'));
        return o && typeof o.archivos === 'object' ? o : { version: 1, archivos: {} };
    } catch {
        return { version: 1, archivos: {} };
    }
}

function escribirTodo(proyecto, todo) {
    const dir = carpetaDe(proyecto);
    fs.mkdirSync(dir, { recursive: true });
    const ignorar = path.join(dir, '.gitignore');
    if (!fs.existsSync(ignorar)) fs.writeFileSync(ignorar, '*\n');
    // Aparte y renombrado: un corte a mitad no deja el archivo a medias.
    const destino = archivoDe(proyecto);
    const tmp = `${destino}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(todo, null, 2), 'utf8');
    fs.renameSync(tmp, destino);
}

/** El borrador de un archivo: `{ vista, grafico, actualizado }` o null. */
function leer(proyecto, ruta) {
    if (!proyecto || !ruta) return null;
    return leerTodo(proyecto).archivos[claveDe(proyecto, ruta)] || null;
}

/**
 * Junta `cambios` (`vista`, `grafico`) con lo que ya había. `null` borra la
 * entrada entera.
 */
function poner(proyecto, ruta, cambios) {
    if (!proyecto || !ruta) return null;
    const todo = leerTodo(proyecto);
    const clave = claveDe(proyecto, ruta);
    if (cambios === null) {
        if (!todo.archivos[clave]) return null;
        delete todo.archivos[clave];
    } else {
        const previo = todo.archivos[clave] || {};
        const nuevo = { ...previo, actualizado: new Date().toISOString() };
        if ('vista' in cambios) nuevo.vista = cambios.vista || null;
        if ('grafico' in cambios) nuevo.grafico = cambios.grafico || null;
        todo.archivos[clave] = nuevo;
    }
    escribirTodo(proyecto, todo);
    return todo.archivos[clave] || null;
}

/** Al renombrar o mover un archivo (o una carpeta), su borrador lo acompaña. */
function mover(proyecto, de, a) {
    if (!proyecto || !de || !a) return;
    const todo = leerTodo(proyecto);
    const viejo = claveDe(proyecto, de);
    const nuevo = claveDe(proyecto, a);
    let cambio = false;
    for (const clave of Object.keys(todo.archivos)) {
        if (clave === viejo || clave.startsWith(`${viejo}/`)) {
            todo.archivos[nuevo + clave.slice(viejo.length)] = todo.archivos[clave];
            delete todo.archivos[clave];
            cambio = true;
        }
    }
    if (cambio) escribirTodo(proyecto, todo);
}

module.exports = { leer, poner, mover, claveDe, CARPETA };
