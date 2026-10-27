# Plan de la 6.0 · El motor nuevo

> AmoxSQL pasa de DuckDB 1.5.6 a **DuckDB 2.0.0 LTS** (soportado hasta octubre de 2027),
> se arregla lo que el motor nuevo rompe y se aprovecha lo que trae. Plan escrito el
> 2026-10-25 leyendo `main` en `a7b5533` (5.15.1), con un POC del cliente de Node 2.0
> contra la base real del proyecto de ejemplo (`scratchpad/poc-duckdb2`, fuera del repo).

## 1. Qué es DuckDB 2.0

Publicado el **2026-10-21** («Cinnamon Teal»), casi 20 000 commits desde 1.5. Es una
versión de funcionalidades, no de estabilidad, y la primera de soporte largo de la serie 2.
El cliente de Node, `@duckdb/node-api@2.0.0-r.1`, salió el mismo día y ya es `latest`
(binarios para Windows x64/arm64, macOS arm64/x64 y Linux). Un primer parche (2.0.1) se
anuncia para noviembre.

| Área | Qué trae | Para AmoxSQL |
|---|---|---|
| **Servidor** | `quack`: el protocolo propio de DuckDB (`CALL quack_serve(token = …)`, `ATTACH 'quack:host'`). `CONNECT` cambia la sesión a una base remota, también **PostgreSQL y MySQL**, con un optimizador que **manda la consulta al servidor** en vez de traer las tablas | Leer la base del cliente donde está (§4, O7) |
| **E/S asíncrona** | Parquet, CSV y el formato propio leen en segundo plano con varias peticiones en vuelo; mucho mejor en `s3://`. Escrituras de Parquet asíncronas | Fuentes de carpeta, buckets y lagos, más rápidas sin tocar nada |
| **Memoria** | Las agregaciones **se vuelcan a disco** cuando no caben | Procesos grandes de fondo con `memory_limit` (5.13) que antes fallaban |
| **Optimizador** | Agregados parciales bajo los joins, reutilización de agregaciones, CTE recursivas reescritas (1M aristas: 4.9 s → 0.12 s), poda con zone maps y Bloom filters en structs, listas, decimales, `IN`, `contains`, `substr` | Gratis |
| **VARIANT** | Tipo de primera clase para datos semiestructurados, «triturado» en columnas; `variant_type`, `variant_keys`, `variant_contains`; Parquet triturado | Explorar JSON sin esquema (§4, O5) |
| **SQL** | **Triggers** (`BEFORE`/`AFTER`, por fila o sentencia, tablas de transición); **`$variable`** en cualquier expresión; CTE con `INSERT/UPDATE/DELETE/COPY`; **esquemas anidados** (`finanzas.reportes`); `NEAREST` joins; `json_set/insert/replace/remove`; `FETCH FIRST`; `OVERLAY()`; `UNNEST` en `GROUP BY`; semántica definida de `MERGE` | `$variable` y esquemas anidados tocan directamente a AmoxSQL |
| **Parser** | El parser PEG es el de serie; las extensiones añaden sintaxis; errores con posición | Mensajes de error del editor |
| **Almacenamiento** | Formato **69** de serie para las bases nuevas; carga perezosa de metadatos de columnas (tablas anchas abren antes); `DICT_FSST` de serie (cadenas más compactas); borrados compactos; más validación contra corrupción | Bases más chicas si se migran (§4, O4) |
| **Zonas horarias** | Sin ICU: zonas, calendarios y colaciones nativos, 2.2–2.6× más rápidos | Gratis |
| **Extensiones** | DuckLake **1.1**; Iceberg con más opciones de catálogo REST; Delta con `CREATE TABLE`, particiones y viaje en el tiempo; repositorios de extensiones firmados | Lagos (5.12) |
| **CLI** | Modo agente: tablas compactas en markdown, avisa de resultados truncados, corta consultas desbocadas, estima el costo antes de correr | Ideas para el asistente (§4, O6) |

### Lo que rompe (guía de migración)

