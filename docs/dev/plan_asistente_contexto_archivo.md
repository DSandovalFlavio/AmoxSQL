# Plan — El asistente ve las columnas de tu archivo (contexto reactivo de objetos)

> **Estado**: PLAN + implementación (rama `claude/duckdb-expert`, extiende el PR #90)
> **Fecha**: 2026-07-22
> **Disparador**: transcript real donde el asistente pidió "dame el nombre de la tabla" 4 veces sobre un `SELECT * FROM 'data.csv'` — estaba CIEGO a las columnas porque el contexto acotado (F3) solo carga tablas de la BD, y un archivo no es una tabla.

## 1. El problema (verificado)

- El asistente recibe `currentQuery` (el texto del editor) pero **no las columnas** de lo que la query referencia cuando es un archivo (`FROM 'data.csv'`, `read_json_auto(...)`, etc.).
- `extractReferencedTables` (F3) solo matchea nombres de tablas reales de `information_schema` → un archivo matchea nada → **cero esquema** → el modelo pregunta por la tabla en vez de trabajar.
- Efecto secundario irónico: la optimización de rendimiento (contexto acotado) fue la que dejó ciego al asistente ante archivos.

## 2. Diseño

### A. Resolver de objetos de la query (`server/ai/queryObjects.js`)
`resolveQueryObjects(query, dbManager)` →
1. Extrae los **objetos referenciados en FROM/JOIN**: tablas de la BD + lecturas de archivo (`'ruta.csv'`, `read_csv/read_parquet/read_json/read_xlsx(...)`, cualquier formato compatible con DuckDB: csv, json, jsonl, parquet, xlsx/xls, tsv).
2. Para cada uno hace `DESCRIBE SELECT * FROM <objeto> LIMIT 0` (verificado: funciona con CSV, JSON, Parquet, Excel) → **columnas + tipos**.
3. Devuelve `[{ ref, label, kind: 'table'|'file', format, columns: [{name, type}] }]`. Errores por objeto se ignoran (no rompe si un archivo no existe).

### B. Contexto del asistente (reactivo por naturaleza)
- El endpoint de chat resuelve los objetos **desde `currentQuery` en CADA mensaje**. Como el cliente envía la query viva en cada envío, esto es **automáticamente reactivo**: si el usuario edita la query y añade una tabla/archivo nuevo, el siguiente mensaje ya trae su esquema. No es "solo el primer mensaje".
- Reemplaza/aumenta el contexto acotado de F3 en modo assistant: en vez de "solo tablas referenciadas de la BD", ahora "todos los objetos FROM/JOIN con columnas+tipos, incl. archivos".

### C. Pastillas (pills) sobre el composer (UI reactiva)
- Nuevo endpoint ligero `POST /api/ai/query-objects { query }` → devuelve los objetos resueltos (sin LLM, solo DESCRIBE, cacheado).
- El panel del asistente llama a este endpoint **con debounce cuando cambia la query activa** → renderiza pastillas encima del input: nombre del objeto + nº de columnas, expandible (hover/click) para ver columnas y tipos.
- Así el usuario VE lo que el modelo ve, y se actualiza al editar la query (nuevos objetos → nuevas pastillas).

### D. Botones de "aplicar" en el SQL (fricción #2 del transcript)
- Los bloques ```sql en markdown no tienen botones (por diseño). Dos vías:
  1. **Prompt**: empujar en modo assistant que el SQL propuesto se entregue vía `write_file` (mode overwrite) → tarjeta aceptar/rechazar existente.
  2. **UI**: añadir una barra bajo los bloques ```sql en el chat con "Aplicar al editor" / "Ejecutar" (infra `onApplyToFile`/`onRunSql` ya existe).

### E. Reforzar pattern-exclusion (fricción #3)
- El modelo garabateó `NOT GLOB 'plan%'` (solo prefijo) y alucinó `WHERE column_name NOT ILIKE` (filtra filas). La cheat sheet no bastó.
- Afinar: el ejemplo del gotcha/cheat sheet debe dejar clarísimo `SELECT * NOT ILIKE '%plan%'` para "contiene", y que `WHERE` NO filtra columnas.

## 3. Orden de implementación
1. **A** — `queryObjects.js` (resolver) + wire en el contexto del asistente (el gran desatascador).
2. **C** — pills endpoint + UI reactiva sobre el composer.
3. **D** — botones de aplicar (prompt + UI de bloque SQL).
4. **E** — refuerzo de la cheat sheet.

## 4. Notas
- Rendimiento: el DESCRIBE de un archivo lee solo el header/inferencia de esquema (no escanea filas) → barato. Cache por (query) con TTL corto para el endpoint de pills.
- Seguridad: los objetos se DESCRIBEN, no se ejecutan; se limita el nº de objetos por query (p.ej. 12).
- Compatibilidad: no rompe el contexto acotado para tablas de BD (F3) — lo extiende para incluir archivos.
