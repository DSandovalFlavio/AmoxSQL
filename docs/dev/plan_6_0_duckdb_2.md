# Plan de la 6.0 · El motor nuevo

> AmoxSQL pasa de DuckDB 1.5.6 a **DuckDB 2.0.0 LTS** (soportado hasta octubre de 2027),
> se arregla lo que el motor nuevo rompe y se aprovecha lo que trae. Plan escrito el
> 2026-10-25 leyendo `main` en `a7b5533` (5.15.1), con un POC del cliente de Node 2.0
> contra la base real del proyecto de ejemplo (`scratchpad/poc-duckdb2`, fuera del repo).
>
> **Actualizado el 2026-11-09** sobre `main` en `a0249b4` (5.19.0): el autor aprobó las
> decisiones de §7, se añadió lo que trajeron la 5.16–5.19 (§2, «Lo que hay que volver a
> mirar»), la llegada de dbt 2.0 con DuckDB dentro (§1, Dec-68 revisada, Dec-97) y la
> fecha del 2.0.1. Rama de trabajo: `claude/v6-duckdb-2`.

## 1. Qué es DuckDB 2.0

Publicado el **2026-10-21** («Cinnamon Teal»), casi 20 000 commits desde 1.5. Es una
versión de funcionalidades, no de estabilidad, y la primera de soporte largo de la serie 2.
El cliente de Node, `@duckdb/node-api@2.0.0-r.1`, salió el mismo día y ya es `latest`
(binarios para Windows x64/arm64, macOS arm64/x64 y Linux). El primer parche, **2.0.1**,
está en el calendario oficial para el **2026-11-18** (congelación de cambios el 11); al
2026-11-09 el cliente de Node sigue en `2.0.0-r.1`.