1. **Formato de archivo**: una base **creada** por 2.0 no la abre ninguna versión anterior. Una base vieja que 2.0 abre y modifica **sigue** siendo legible por 1.x. `STORAGE_VERSION 'v1.5.0'` en `ATTACH` (o `storage_compatibility_version`) escribe en el formato viejo.
2. **Lambdas**: `x -> x + 1` está desactivada; es `lambda x: x + 1`. `SET lambda_syntax = 'enable_single_arrow'` la devuelve sólo hasta la 2.1.
3. **Parser PEG**: `~` y `!~` buscan coincidencia **parcial** (`'abc' ~ 'b'` es verdadero); `!` (factorial) liga más fuerte; `X'…'` y `B'…'` dan BLOB y BITSTRING.
4. **División entera entre cero**: `//` y `%` entre cero **lanzan error** (antes NULL). `TRY(...)` o `SET error_on_division_by_zero = false`.
5. **`NULL` sin tipo**: `CREATE TABLE t AS SELECT NULL AS x` crea una columna de tipo `"NULL"` que rechaza valores después. `SET legacy_disable_null_type = true` vuelve a lo anterior.
6. **`MERGE INTO`** que toca dos veces la misma fila: error.
7. **Ajustes retirados**: `custom_profiling_settings` (→ `tracked_metrics`), `enable_http_logging` y `http_logging_output` (→ `CALL enable_logging('HTTP')`); `profiling_mode` ya no hace nada; `preserve_identifier_case` pasa a texto.
8. **S3**: los parámetros en la URL (`?s3_access_key_id=…`) dejan de funcionar; sólo secretos.
9. **Python** (el entorno de dbt): `duckdb` 2.0 pide **Python 3.11 o más**.

## 2. Lo que se probó (POC, 2026-10-25)

Instalado `@duckdb/node-api@2.0.0-r.1` aparte y probado con `tienda.duckdb` (creada con 1.5.6, 310 956 filas).

**Funciona igual (13/13):** la API (`runAndReadAll`, `getRowObjectsJson`); `ATTACH` de la base de 1.5; CTE y ventanas; `duckdb_constraints()`; `COMMENT ON`; `read_csv` con patrón de carpeta; `TEMP MACRO` (medidas, 5.13); `SET VARIABLE`/`getvariable` (parámetros, 5.11); `enable_external_file_cache` (`motor.js`); las extensiones **excel** y **ducklake**; `COPY` a Parquet. También `$variable`, `FETCH FIRST`, la lambda nueva y leer columnas VARIANT (llegan como objeto).

**Compatibilidad de archivos** (cada motor en su propio proceso; en el mismo proceso los binarios nativos se pisan y el resultado engaña):

| Caso | La abre 1.5.6 |
|---|---|
| Base de 1.5 escrita por 2.0 | Sí |
| Base nueva creada por 2.0 | **No** (formato 69) |
| Base nueva de 2.0 con `STORAGE_VERSION 'v1.5.0'` | Sí |

**Se rompe en AmoxSQL:**

