/**
 * Esquemas anidados (6.0, DuckDB 2).
 *
 * DuckDB 2 deja crear esquemas dentro de esquemas (`CREATE SCHEMA ventas.crudo`), pero
 * `information_schema` da sólo el último nombre: `ventas.crudo.pedidos` sale con
 * `table_schema = 'crudo'`, sin el padre, y `crudo.pedidos` NO resuelve (hace falta la
 * ruta entera). Además dos padres pueden tener un hijo con el mismo nombre
 * (`ventas.crudo` y `compras.crudo`), así que el nombre no basta: lo que identifica a un
 * esquema es su `schema_oid`.
 *
 * Aquí están las mismas columnas que AmoxSQL leía de `information_schema.tables` y
 * `.columns`, pero con `table_schema` = la **ruta** del esquema unida por puntos
 * (`ventas.crudo`). Un esquema de primer nivel se llama como siempre, así que todo lo
 * que no usa anidados ve exactamente lo de antes. Son subconsultas: se ponen donde iba
 * `information_schema.tables` (con su alias) y no dejan nada en la sesión.
 *
 * Para nombrar un objeto, `citarRuta('ventas.crudo')` → `"ventas"."crudo"`.
 */

// La ruta de cada esquema, por su oid: los de primer nivel, y cada hijo con la de su padre.
const RUTAS = `WITH RECURSIVE __amox_rutas(database_name, oid, ruta) AS (
        SELECT database_name, oid, schema_name FROM duckdb_schemas() WHERE parent_schema_oid IS NULL
        UNION ALL
        SELECT s.database_name, s.oid, r.ruta || '.' || s.schema_name
          FROM duckdb_schemas() s JOIN __amox_rutas r ON s.parent_schema_oid = r.oid AND s.database_name = r.database_name
    )`;

/** Como `information_schema.tables`: table_catalog, table_schema (ruta), table_name, table_type, table_comment, estimated_size (sólo tablas). */
const TABLAS = `(${RUTAS}
    SELECT t.database_name AS table_catalog, coalesce(r.ruta, t.schema_name) AS table_schema, t.table_name,
           CASE WHEN t.temporary THEN 'LOCAL TEMPORARY' ELSE 'BASE TABLE' END AS table_type, t.comment AS table_comment,
           t.estimated_size
      FROM duckdb_tables() t LEFT JOIN __amox_rutas r ON r.oid = t.schema_oid AND r.database_name = t.database_name
     WHERE NOT t.internal
    UNION ALL
    SELECT v.database_name, coalesce(r.ruta, v.schema_name), v.view_name, 'VIEW', v.comment, NULL
      FROM duckdb_views() v LEFT JOIN __amox_rutas r ON r.oid = v.schema_oid AND r.database_name = v.database_name
     WHERE NOT v.internal)`;

/** Como `information_schema.columns`: table_catalog, table_schema (ruta), table_name, column_name, data_type, ordinal_position, is_nullable, column_default, column_comment. */
const COLUMNAS = `(${RUTAS}
    SELECT c.database_name AS table_catalog, coalesce(r.ruta, c.schema_name) AS table_schema, c.table_name, c.column_name,
           c.data_type, c.column_index AS ordinal_position, CASE WHEN c.is_nullable THEN 'YES' ELSE 'NO' END AS is_nullable,
           c.column_default, c.comment AS column_comment
      FROM duckdb_columns() c LEFT JOIN __amox_rutas r ON r.oid = c.schema_oid AND r.database_name = c.database_name
     WHERE NOT c.internal)`;

/** Como `information_schema.schemata`, más el padre: catalog_name, schema_name (ruta), parent, depth, schema_comment. */
const ESQUEMAS = `(${RUTAS}
    SELECT s.database_name AS catalog_name, coalesce(r.ruta, s.schema_name) AS schema_name,
           s.parent_schema AS parent, length(coalesce(r.ruta, s.schema_name)) - length(replace(coalesce(r.ruta, s.schema_name), '.', '')) AS depth,
           s.comment AS schema_comment
      FROM duckdb_schemas() s LEFT JOIN __amox_rutas r ON r.oid = s.oid AND r.database_name = s.database_name
     WHERE NOT s.internal OR s.schema_name = 'main')`;

const comillas = (s) => `"${String(s).replace(/"/g, '""')}"`;

/** Los nombres de una ruta de esquema (`ventas.crudo` → ['ventas', 'crudo']). Ya citados se respetan. */
function partes(ruta) {
    const s = String(ruta ?? '');
    const out = [];
    let actual = '', dentro = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '"') {
            if (dentro && s[i + 1] === '"') { actual += '"'; i++; continue; }
            dentro = !dentro;
            continue;
        }
        if (ch === '.' && !dentro) { out.push(actual); actual = ''; continue; }
        actual += ch;
    }
    out.push(actual);
    return out.filter(p => p !== '');
}

/** `ventas.crudo` → `"ventas"."crudo"`; `main` → `"main"`. */
function citarRuta(ruta) {
    return partes(ruta).map(comillas).join('.');
}

/** La referencia a un objeto dentro de un esquema (con ruta): `"ventas"."crudo"."pedidos"`. Sin esquema, sólo el nombre. */
function referencia(esquema, nombre, catalogo = null) {
    const ps = [...(catalogo ? [comillas(catalogo)] : []), ...(esquema ? partes(esquema).map(comillas) : []), comillas(nombre)];
    return ps.join('.');
}

module.exports = { TABLAS, COLUMNAS, ESQUEMAS, partes, citarRuta, referencia };
