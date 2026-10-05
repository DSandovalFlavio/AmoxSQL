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
            // A1. `cifrado` es lo que devuelve el llavero del sistema, en base64:
            // el valor en claro no toca nunca esta tabla. Texto y no BLOB porque
            // así ida y vuelta por getRowObjectsJson es exacta.
            `CREATE TABLE credenciales (
                nombre     VARCHAR PRIMARY KEY,
                tipo       VARCHAR NOT NULL,
                cifrado    VARCHAR NOT NULL,
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
    {
        version: 2,
        nombre: 'historial de Data Flow',
        // A4 (fase 3.5). Hasta la 5.8 el historial de las cadenas vivía en la
        // base de cada proyecto (`amoxsql_chains` dentro de su .duckdb), y por
        // eso correr un proceso escribía en ella aunque sólo moviera archivos.
        // Aquí las tablas son las mismas —ChainPersistence escribe igual en una
        // y en otra— más `proyecto`, porque esta base es de todos los
        // proyectos. `chain_file` va con la ruta absoluta por la misma razón.
        // El id de cada `runs` es el de su fila en `ejecuciones`.
        sql: [
            `CREATE SCHEMA amoxsql_chains`,
            `CREATE TABLE amoxsql_chains.runs (
                id              VARCHAR PRIMARY KEY,
                chain_file      VARCHAR NOT NULL,
                chain_name      VARCHAR,
                started_at      TIMESTAMP DEFAULT current_timestamp,
                finished_at     TIMESTAMP,
                status          VARCHAR DEFAULT 'running',
                start_node_id   VARCHAR,
                run_mode        VARCHAR DEFAULT 'full',
                total_nodes     INTEGER,
                completed_nodes INTEGER DEFAULT 0,
                failed_node_id  VARCHAR,
                proyecto        VARCHAR
            )`,
            `CREATE TABLE amoxsql_chains.node_runs (
                id              VARCHAR PRIMARY KEY,
                run_id          VARCHAR NOT NULL,
                node_id         VARCHAR NOT NULL,
                node_type       VARCHAR NOT NULL,
                node_label      VARCHAR,
                status          VARCHAR DEFAULT 'pending',
                started_at      TIMESTAMP,
                finished_at     TIMESTAMP,
                duration_ms     INTEGER,
                result_type     VARCHAR,
                result_summary  VARCHAR,
                error_message   VARCHAR,
                sql_executed    VARCHAR
            )`,
        ],
    },
    {
        version: 3,
        nombre: 'fuentes con nombre',
        // C1 (5.10, fase 1). Dónde está cada fuente en ESTA máquina (Dec-9): la
        // definición es texto del workspace o del proyecto, y viaja; la ruta
        // local no viaja, porque en la máquina de al lado es otra. `ambito` es
        // `w:<id del workspace>` o `p:<id del proyecto>`: el id y no la ruta,
        // para que mover la carpeta no pierda la ubicación.
        //
        // Una base con este esquema no la abre la 5.9 (Dec-8): lo dicen las
        // notas de la 5.10.0-alpha.1.
        sql: [
            `CREATE TABLE fuentes_locales (
                ambito      VARCHAR NOT NULL,
                nombre      VARCHAR NOT NULL,
                ubicacion   VARCHAR NOT NULL,
                actualizada TIMESTAMP NOT NULL DEFAULT current_timestamp,
                PRIMARY KEY (ambito, nombre)
            )`,
        ],
    },
    {
        version: 4,
        nombre: 'destinos y programaciones',
        // 5.11 (D6 y D1). Dónde está cada destino de entrega en ESTA máquina
        // (Dec-21: las dos mitades de una fuente, con la flecha al revés), y lo
        // programado, que es de la máquina (Dec-15): no viaja en el proceso.
        // `ejecuciones` sabe además qué programación la lanzó y para qué hora
        // estaba prevista —la clave que impide correr dos veces la misma
        // ocurrencia (Dec-16)— y guarda su resumen para la bitácora y el aviso.
        //
        // Una base con este esquema no la abre la 5.10: lo dicen las notas de
        // la 5.11.0-alpha.2.
        sql: [
            `CREATE TABLE destinos_locales (
                ambito      VARCHAR NOT NULL,
                nombre      VARCHAR NOT NULL,
                ubicacion   VARCHAR NOT NULL,
                actualizada TIMESTAMP NOT NULL DEFAULT current_timestamp,
                PRIMARY KEY (ambito, nombre)
            )`,
            `CREATE TABLE programaciones (
                id              VARCHAR PRIMARY KEY,
                nombre          VARCHAR,
                proceso         VARCHAR NOT NULL,
                proyecto        VARCHAR NOT NULL,
                workspace_id    VARCHAR,
                regla           VARCHAR NOT NULL,
                parametros      VARCHAR,
                avisar          VARCHAR NOT NULL DEFAULT 'siempre',
                ponerse_al_dia  BOOLEAN NOT NULL DEFAULT true,
                activa          BOOLEAN NOT NULL DEFAULT true,
                pausada_hasta   TIMESTAMP,
                creada          TIMESTAMP NOT NULL DEFAULT current_timestamp,
                ultima_prevista TIMESTAMP,
                proxima         TIMESTAMP
            )`,
            `ALTER TABLE ejecuciones ADD COLUMN programacion_id VARCHAR`,
            `ALTER TABLE ejecuciones ADD COLUMN prevista TIMESTAMP`,
            `ALTER TABLE ejecuciones ADD COLUMN resumen VARCHAR`,
        ],
    },
];

module.exports = { MIGRACIONES };
