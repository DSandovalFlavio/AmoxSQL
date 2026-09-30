/**
 * Las migraciones de la base de AmoxSQL, en orden.
 *
 * Cada una sube el esquema una versión y se aplica entera o no se aplica: va
 * dentro de una transacción junto con la línea de `meta` que anota su número.
 * Una migración publicada NO se edita nunca; si hace falta cambiar algo, se
 * añade otra detrás. Lo que ya está en la máquina de alguien depende de que
 * la 1 siga siendo la 1.
 *
 * Los campos con estructura (política de IA, marca, parámetros) se guardan como
 * texto JSON en VARCHAR, no como el tipo JSON del motor: así la base no depende
 * de que esa extensión esté cargada. Se leen con JSON.parse en el servidor.
 *
 * Sin claves foráneas, a propósito: DuckDB no hace ON DELETE CASCADE y una
 * clave foránea impide borrar la fila a la que apunta. La coherencia entre
 * tablas la guarda el código que las escribe.
 */

const MIGRACIONES = [
    {
        version: 1,
        nombre: 'inicial',
        // El esquema entero de la 5.9 de una vez (fase 1.3 del plan), para no
        // encadenar cinco migraciones en las fases siguientes. Las familias
        // posteriores añaden sus tablas con migraciones nuevas.
        sql: [
            // B1 y B3. `politica_ia` (B4) y `marca` (B5) son JSON en texto.
            `CREATE TABLE workspaces (
                id          VARCHAR PRIMARY KEY,
                nombre      VARCHAR NOT NULL,
                etiqueta    VARCHAR,
                color       VARCHAR,
                politica_ia VARCHAR,
                marca       VARCHAR,
                creado      TIMESTAMP NOT NULL DEFAULT current_timestamp,
                archivado   TIMESTAMP
            )`,
            // Un proyecto es una carpeta. La clave es un id propio y NO la ruta:
            // la carpeta se puede mover, y actualizar una columna con índice
            // único es justo lo que DuckDB hace peor. La ruta se desduplica en
            // el código.
            `CREATE TABLE proyectos (
                id             VARCHAR PRIMARY KEY,
                ruta           VARCHAR NOT NULL,
                nombre         VARCHAR,
                workspace_id   VARCHAR,
                estado         VARCHAR,
                entrega        DATE,
                ultimo_abierto TIMESTAMP,
                no_preguntar   BOOLEAN NOT NULL DEFAULT false,
                origen         VARCHAR
            )`,
            // A1. `cifrado` es lo que devuelve el llavero del sistema: el valor
            // en claro no toca nunca esta tabla.
            `CREATE TABLE credenciales (
                nombre     VARCHAR PRIMARY KEY,
                tipo       VARCHAR NOT NULL,
                cifrado    BLOB NOT NULL,
                creada     TIMESTAMP NOT NULL DEFAULT current_timestamp,
                ultimo_uso TIMESTAMP
            )`,
            // A3 y A4. `estado`: en_curso · ok · fallo · interrumpida.
            `CREATE TABLE ejecuciones (
                id           VARCHAR PRIMARY KEY,
                proceso      VARCHAR NOT NULL,
                proyecto     VARCHAR,
                workspace_id VARCHAR,
                origen       VARCHAR NOT NULL,
                inicio       TIMESTAMP NOT NULL,
                fin          TIMESTAMP,
                estado       VARCHAR NOT NULL,
                error        VARCHAR,
                parametros   VARCHAR
            )`,
            // B8, avisos vistos, migraciones de datos ya hechas…
            `CREATE TABLE preferencias (
                clave VARCHAR PRIMARY KEY,
                valor VARCHAR
            )`,
        ],
    },
];

module.exports = { MIGRACIONES };
