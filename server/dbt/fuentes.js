/**
 * Las fuentes con nombre de AmoxSQL, para dbt (5.12; I7, Dec-31).
 *
 * La ruta de cada máquina no se escribe en un archivo que viaja en git (Dec-9):
 * el `sources.yml` que escribe AmoxSQL dice `{{ env_var('AMOXSQL_FUENTE_<NOMBRE>') }}`,
 * y el corredor de dbt (Dec-26) pone esas variables al lanzarlo.
 *
 *   AMOXSQL_FUENTE_<NOMBRE>          cómo se lee: la misma lectura que la vista de
 *                                    la fuente en AmoxSQL, entre paréntesis (dbt-duckdb
 *                                    usa tal cual un `external_location` con «(»)
 *   AMOXSQL_FUENTE_<NOMBRE>_ARCHIVO  el archivo que se lee, para la frescura
 *                                    (`loaded_at_query` con `read_blob`, fase 0.4)
 *
 * Sólo archivos y carpetas de esta máquina: un bucket o un lago necesitan su
 * credencial dentro de la conexión de dbt, y eso no viaja en una variable.
 */
const fuentes = require('../fuentes');

const nombreDeVariable = (nombre) => `AMOXSQL_FUENTE_${String(nombre).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
const paraElMotor = (ruta) => String(ruta).replace(/\\/g, '/');

/** Las variables de las fuentes que puede usar el proyecto: { NOMBRE: valor }. */
async function variables(raiz) {
    const { fuentes: lista } = fuentes.definiciones({ raiz });
    if (!lista.length) return {};
    const locales = await fuentes.ubicacionesLocales().catch(() => new Map());
    const env = {};
    for (const item of lista) {
        const def = item.def;
        if (def.tipo !== 'archivo' && def.tipo !== 'carpeta') continue;
        const r = fuentes.resolver(item, locales);
        if (!r.ubicacion) continue;
        try {
            const sql = fuentes.sqlDeLectura(def, r.ubicacion);
            const v = nombreDeVariable(def.nombre);
            env[v] = `(${sql})`;
            // De una carpeta, el más reciente que terminó de llegar (también con
            // «todos»: la frescura es la del último que llegó).
            const archivo = def.tipo === 'carpeta'
                ? fuentes.archivosDeCarpeta(r.ubicacion, def).find(a => a.quieto)?.ruta
                : r.ubicacion;
            if (archivo) env[`${v}_ARCHIVO`] = paraElMotor(archivo);
        } catch { /* una carpeta vacía o un archivo que aún llega: dbt dirá que no la encuentra */ }
    }
    return env;
}

module.exports = { variables, nombreDeVariable };