**dbt 2.0 (2026-09-14) trae DuckDB dentro.** Es un ejecutable compilado (instalable con
pip, winget, brew o un script) con un controlador de DuckDB propio: no necesita Python.
Límites a 2026-11: el controlador incluido **no carga extensiones** (`httpfs`, `parquet`,
`spatial`…; uno instalado aparte sí); DuckLake e Iceberg se declaran en `catalogs.yml`
con la opción `use_catalogs_v2`; parte de lo que hacía `dbt-duckdb` 1.x aún no está
(dbt-labs/dbt#14393), y no se publica qué versión de DuckDB lleva dentro. Las versiones
de Python (`dbt-core` 1.x) siguen disponibles.

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

### Lo que hay que volver a mirar (5.16 a 5.19, revisado el 2026-11-09)

Lo de arriba se encontró sobre la 5.15.1. Desde entonces se escribió SQL nuevo que el
POC no vio. Sigue igual en el código: `(SELECT NULL)` en `ChainExecutor.js:728, 751, 792,
796` y `PRAGMA profiling_mode` en `server/index.js:1018–1067`. No hay lambdas `->` ni
credenciales de S3 en URLs generadas por AmoxSQL. Hay que pasar por el motor nuevo:

| Qué | Dónde | Por qué mirarlo |
|---|---|---|
| Totales de un gráfico en DuckDB | `DataVisualizer/vega/agregar.js` (5.18) | Agregaciones generadas desde la configuración |
| Tope de filas y lectura por lotes | `server/_sqlUtils.js` (`applyRowLimit`), `DatabaseManager._leerPorLotes` (5.19) | Envuelve cualquier sentencia del usuario; el parser PEG puede leer distinto |
| Medidas como macros | `server/medidas.js` (5.13) | `TEMP MACRO` por carril |
| Contrato de una fuente | `server/contrato.js` (5.13) | Conversión desde `all_varchar` y una consulta de reglas |
| Herramientas del Assistant | `server/ai/tools.js`, `ai/estructurados.js` (5.19) | Leen `information_schema` y el plan |
| Lagos | `server/lago.js` (5.12) | `__ducklake_metadata_*` con DuckLake 1.1 |
| `information_schema` | `ai/tools.js`, `ChainExecutor`, `DatabaseManager`, `hermanos.js`, `index.js` | Esquemas anidados |
| El entorno de dbt | `server/dbt/entorno.js:22, 106`, `dbt/correr.js:99` | `duckdb == versión del motor` y Python |

## 3. Las decisiones que fija este plan

**Dec-62 · El motor.** `@duckdb/node-api` fijado **exacto** a `2.0.0-r.N` (como hoy `1.5.6-r.1`). `motor.js` sigue siendo el único sitio que crea instancias.

**Dec-63 · El formato de las bases.** No hay usuarios fijos (el autor, 2026-10-25), así que **las bases nuevas se crean en el formato 2.0** y no se escribe en el viejo. Las existentes siguen abriendo y no se tocan. `DatabaseManager` ya avisa con palabras cuando una base es de un motor más nuevo; ese aviso se queda para quien abra con una 5.x una base de la 6.0.

**Dec-64 · La base central.** `~/.amoxsql/amoxsql.duckdb` se queda en su formato al abrirla con 2.0 (no hace falta migrarla). Si en la 6.x se quiere compactar, se hace con el mismo mecanismo de O4.

**Dec-65 · El perfil del plan.** El plan de ejecución lee el JSON **nuevo** y deja de usar `profiling_mode`: `EXPLAIN (ANALYZE, FORMAT json)` ya trae todo (fases en `planner`, `optimizer`, `physical_planner`; E/S en `io`). Un adaptador puro (`server/planDeEjecucion.js`) convierte ese JSON en el árbol que pinta el cliente, con pruebas sobre salidas reales guardadas.

**Dec-66 · El SQL que genera AmoxSQL** no usa nada que 2.0 rompa: nada de `SELECT NULL` sin tipo, nada de `//`/`%` sin `TRY` en expresiones generadas, lambdas con `lambda`. Una guarda (`scripts/probarSqlGenerado.mjs`) recorre todos los generadores (Data Flow, Canvas, cuaderno, exportaciones, medidas, fuentes) y los ejecuta contra 2.0.

**Dec-67 · El asistente habla 2.0.** El paquete de documentación offline se regenera desde la documentación 2.0; el prompt dice la sintaxis nueva (lambda, `$variable`, partial match de `~`) y, si el usuario escribe una lambda con flecha, el editor ofrece reescribirla.

**Dec-68 · dbt en la 6.0 (revisada el 2026-11-09).** **Set up dbt…** sigue creando el entorno de Python que ya está integrado (5.12), con `duckdb == 2.0.x`, `dbt-duckdb` 1.11.0 (o la primera que declare 2.0) y **Python 3.11–3.13**. Un entorno elegido por el usuario con duckdb 1.x sigue funcionando para correr dbt, pero AmoxSQL avisa: las bases que cree AmoxSQL ya no las abrirá ese dbt.

**Dec-97 · dbt 2.0, a prueba.** En la fase 0 se prueba el ejecutable de dbt 2.0 con un proyecto real creado por AmoxSQL (seed, modelos por capa, tests, una fuente de AmoxSQL, un lago DuckLake): qué versión de DuckDB escribe, si AmoxSQL abre lo que deja y qué de la integración de la 5.12 deja de funcionar. Con eso se decide si la 6.1 añade el tipo de entorno `dbt2` (sin Python) junto a los que hay. Nada de la 6.0 depende de esa prueba.

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
Rama con `@duckdb/node-api@2.0.0-r.N`, `pnpm install` + `postinstall` (rebuild para Electron 33) y arranque de la app. **Todas las suites** (70 `probar*.mjs` a la 5.19, más la de Electron real aparte) primero con 1.5.6 como referencia y luego con el motor nuevo; cada fallo en una tabla con su causa. Medición antes/después con el proyecto de ejemplo: crear los ejemplos (leer la carpeta de CSV y construir las bases), el cierre de Data Flow, abrir `tienda.duckdb`, tamaño de la base. Guardar salidas reales de `EXPLAIN (ANALYZE, FORMAT json)` de 2.0 como fixtures. La prueba de dbt 2.0 (Dec-97).

En la fase 0 no se arregla nada: se mide y se anota. Los arreglos van a la fase 1.

#### Resultado de la fase 0 (2026-11-09) — hecha

**El motor carga.** `@duckdb/node-api@2.0.0-r.1` se instala con pnpm (está en `minimumReleaseAgeExclude`), el `postinstall` lo prepara para Electron 33.4.11 sin errores y la app arranca: la suite de Electron real (`probarInteraccion.mjs`) pasa **106/106** con el motor nuevo (en esta máquina, con 1.5.6, fallaban 4 comprobaciones de atajos que se tenían por del entorno).

**Las suites:** con 1.5.6, **70/70**; con 2.0.0, **67/70**. Las tres que fallan:

| Suite | Qué falla | Causa | Fase 1 |
|---|---|---|---|
| `probarBaseDeMotorNuevo` | «no la abre» y «lo dice en palabras» | La prueba abre una base creada por DuckDB 2 y espera que el motor 1.5 la rechace; con 2.0 la abre sin más. El caso deja de existir dentro de AmoxSQL | Darle la vuelta: lo que hay que decir ahora es lo contrario (una 5.x, o un dbt con duckdb 1.x, no abre lo que crea la 6.0) |
| `probarCatalogoPorArchivo` | «se adjuntó como «tienda»» (sale `user_db`) | **2.0 guarda las vistas sin el catálogo**: `CREATE VIEW v AS SELECT * FROM "tienda"."main"."t"` queda como `SELECT * FROM main.t`. `_ajustarAlias` no encuentra el nombre y no hace falta: la vista se lee igual (la comprobación de lectura pasa). Las vistas que escribió un motor 1.x conservan el catálogo | Que la prueba distinga una base escrita por 1.x (sigue haciendo falta el alias) de una escrita por 2.0 (ya no); `_ajustarAlias` se queda para las de 1.x |
| `probarFondo` | «un servidor que da 503 varias veces»: termina bien pero `reintentos: 0`, 8 peticiones y 33 s | **El `httpfs` de 2.0 reintenta él mismo los 503** con espera creciente; los reintentos de AmoxSQL (5.13) nunca ven el error | En los pasos de red, `SET http_retries = 0` (o el que diga la regla) para que mande la regla de AmoxSQL y la ficha cuente bien |

Ninguna suite toca el visor del plan de ejecución: el cambio del JSON (§2) **no lo detecta nadie**. La fase 1 añade su prueba con los fixtures de abajo.

**Tiempos** (proyecto de ejemplo, Windows, i3; mediana de 5):

| Medida | 1.5.6 | 2.0.0 | |
|---|---|---|---|
| Crear los ejemplos completos (leer CSV, construir 2 bases, 3 corridas de Data Flow; una sola corrida) | 46.9 s | 35.2 s | −25 % |
| Abrir `tienda.duckdb` y listar tablas (instancia nueva) | 28 ms | 43 ms | +15 ms |
| Leer la carpeta de 22 CSV con `union_by_name` | 389 ms | 502 ms | **+29 %** |
| La misma carpeta sin `union_by_name` | 487 ms | 243 ms | −50 % |
| La misma carpeta con `all_varchar` | 138 ms | 225 ms | **+63 %** |
| Un solo CSV | 57 ms | 42 ms | −26 % |
| Ventana `rank()` por grupo sobre `ventas` | 40 ms | 33 ms | −18 % |
| 1 M conversiones de zona horaria | 358 ms | 218 ms | −39 % |
| Tamaño de `tienda.duckdb` / `marketing.duckdb` | 20.2 / 1.6 MB | 18.1 / 1.3 MB | −10 % / −17 % |

Las tablas del ejemplo son chicas (310 956 filas): las agregaciones no se notan. Lo que sí se nota: **leer una carpeta con `union_by_name` o `all_varchar` es más lento en 2.0**, y las dos cosas las usa AmoxSQL (fuentes de carpeta, Data Flow, el contrato de una fuente lee con `all_varchar`). Va a la fase 1 como medida a vigilar: probarlo con la 2.0.1 y, si sigue, probar sin `union_by_name` cuando todos los archivos tienen las mismas columnas.

**Compatibilidad** (cada motor en su proceso):

| Caso | Resultado |
|---|---|
| Base central de la 5.x abierta y escrita por 2.0, vuelta a abrir con 1.5.6 | Abre (Dec-64 se cumple) |
| Lago DuckLake creado con 1.5.6, abierto por 2.0: leer, versiones, «as it was» | Funciona |
| Ese lago, **sólo leído** por 2.0, vuelto a abrir con 1.5.6 | Abre |
| Ese lago, **escrito** por 2.0, vuelto a abrir con 1.5.6 | **No abre**: el catálogo del lago pasa al formato 69 |

Fase 1: `lago.js` avisa antes de la primera escritura de la 6.0 en un lago de la 5.x (después ya no lo abre una 5.x ni un dbt con duckdb 1.x).

**dbt.**
- **Python (Dec-68):** `dbt-core` 1.12.6 + `dbt-duckdb` 1.11.0 + `duckdb` 2.0.0 con Python 3.13: `dbt build` de un proyecto con seed, modelo de tabla y tests pasa 4/4, el motor dentro dice `v2.0.0` y la base sale en formato 69. **El riesgo de la §6 queda descartado.** Nota: `pip` falla en Windows sin rutas largas si la carpeta del entorno es profunda (`metricflow_semantics` trae rutas muy largas); `<home>/entornos/` es corta, pero **Set up dbt…** debe decirlo en palabras si pasa.
- **dbt 2.0 (Dec-97):** `pip install dbt` da **dbt 2.0.11**; el mismo proyecto corre (`dbt build` 4/4, `manifest.json` v12 y `run_results.json`, que `server/dbt/resultados.js` y `catalogo.js` leen sin cambios). Pero **su DuckDB incluido es la 1.5.4**: no abre una base creada por la 6.0 («version number 69»). Conclusión para la 6.1: dbt 2.0 sólo sirve con AmoxSQL 6 cuando su controlador incluido pase a 2.x, o con un controlador de sistema (dbc). Se vuelve a mirar entonces.

**Fixtures:** `scripts/fixtures/planDeEjecucion/v2.0/` y `v1.5/` (agregación, join con ventana, filtro): `EXPLAIN (ANALYZE, FORMAT json)` y `EXPLAIN (FORMAT json)` de cada motor sobre `tienda.duckdb`, para el adaptador de Dec-65.

**La base real del autor** (`~/.amoxsql/amoxsql.duckdb`) no se tocó: todo corrió con casas temporales.

### Fase 1 · Que nada se rompa (Dec-64 a Dec-68)
- Plan de ejecución con el adaptador nuevo (Dec-65) y sin `profiling_mode`; la herramienta del asistente que lee el plan, igual.
- SQL generado limpio y la guarda `probarSqlGenerado.mjs` (Dec-66).
- Esquemas anidados en `/api/db/schemas`, el ER y el completado (O3, la parte que rompe).
- Documentación del asistente regenerada y prompt al día; el editor ofrece reescribir `x -> …` (Dec-67).
- dbt: versiones nuevas y Python 3.11 (Dec-68); recorrido real con un proyecto dbt nuevo.
- DuckLake: un lago creado en la 5.x abre en la 6.0 (comprobado en la fase 0); avisar antes de la primera escritura, que lo deja sólo para la 6.
- Las tres suites de la fase 0 al día, `http_retries` en los pasos de red, la prueba del visor del plan, y vigilar la lectura de carpetas con `union_by_name` / `all_varchar`.
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
| ~~`dbt-duckdb` falla con duckdb 2.0~~ | Descartado en la fase 0: 1.11.0 con duckdb 2.0.0 hace `dbt build` completo. Queda el recorrido real de la 5.12 en la fase 1 |
| Algo del parser PEG que antes parseaba ya no | Las suites y los ejemplos lo encuentran; `legacy_parser` existe como salida de emergencia, pero no se activa de serie |
| VARIANT en el cliente de Node (#524) | Sólo se leen; nada en AmoxSQL los crea desde JS |
| 2.0.0 es la primera de la serie | Se desarrolla ya; se publica con el 2.0.1 o tras una beta |

## 7. Decisiones del autor

Respondidas el 2026-11-09: el autor aceptó las cuatro recomendaciones.

1. Bases nuevas directamente en formato 2.0 (Dec-63): **sí**.
2. O7 (PostgreSQL/MySQL como fuente): **en la 6.1**.
3. El motor: **se desarrolla con 2.0.0 y se publica con 2.0.1** (2026-11-18).
4. dbt: **en la 6.0, el dbt de Python** con duckdb 2.0 (Dec-68); dbt 2.0 se prueba en la fase 0 y se decide para la 6.1 (Dec-97).

## 8. Fuentes

- [Announcing DuckDB 2.0.0 LTS «Cinnamon Teal»](https://duckdb.org/2026/10/21/announcing-duckdb-200)
- [Migrating to DuckDB 2.0](https://duckdb.org/docs/2.0/operations_manual/migration)
- [A Preview of DuckDB v2.0](https://duckdb.org/2026/08/17/duckdb-20-highlights)
- [Releases de duckdb-node-neo](https://github.com/duckdb/duckdb-node-neo/releases) (2.0.0-r.1; issues #524 y #525)
- [dbt-duckdb en PyPI](https://pypi.org/project/dbt-duckdb/) (1.11.0, `duckdb>=1.0.0`)
- [Release Calendar · DuckDB](https://duckdb.org/release_calendar) (2.0.1 el 2026-11-18)
- [DuckDB Now Ships inside dbt v2](https://duckdb.org/2026/09/22/dbt-fusion)
- [dbt · DuckDB setup (v2)](https://docs.getdbt.com/docs/local/connect-data-platform/duckdb-setup.md)

## 9. Bitácora

| Fecha | Fase | Qué |
|---|---|---|
| 2026-10-25 | — | Plan escrito. POC del cliente 2.0 contra `tienda.duckdb`: 13/13 funciones de AmoxSQL iguales; compatibilidad de archivos medida en procesos separados; encontrados el cambio del JSON del perfil, `profiling_mode` que deja el perfilado encendido, `SELECT NULL` en Data Flow y los esquemas anidados. Decisiones Dec-62 a Dec-68; tres preguntas para el autor (§7) |
| 2026-11-09 | — | Plan al día con la 5.19.0: §7 respondida, lo de la 5.16–5.19 que hay que volver a mirar, dbt 2.0 (Dec-68 revisada, Dec-97), 2.0.1 el 18 de noviembre |
| 2026-11-09 | 0 | Motor 2.0.0-r.1 en la rama: carga en Electron 33, suites 70/70 → 67/70 (tres causas, ninguna de fondo), Electron real 106/106, tiempos antes/después, compatibilidad de la base central y de DuckLake, dbt de Python con duckdb 2.0 (bien) y dbt 2.0.11 (trae DuckDB 1.5.4: no abre bases de la 6.0), fixtures del plan |