| Hallazgo | Dónde | Efecto |
|---|---|---|
| El JSON de `EXPLAIN (ANALYZE, FORMAT json)` cambió entero: antes una raíz con `latency`, `cpu_time`, `children` (`operator_name`, `operator_timing`, `operator_cardinality`…); ahora `{ io, operator: [ { type, timing, intermediate_rows, extra_info, children } ], optimizer, parser, physical_planner, planner, query, system }` | `server/index.js` (~950–1000), el visor del plan, `ai/tools.js:1002` | **El plan de ejecución deja de funcionar** |
| `PRAGMA profiling_mode='detailed'` deja el perfilado **encendido** en la conexión: cada consulta posterior imprime su árbol en la salida del servidor | `server/index.js:992` | Ruido y costo en cada consulta después de abrir un plan |
| `(SELECT NULL)` como relleno de un nodo sin entrada en Data Flow | `ChainExecutor.js:727, 750, 791, 795` | Una tabla con columna `"NULL"` que luego rechaza datos |
| Lambdas `->` | No las genera el código; **sí** el asistente (lo aprendió de la documentación de 1.x) y cualquier SQL del usuario | Error «Deprecated lambda arrow» |
| El paquete de documentación offline del asistente (`server/ai/data/duckdb-docs`, julio, 1.x) | `ai/tools` `lookup_duckdb_docs` | El asistente enseña sintaxis vieja |
| **Esquemas anidados**: `information_schema.tables` da `table_schema = 'reportes'` para `finanzas.reportes.cierre`, sin el padre | Explorador, ER, completado, `userTablesWhereClause` | Un esquema anidado se ve suelto y su nombre calificado no resuelve |
| El cliente de Node rechaza **crear** tipos lógicos VARIANT (issue #524 de `duckdb-node-neo`) | Parámetros tipados, si alguna vez se pasa un VARIANT | Leerlos funciona; crearlos desde JS no |
| `EXPLAIN` en texto cambió de dibujo | Nada lo analiza hoy en texto | — |
| dbt: `entorno.js` fija `duckdb == versión del motor` y acepta Python 3.10–3.13 | `server/dbt/entorno.js:22-25` | Con 2.0, **Python 3.10 ya no sirve**; `dbt-duckdb` 1.11.0 acepta `duckdb>=1.0.0` pero nadie lo ha probado con 2.0 |

## 3. Las decisiones que fija este plan

**Dec-62 · El motor.** `@duckdb/node-api` fijado **exacto** a `2.0.0-r.N` (como hoy `1.5.6-r.1`). `motor.js` sigue siendo el único sitio que crea instancias.

**Dec-63 · El formato de las bases.** No hay usuarios fijos (el autor, 2026-10-25), así que **las bases nuevas se crean en el formato 2.0** y no se escribe en el viejo. Las existentes siguen abriendo y no se tocan. `DatabaseManager` ya avisa con palabras cuando una base es de un motor más nuevo; ese aviso se queda para quien abra con una 5.x una base de la 6.0.

**Dec-64 · La base central.** `~/.amoxsql/amoxsql.duckdb` se queda en su formato al abrirla con 2.0 (no hace falta migrarla). Si en la 6.x se quiere compactar, se hace con el mismo mecanismo de O4.

**Dec-65 · El perfil del plan.** El plan de ejecución lee el JSON **nuevo** y deja de usar `profiling_mode`: `EXPLAIN (ANALYZE, FORMAT json)` ya trae todo (fases en `planner`, `optimizer`, `physical_planner`; E/S en `io`). Un adaptador puro (`server/planDeEjecucion.js`) convierte ese JSON en el árbol que pinta el cliente, con pruebas sobre salidas reales guardadas.

**Dec-66 · El SQL que genera AmoxSQL** no usa nada que 2.0 rompa: nada de `SELECT NULL` sin tipo, nada de `//`/`%` sin `TRY` en expresiones generadas, lambdas con `lambda`. Una guarda (`scripts/probarSqlGenerado.mjs`) recorre todos los generadores (Data Flow, Canvas, cuaderno, exportaciones, medidas, fuentes) y los ejecuta contra 2.0.

**Dec-67 · El asistente habla 2.0.** El paquete de documentación offline se regenera desde la documentación 2.0; el prompt dice la sintaxis nueva (lambda, `$variable`, partial match de `~`) y, si el usuario escribe una lambda con flecha, el editor ofrece reescribirla.

**Dec-68 · dbt.** El entorno propio pasa a `duckdb == 2.0.x`, `dbt-duckdb` 1.11.0 (o la primera que declare 2.0) y **Python 3.11–3.13**. Un entorno elegido por el usuario con duckdb 1.x sigue funcionando para correr dbt, pero AmoxSQL avisa: las bases que cree AmoxSQL ya no las abrirá ese dbt.

## 4. Lo que AmoxSQL puede ganar (oportunidades)

Ordenadas por valor para el analista que entrega cada semana. Las marcadas **6.0** entran en este plan; el resto queda anotado en `candidatos_v6.md`.

| # | Oportunidad | Qué cambia para el usuario | Esfuerzo | Entra |
|---|---|---|---|---|
| **O1** | **Parámetros con `$variable`** | Hoy las variables del editor `${x}` se pegan como texto (un texto sin comillas rompe la consulta, como pasó al capturar el ejemplo), el cuaderno usa `{{x}}` como texto y Data Flow reescribe a `getvariable('x')`. Con 2.0, las tres pueden ser **variables reales del motor** (`SET VARIABLE` + `$x`): sin comillas a mano, sin inyección, con su tipo. Se siguen aceptando `${x}` y `{{x}}` y se traducen | M | **6.0** |
| **O2** | **El plan de ejecución, mejor** | Además de arreglarlo (Dec-65): la E/S (`total_bytes_read`) y las fases del planificador por separado, y la poda nueva (grupos de filas leídos de los totales, «Row Groups Scanned: 2 / 3») visible en el árbol | S | **6.0** |
| **O3** | **Esquemas anidados** en el explorador, el ER y el completado | Ordenar un proyecto grande en `ventas.crudo`, `ventas.limpio`, `ventas.entrega`. El menú ⋮ de esquemas (5.15) crea subesquemas | S | **6.0** |
| **O4** | **«Actualizar el formato de la base»** | Un botón en el explorador para una base vieja: la copia al formato 2.0 (`COPY FROM DATABASE`), enseña el tamaño antes y después (`DICT_FSST`, borrados compactos) y deja la original como respaldo | S | **6.0** |
| **O5** | **VARIANT para JSON** | Importar un JSON o una API como VARIANT sin definir columnas; la tabla de resultados lo muestra como árbol plegable; el perfil dice qué claves hay y en qué porcentaje de filas (`variant_keys`); en Data Flow, el nodo Flatten usa VARIANT | M | **6.0** (lectura y tabla); el nodo, 6.x |
| **O6** | **El asistente cuida el costo** | Como el modo agente de la CLI: antes de correr una consulta del asistente, `EXPLAIN` estima filas; si pasa de un umbral, pregunta. Los resultados que ve el modelo, en tabla markdown compacta con aviso de truncado | S | **6.0** |
| **O7** | **La base del cliente, donde está** | Una **fuente con nombre** de tipo `base` (PostgreSQL o MySQL) con su credencial del llavero: se consulta como `fuentes."erp"` y el optimizador manda el filtro al servidor del cliente. Muchos clientes tienen su ERP en una de las dos | L | 6.1 (encaja en `fuentes.js`, pero es una familia nueva) |
| O8 | Triggers | Bitácora de cambios en tablas que se editan a mano (quién cambió qué meta y cuándo) | M | 6.x |
| O9 | Servidor `quack` | Compartir la base de un proyecto en la red de la oficina, en sólo lectura | L | 6.x (seguridad: sólo con proxy TLS) |
| O10 | Delta e Iceberg con escritura | Publicar (C6) a un lago Delta además de Parquet | M | 6.x |

Gratis con sólo cambiar el motor: E/S asíncrona en fuentes de carpeta y buckets, agregaciones que se vuelcan a disco, el optimizador, zonas horarias 2× más rápidas, tablas anchas que abren antes. Se miden en la fase 0 con el proyecto de ejemplo para poder decirlas con números.

## 5. Las fases

### Fase 0 · El motor nuevo, a la sombra (Dec-62, Dec-63)
Rama con `@duckdb/node-api@2.0.0-r.N`, `pnpm install` + `postinstall` (rebuild para Electron 33) y arranque de la app. **Todas las suites** (63) y los recorridos reales de la 5.10 a la 5.15 con el motor nuevo; cada fallo en una tabla con su causa. Medición antes/después con el proyecto de ejemplo: leer la carpeta de 22 CSV, el cierre de Data Flow, Refresh all del Canvas, abrir `tienda.duckdb`, tamaño de la base. Guardar salidas reales de `EXPLAIN (ANALYZE, FORMAT json)` de 2.0 como fixtures.

### Fase 1 · Que nada se rompa (Dec-64 a Dec-68)
- Plan de ejecución con el adaptador nuevo (Dec-65) y sin `profiling_mode`; la herramienta del asistente que lee el plan, igual.
- SQL generado limpio y la guarda `probarSqlGenerado.mjs` (Dec-66).
- Esquemas anidados en `/api/db/schemas`, el ER y el completado (O3, la parte que rompe).
- Documentación del asistente regenerada y prompt al día; el editor ofrece reescribir `x -> …` (Dec-67).
- dbt: versiones nuevas y Python 3.11 (Dec-68); recorrido real con un proyecto dbt nuevo.
- DuckLake: un lago creado en la 5.x abre en la 6.0 (o se explica cómo migrarlo a DuckLake 1.1).
- Salida: todo lo que funcionaba en la 5.15 funciona igual → **6.0.0-alpha.1**.

### Fase 2 · Parámetros de verdad (O1)
Variables del editor, parámetros del cuaderno y del Canvas y parámetros de Data Flow sobre `SET VARIABLE` + `$x`. Los archivos de la 5.x abren sin cambios (`${x}` y `{{x}}` se traducen al ejecutar). Pruebas: un texto con comillas, una fecha, un número, una lista; ningún valor puede cambiar la consulta. → **alpha.2**.

### Fase 3 · Lo nuevo que se ve (O2, O3, O4, O5, O6)
El plan con E/S y poda; el menú de subesquemas; «Actualizar el formato de la base»; VARIANT en importar, la tabla y el perfil; el asistente que estima el costo. → **beta.1**.

### Fase 4 · Cerrar → **6.0.0**
Docs ES/EN (qué cambió para el usuario, la sintaxis nueva de lambdas, los parámetros), el proyecto de ejemplo rehecho con 2.0 y sus capturas, CHANGELOG, recorrido real con la app instalada. Publicar cuando exista el **2.0.1** de Node o, si tarda, con la 2.0.0 tras una beta probada.

## 6. Riesgos

| Riesgo | Cómo se cubre |
|---|---|
| El binario de 2.0 no carga en Electron 33 | Fase 0 lo prueba primero; si falla, subir Electron es una fase aparte |
| `dbt-duckdb` falla con duckdb 2.0 | El recorrido de dbt de la 5.12 en la fase 1; si falla, el entorno propio se queda en 1.5.6 hasta que haya versión y AmoxSQL abre las bases de dbt en sólo lectura con `STORAGE_VERSION` |
| Algo del parser PEG que antes parseaba ya no | Las suites y los ejemplos lo encuentran; `legacy_parser` existe como salida de emergencia, pero no se activa de serie |
| VARIANT en el cliente de Node (#524) | Sólo se leen; nada en AmoxSQL los crea desde JS |
| 2.0.0 es la primera de la serie | Se desarrolla ya; se publica con el 2.0.1 o tras una beta |

## 7. Decisiones del autor

1. ¿Bases nuevas directamente en formato 2.0 (Dec-63)? El plan dice **sí**, porque no hay usuarios fijos.
2. ¿O7 (PostgreSQL/MySQL como fuente) en la 6.0 o en la 6.1? El plan dice **6.1**, para no mezclar el cambio de motor con una familia nueva.
3. ¿Publicar la 6.0.0 con el motor 2.0.0, o esperar al 2.0.1 de noviembre? El plan dice **esperar al 2.0.1** si sale antes de terminar la fase 4.

## 8. Fuentes

- [Announcing DuckDB 2.0.0 LTS «Cinnamon Teal»](https://duckdb.org/2026/10/21/announcing-duckdb-200)
- [Migrating to DuckDB 2.0](https://duckdb.org/docs/2.0/operations_manual/migration)
- [A Preview of DuckDB v2.0](https://duckdb.org/2026/08/17/duckdb-20-highlights)
- [Releases de duckdb-node-neo](https://github.com/duckdb/duckdb-node-neo/releases) (2.0.0-r.1; issues #524 y #525)
- [dbt-duckdb en PyPI](https://pypi.org/project/dbt-duckdb/) (1.11.0, `duckdb>=1.0.0`)

## 9. Bitácora

| Fecha | Fase | Qué |
|---|---|---|
| 2026-10-25 | — | Plan escrito. POC del cliente 2.0 contra `tienda.duckdb`: 13/13 funciones de AmoxSQL iguales; compatibilidad de archivos medida en procesos separados; encontrados el cambio del JSON del perfil, `profiling_mode` que deja el perfilado encendido, `SELECT NULL` en Data Flow y los esquemas anidados. Decisiones Dec-62 a Dec-68; tres preguntas para el autor (§7) |
