/**
 * Cómo se abre una instancia del motor en AmoxSQL. Un solo sitio, para que
 * todas —la sesión del proyecto, los contextos de Data Flow, las vistas
 * previas— nazcan con la misma configuración.
 *
 * `enable_external_file_cache = false`: el motor guarda en memoria trozos de
 * los archivos que lee y, si el archivo se REEMPLAZA (un Parquet que se vuelve a
 * publicar, el Excel que llega con el mismo nombre), sirve bytes del anterior.
 * Medido en la fase 6 de la 5.10: leyendo un Parquet que se renombra encima
 * quince veces, 14 lecturas fallaron («No magic bytes», «Footer length») con la
 * caché, y ninguna sin ella. AmoxSQL vive de archivos que cambian; la caché
 * ahorra poco en archivos locales.
 *
 * `http_retry_backoff = 1.5` (6.0): DuckDB 2 reintenta un 503 nueve veces con la
 * espera multiplicada por 4 en cada una: una descarga contra un servidor caído
 * tardaba 67 s en fallar (1.5 tardaba medio segundo). Con 1.5, 3,7 s; un servidor
 * que vuelve en un instante sigue saliendo bien. La espera larga, para una caída
 * de minutos, es la de AmoxSQL (`ejecucion/reintentos.js`, Dec-43).
 */
const { DuckDBInstance } = require('@duckdb/node-api');

const OPCIONES = { enable_external_file_cache: 'false', http_retry_backoff: '1.5' };

function crearInstancia(ruta = ':memory:') {
    return DuckDBInstance.create(ruta, OPCIONES);
}

module.exports = { crearInstancia, OPCIONES };
