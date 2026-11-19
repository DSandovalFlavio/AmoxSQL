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
const fs = require('fs');
const path = require('path');
const { DuckDBInstance } = require('@duckdb/node-api');
const { homeAmox } = require('./rutas');

const OPCIONES = { enable_external_file_cache: 'false', http_retry_backoff: '1.5' };

/**
 * Extensiones sin firma (6.0.1): una extensión propia (compilada por el usuario,
 * o de un repositorio que no es el oficial ni el community) sólo se puede cargar
 * si la instancia NACE con `allow_unsigned_extensions`; el motor no deja cambiarlo
 * después. Apagado por defecto; se enciende en el panel Extensions y vive en
 * `config.json → extensionesSinFirma`. Se lee aquí, del archivo, en cada
 * instancia: así lo heredan también los contextos de Data Flow, las ejecuciones
 * programadas y la línea de comandos, que no pasan por el mismo proceso.
 */
function permiteSinFirma() {
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(homeAmox(), 'config.json'), 'utf8'));
        return cfg?.extensionesSinFirma === true;
    } catch {
        return false;
    }
}

function opciones() {
    return permiteSinFirma() ? { ...OPCIONES, allow_unsigned_extensions: 'true' } : OPCIONES;
}

function crearInstancia(ruta = ':memory:') {
    return DuckDBInstance.create(ruta, opciones());
}

module.exports = { crearInstancia, OPCIONES, opciones, permiteSinFirma };
