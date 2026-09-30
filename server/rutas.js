/**
 * Dónde vive lo de AmoxSQL que no es de ningún proyecto.
 *
 * Hasta la 5.8 cada módulo construía su propia ruta con
 * `path.join(os.homedir(), '.amoxsql', …)`. Funcionaba, pero ataba la
 * configuración, la galería y la documentación descargada a la carpeta real del
 * usuario, sin forma de apartarlas. Eso importa desde la 5.9: la base central,
 * el llavero y las migraciones escriben ahí, y una prueba o una alfa lanzada en
 * desarrollo no puede tocar la configuración de quien la ejecuta.
 *
 * `AMOXSQL_HOME` lo aparta. Las pruebas la apuntan SIEMPRE a una carpeta
 * temporal. Sin la variable, todo sigue exactamente donde estaba.
 *
 * OJO: no confundir con la carpeta `.amoxsql/` que hay DENTRO de cada proyecto
 * (project.json, el contexto de la IA). Esa es del proyecto y no cambia.
 */
const os = require('os');
const path = require('path');

function homeAmox() {
    const propio = (process.env.AMOXSQL_HOME || '').trim();
    return propio ? path.resolve(propio) : path.join(os.homedir(), '.amoxsql');
}

module.exports = { homeAmox };
