# Plan de implementación — 5.12.0: el ingeniero de datos, dbt y DuckLake

> La familia **I** (I2–I12) de [`candidatos_v6.md`](candidatos_v6.md), en fases. I12 (el
> completado de dbt) se añadió el 2026-10-21 a petición del autor. I1 (dbt
> sin bloqueos) ya llegó con la 5.10.0. Hecho leyendo el código de `main` tras la 5.11.0
> (`bdab975`), no suponiéndolo: cada decisión cita lo que encontró. Fecha: 2026-10-21.

---

## 1. Dónde cae este plan

| Versión | Familia | Estado |
|---|---|---|
| 5.9.0 | A + B · cimientos y workspaces | Publicada el 2026-10-01 (la última publicada) |
| 5.10.0 | C · los datos donde están | Cerrada en `main`, sin publicar |
| 5.11.0 | D · procesos que corren solos | Cerrada en `main`, sin publicar |
| **5.12.0** | **I · el ingeniero de datos: dbt y DuckLake** | **Este plan** |
| 5.13.0 … 5.17.0 | E, F, G, H, J | Después |
| 6.0.0 | K · Python y experimentos | Cierra la 6; **la primera que se publica** desde la 5.9.0 |

**La frontera, decidida con el autor el 2026-10-01:** dbt es para el ingeniero (transformar
datos que viven en bases y lagos, con SQL versionado, tests y documentación); Data Flow es
para el analista (de archivo a archivo, sin escribir SQL). El puente son las fuentes con
nombre (C1), que dbt recibe como `sources` (I7), y publicar un archivo (C6). La familia I
**no reconstruye** dentro de AmoxSQL lo que dbt ya hace: lo integra.

Lo que pide la familia, en una frase: **el ingeniero abre `stg_ventas.sql`, ve su SQL
compilado y una vista previa al instante, corre el modelo y lo que depende de él, ve en el
linaje qué falló y cuánto tardó, programa `dbt build` cada noche con aviso si un test
falla, y su lago DuckLake tiene versiones que se pueden consultar «como estaban ayer».**

## 2. La numeración de este tramo

**El autor decidió (2026-10-21) no publicar nada hasta la 6.0.** Las versiones son etapas
internas de `main`: no hay alfas, betas, *Latest* ni copia a Drive.

| Hito | Qué |
|---|---|
| Cada fase | Su rama y su PR a `main`, con sus `probar*.mjs` en verde |
| Pruebas de la familia | Instalador **local** (`dist/`) con la versión de la etapa, para el autor |
| Cierre | Versión **5.12.0** en los cuatro sitios y su entrada del CHANGELOG «sin publicar» |

### Convivir con la 5.11 mientras dura el camino

| Qué toca la 5.12 | Si luego se abre la 5.11… | Cómo se consigue |
|---|---|---|
| `.amoxsql/project.json → dbt` (entorno y *target* del proyecto, Dec-27) | Lo ignora sin romperse | Clave nueva; los escritores fusionan (`scaffolder.saveProjectConfig`) |
| Una programación de dbt (I10, tipo nuevo en `programaciones`) | La lista la enseña, pero `tick` no sabe correrla | **Migración 5** sólo si hace falta una columna; si basta con el JSON de la regla, no hay migración. Se decide en la fase 7 |
| Los archivos que escribe en el proyecto dbt (`sources` de AmoxSQL, ejemplos de capas, plantillas) | Son archivos de dbt: nada que leer | — |

---

## 3. Lo que el código ya da

| Hallazgo | Dónde | Consecuencia |
|---|---|---|
| **DBT Studio** detecta Python, dbt, Conda y Mamba; crea el proyecto con `models/staging`, `intermediate` y `marts` (vacías, con un `.gitkeep`) y su `profiles.yml` con un *target* `dev`; plantillas de modelo (`basic`, `staging`, `intermediate`, `mart`, **`incremental`**), fuente, test y macro; arma y ejecuta comandos con la salida en vivo | `client/src/components/DbtPanel.jsx` (1083 líneas), `server/index.js` `/api/dbt/*` | I11 es poner **un ejemplo** en cada capa; I9 sólo tiene que añadir el *snapshot* (el incremental ya existe) y explicarlos |
| **dbt se ejecuta como texto de shell**: `exec("dbt run --select …")`, con `conda run -n <env>` delante; la única guarda es que empiece por `dbt ` | `/api/dbt/execute` | Para la interfaz basta; para I10 (programar, línea de comandos) **no**: un `--select` guardado acabaría en un shell. Dec-26 |
| La ejecución tiene **un tope de 5 minutos** (`timeout: 300000`) | `/api/dbt/execute` | Un `dbt build` nocturno de verdad se cortaría. Dec-26 |
| La cancelación usa `req.on('close')`, que salta al leer el cuerpo del POST, no cuando el cliente se va (hallazgo de la 5.11, tarea aparte) | `/api/dbt/execute` | Funciona por el orden de los eventos; el corredor nuevo usa el cierre de la respuesta |
| **El entorno de dbt elegido vive en `localStorage`** (`amox-dbt-env-cache`) | `DbtPanel.jsx` | Una programación o la línea de comandos no lo ven. Dec-27: pasa al `project.json` |
| `/api/dbt/command` arma el comando con `--target` si se da; `profiles.yml` se edita en Config | `server/index.js`, `DbtPanel.jsx` | I4 parte de aquí: falta saber cuál es el activo y cuál es producción |
| El **linaje** se dibuja con los nodos y aristas del `manifest.json`; el autocompletado usa los modelos y fuentes del mismo | `DbtLineageGraph.jsx`, `/api/dbt/manifest`, `SqlEditor.jsx` | I3 pinta encima lo de `run_results.json`, que hoy **no se lee en ningún sitio** |
| No se lee `catalog.json`, ni `compiled_code`, ni se usa `dbt show` | — | I2 e I5 empiezan de cero |
| **El completado de dbt es mínimo**: los nombres de modelo dentro de `ref('…')` y de fuente y tabla dentro de `source('…', '…')` (del manifiesto, en el trabajador del editor), y 8 atajos fijos (`ref`, `source`, `config`, `is_incremental`, `this`, `var`, `env_var`, `macro`) que **sólo salen si el archivo ya tiene `{{` o `{%`**: un modelo nuevo y vacío no los ve. Sin macros, sin opciones de `config()`, sin columnas a través de `ref()`, sin avisos ni información al pasar el ratón, y nada en `schema.yml` | `SqlEditor.jsx` (`dbtItems`), `workers/sqlLanguageWorker.js` (`isJinjaContext`), `/api/dbt/manifest` | I12: el completado de dbt de verdad (Dec-35, fase 3b) |
| **dbt sin bloqueos (I1):** antes de un comando que abre la base de AmoxSQL, la suelta y la recupera al terminar; avisa si dbt usa otra versión del motor | `server/dbtConvivir.js` | Toda ejecución de dbt —también la programada— pasa por aquí |
| Los comentarios de tabla del motor sólo se leen si llevan la marca de procedencia (C5); un comentario normal **no se enseña** | `server/procedencia.js`, `/api/db/schema`, `ai/prompt/schema.js` | I5: dbt puede escribir sus descripciones como comentarios (`persist_docs`) y AmoxSQL sólo tiene que leerlos. Dec-30 |
| **DuckLake:** abrir un `.ducklake` (prefijo `ducklake:` + `DATA_PATH`), el catálogo de metadatos oculto, y una fuente de tipo `lago` con `formato: ducklake` en sólo lectura | `DatabaseManager.js`, `fuentes.js` | I8 añade crear, versiones, «como estaba» y mantenimiento; nada de eso existe hoy |
| La programación (D1) corre **un `.sqlchain`**: `programaciones.proceso` es su ruta y `correrOcurrencia` llama a `ejecutarProceso` | `server/programacion/` | I10 añade un segundo tipo de trabajo: un comando de dbt |
| La línea de comandos entiende `run` y `tick` (y `--home`, desde la 5.11) | `server/ejecucion/ordenes.js` | I10 añade `dbt` |
| Las ejecuciones viven en `ejecuciones` (central) con su resumen (D2) y su ficha | `server/ejecucion/` | Una ejecución de dbt deja su fila igual, con lo que dice `run_results.json` |
| **El entorno conda `dbt-duckdb` del autor está roto** (Python 3.14); un entorno nuevo de hoy instala **DuckDB 2.0** | memoria del proyecto; prueba del 2026-10-21 | Las pruebas usan un entorno temporal con DuckDB 1.5.6. Decisión del autor (§8.1) |

---

## 4. Las decisiones que fija este plan

Siguen la numeración de la 5.9, la 5.10 y la 5.11 (**Dec-1 … Dec-25** siguen vigentes).

**Dec-26 · Un solo corredor de dbt, sin shell.** `server/dbt/correr.js` ejecuta dbt con
una lista de argumentos (`execFile`/`spawn`, nunca un texto de shell): la acción de una
lista cerrada (`run`, `build`, `test`, `compile`, `show`, `seed`, `snapshot`,
`source freshness`, `docs generate`, `deps`, `parse`, `debug`, `clean`), y cada opción
(`--select`, `--exclude`, `--target`, `--vars`, `--full-refresh`, `--limit`) como su propio
argumento. Sin tope de tiempo fijo (la tarea del sistema ya tiene su límite de 6 h); se
cancela al cerrarse la respuesta o con un botón. Pasa siempre por `dbtConvivir` (I1). Lo
usan la interfaz, la programación (I10) y la línea de comandos. `/api/dbt/execute` sigue
aceptando el texto de la interfaz, pero lo **analiza** a esa lista y rechaza lo que no
encaje (`&&`, `|`, redirecciones…).

**Dec-27 · El entorno y el *target* de dbt son del proyecto.** `project.json → dbt:
{ entorno: { tipo: 'conda' | 'python' | 'sistema', nombre?, ruta? }, target? }`. Lo elegido
en DBT Studio se guarda ahí (no en `localStorage`), porque una programación y la línea de
comandos lo necesitan sin interfaz. Es de esta máquina sólo si es una ruta absoluta; un
nombre de entorno conda viaja.

**Dec-28 · La vista previa no lanza dbt.** «Preview» (I2) compila el modelo con
`dbt compile --select <modelo>` sólo si el archivo cambió desde la última compilación (o
lee `compiled_code` del `manifest.json`), y **ejecuta el SQL compilado en el motor de
AmoxSQL**, con el límite de filas de siempre. Así no paga el arranque de dbt (segundos) en
cada vista previa ni necesita soltar la base. Si el modelo usa algo que sólo existe dentro
de dbt (una macro que escribe), se cae a `dbt show --select <modelo> --limit N`. Se
comprueba en la fase 0.

**Dec-29 · Se empieza en producción; dev, sólo si el ingeniero lo crea** (respuesta del
autor, 2026-10-21). Un proyecto dbt que crea AmoxSQL tiene **un solo *target*, `prod`**,
marcado como producción en el `project.json` (`dbt.produccion: ['prod']`). **Create a dev
target** en DBT Studio añade `dev` (otra base o esquema) cuando el ingeniero lo decide. Un
proyecto que ya existía conserva lo suyo; se ofrece marcar cuál es producción, sin
adivinarlo en silencio. Con un *target* de producción activo, la barra dice
**PRODUCTION** en rojo. **Confirmar escribiendo el nombre del *target*** antes de un comando
que escribe (`run`, `build`, `seed`, `snapshot`, `--full-refresh`) sólo se pide **cuando
existe otro *target*** al que se podría haber querido apuntar: con `prod` como único, cada
`dbt run` pidiendo confirmación sería ruido. Los comandos que leen nunca la piden.

**Dec-30 · Las descripciones llegan como comentarios del motor.** El proyecto dbt que
crea AmoxSQL lleva `+persist_docs: { relation: true, columns: true }`: dbt escribe cada
descripción como `COMMENT ON` en la base. AmoxSQL lee **cualquier** comentario de tabla,
vista o columna que no sea de procedencia, y lo enseña en el explorador y se lo da al
asistente. Para un proyecto que no lo tenga, se lee del `manifest.json` (por
`relation_name`), y el `catalog.json` sólo añade lo que ninguno de los dos da. Se comprueba
en la fase 0 que dbt-duckdb lo escribe en tablas **y** vistas.

**Dec-31 · Las fuentes de AmoxSQL entran en dbt sin rutas.** I7 escribe
`models/sources/amoxsql.yml` (o la ruta que diga el proyecto) con una `source` llamada
`amoxsql` y una tabla por fuente con nombre, cuyo `external_location` es
`{{ env_var('AMOXSQL_FUENTE_<NOMBRE>') }}`: la ruta de cada máquina **no** se escribe en un
archivo que viaja en git (Dec-9). AmoxSQL pone esas variables al lanzar dbt (Dec-26), y
`AmoxSQL.exe dbt …` también; quien lance dbt por su cuenta las ve listadas en DBT Studio.
La frescura (`dbt source freshness`) usa la fecha del archivo si dbt-duckdb la admite; si
no, una columna que AmoxSQL añade a la vista (`_amox_modificado`). Se comprueba en la
fase 0.

**Dec-32 · Promover escribe el modelo; no toca el original.** I6 crea
`models/<capa>/<nombre>.sql` con las tablas sustituidas por `{{ ref('…') }}` (las que son
un modelo según el manifiesto) y `{{ source('amoxsql', '…') }}` (las fuentes con nombre),
y abre el archivo. La consulta o la celda original queda igual. Lo que no se pueda
sustituir se marca con un comentario `-- AmoxSQL: no sé de dónde sale «x»`.

**Dec-33 · Mantener un lago pide confirmación con lo que se va a borrar.** I8: expirar
versiones y limpiar archivos viejos **borran datos de verdad** (no hay papelera). El
diálogo dice cuántas versiones y cuántos archivos (y MB) se van, y desde qué fecha deja de
poderse consultar «como estaba». Compactar archivos no borra versiones: va sin esa
confirmación.

**Dec-34 · Una ejecución de dbt es una ejecución.** Deja su fila en `ejecuciones`
(`tipo: 'dbt'`, el comando, el *target*), y su resumen sale de `run_results.json`: modelos
correctos y fallidos, tests que fallan con su modelo, duración. El aviso de D2 y la ficha
la tratan como a un proceso. «Avisar si falla» incluye **un test que falla** aunque dbt
salga con 0 por `warn`.

**Dec-36 · AmoxSQL crea el entorno de dbt** (respuesta del autor, 2026-10-21). **Set up
dbt…** crea un entorno de Python **de AmoxSQL** en `<home>/entornos/dbt-<versión del
motor>/` con versiones fijas: `duckdb` **igual al motor de AmoxSQL** (hoy 1.5.6) y una
versión fija de `dbt-core` y `dbt-duckdb` probada con él. Necesita un Python instalado de
una versión que dbt admita (se buscan los que haya; uno no admitido, como 3.14, se dice
por su nombre) y red la primera vez. Uno por máquina y por versión del motor, compartido por
todos los proyectos; un proyecto lo elige como cualquier otro entorno (Dec-27). Nunca toca
los entornos que el usuario ya tenga. **El motor no sube a DuckDB 2.0 en este tramo**
(respuesta del autor): todo con el motor actual.

**Dec-35 · El completado de dbt no lanza dbt.** Todo sale de lo que ya está en disco o en
memoria: el `manifest.json` (modelos, fuentes, macros con su firma y su descripción,
columnas documentadas), `dbt_project.yml` (las `vars`), `profiles.yml` (los *targets*), y
el esquema que AmoxSQL ya tiene de la base (las columnas **reales** de un modelo
materializado, por su `relation_name`). Un modelo nuevo que aún no está en el manifiesto
se completa igual, leyendo los nombres de archivo de las carpetas de modelos. Un archivo
es «de dbt» si está dentro de las carpetas de modelos, macros, tests o snapshots del
proyecto, **o** si ya tiene Jinja; en un `.sql` suelto, nada de esto estorba. Va en el
trabajador del editor (como hoy), sin coste en cada tecla.

---

## 5. Las fases

### Fase 0 · Pruebas de concepto (`scripts/poc512/`)

| # | Qué se comprueba |
|---|---|
| 0.1 | `dbt compile --select x`: cuánto tarda; si `compiled_code` queda en el manifiesto; si el SQL compilado corre tal cual en el motor de AmoxSQL con la base adjunta (Dec-28) |
| 0.2 | `run_results.json` de dbt-duckdb: estado, duración y filas por nodo; `store_failures` deja las filas de un test en `dbt_test__audit` |
| 0.3 | `persist_docs` en dbt-duckdb: comentarios en tablas, vistas y columnas (Dec-30) |
| 0.4 | `external_location` con `env_var` en una `source`, y `dbt source freshness` sobre un archivo (Dec-31) |
| 0.5 | DuckLake en el motor 1.5.6: crear con catálogo local, listar versiones, `AT (VERSION => n)` y `AT (TIMESTAMP => …)`, compactar, expirar y limpiar; y con catálogo SQLite, dbt escribiendo mientras AmoxSQL lee |
| 0.6 | dbt por lista de argumentos con `conda run` y con un Python suelto en Windows, sin shell; cancelar; una ejecución de más de 5 minutos |
| 0.7 | El *snapshot* en YAML (dbt ≥ 1.9) frente al bloque `{% snapshot %}`: cuál admite la versión que hay |
| 0.8 | Qué trae el `manifest.json` de las macros (las del proyecto y las de paquetes como `dbt_utils`: `arguments` documentados, `macro_sql` para sacar la firma) y de las columnas; cuánto pesa en un proyecto grande |

### Fase 1 · El corredor de dbt (Dec-26, Dec-27, Dec-34)

| # | Qué |
|---|---|
| 1.1 | `server/dbt/correr.js`: lista de argumentos, entorno del proyecto, `dbtConvivir`, sin tope, cancelación por el cierre de la respuesta |
| 1.2 | `server/dbt/resultados.js`: lee `run_results.json` y `manifest.json` → un resumen (modelos, tests, filas, duración, qué falló) |
| 1.3 | `project.json → dbt` (entorno, *target*); DBT Studio guarda ahí lo elegido |
| 1.3b | **Set up dbt…** (Dec-36): buscar un Python admitido, crear el entorno de AmoxSQL con versiones fijas, con el progreso a la vista; elegirlo en el proyecto |
| 1.4 | `/api/dbt/execute` sobre el corredor (el texto se analiza a argumentos); `ejecuciones` con `tipo: 'dbt'` |
| 1.5 | `scripts/probarDbtCorredor.mjs` (con un dbt falso para el CI y el real en `poc512`) |

### Fase 2 · *Targets*, capas e incrementales (I4, I11, I9)

| # | Qué |
|---|---|
| 2.1 | I4: los *targets* de `profiles.yml` en un selector de la barra de DBT Studio; el proyecto nuevo empieza con `prod` (producción); **Create a dev target**; **PRODUCTION** en rojo y la confirmación cuando hay otro *target* (Dec-29) |
| 2.2 | I11: crear un proyecto trae una semilla de ejemplo y un modelo por capa (`stg_` → `int_` → `fct_`/`dim_`) que corren a la primera, con `persist_docs` |
| 2.3 | I9: plantilla de *snapshot*; el incremental y el *snapshot* con una explicación corta en el diálogo de plantillas |

### Fase 3 · dbt dentro del editor (I2)

| # | Qué |
|---|---|
| 3.1 | Al abrir un modelo, una barra: **Compiled**, **Preview**, **Run**, **Run +downstream**, **Test** |
| 3.2 | **Compiled**: el SQL compilado al lado, de sólo lectura |
| 3.3 | **Preview**: el compilado en el motor de AmoxSQL, en la tabla de resultados de siempre (Dec-28) |
| 3.4 | `ref('…')` y `source('…')` llevan al archivo con Ctrl+clic |

### Fase 3b · El completado de dbt (I12, Dec-35)

| # | Qué |
|---|---|
| 3b.1 | Saber que un archivo es de dbt por su carpeta (no sólo por tener `{{`); los atajos de Jinja en un modelo nuevo y vacío |
| 3b.2 | **Macros**: las del proyecto y las de paquetes (`{{ dbt_utils.` → sus macros), con su firma y su descripción; ayuda de parámetros al escribir `(` |
| 3b.3 | **`config(`**: las opciones (`materialized`, `unique_key`, `incremental_strategy`, `on_schema_change`, `schema`, `alias`, `tags`, `persist_docs`, `pre_hook`/`post_hook`, `enabled`…) con sus valores válidos para DuckDB |
| 3b.4 | **Jinja y dbt**: `{% if %}`, `{% for %}`, `{% set %}`, `{% call %}`; `target.` (name, schema, type…), `this.`, `adapter.`, `run_query`, `log`; los nombres de `var('…')` de `dbt_project.yml` |
| 3b.5 | **Columnas a través de `ref()` y `source()`**: tras `FROM {{ ref('stg_ventas') }} v`, `v.` propone sus columnas (las reales si está materializado; si no, las documentadas) |
| 3b.6 | **Avisos**: un `ref` o un `source` que no existe, subrayado con lo más parecido («¿quisiste decir stg_ventas?») |
| 3b.7 | **Al pasar el ratón**: un `ref` enseña la descripción, la materialización y las columnas del modelo; una macro, su firma y su descripción |
| 3b.8 | **`schema.yml` y `sources.yml`**: `models:`, `columns:`, `tests:`/`data_tests:` con los genéricos (`unique`, `not_null`, `accepted_values`, `relationships`), y los nombres de modelos y columnas que hay |
| 3b.9 | `scripts/probarCompletadoDbt.mjs`: el completado sobre un manifiesto de ejemplo, sin dbt |

### Fase 4 · Resultados en el linaje (I3)

| # | Qué |
|---|---|
| 4.1 | Cada nodo, verde o rojo según la última ejecución, con duración y filas; los más lentos, marcados |
| 4.2 | Un test que falla lleva a sus filas (`store_failures`), en una pestaña de resultados |
| 4.3 | «Run from here» desde un nodo |

### Fase 5 · Catálogo y documentación (I5)

| # | Qué |
|---|---|
| 5.1 | El explorador enseña la descripción de tablas, vistas y columnas (los comentarios del motor, Dec-30) |
| 5.2 | El asistente las recibe con el esquema |
| 5.3 | Sin `persist_docs`, del `manifest.json`; «Generate docs» corre `dbt docs generate` |

### Fase 6 · El puente: fuentes de AmoxSQL y promover a modelo (I7, I6)

| # | Qué |
|---|---|
| 6.1 | I7: «Use in dbt» en una fuente → `models/sources/amoxsql.yml` con `env_var` (Dec-31); el corredor pone las variables |
| 6.2 | I7: frescura de la fuente (`dbt source freshness`), con el aviso de la fuente de C6 |
| 6.3 | I6: «Promote to dbt model» en el editor y en una celda de cuaderno (Dec-32) |

### Fase 7 · Programar dbt (I10)

| # | Qué |
|---|---|
| 7.1 | Una programación puede ser un comando de dbt (acción, selección, *target*); el diálogo Schedule… desde DBT Studio |
| 7.2 | `tick` y el reloj la corren con el corredor; aviso si falla un modelo **o un test** (Dec-34) |
| 7.3 | `AmoxSQL.exe dbt <acción> --project <carpeta> [--select …] [--target …]`, con los códigos de salida de la línea de comandos |
| 7.4 | Operations y la ficha de la ejecución la enseñan como una más |

### Fase 8 · DuckLake de primera clase (I8)

| # | Qué |
|---|---|
| 8.1 | **New lake…**: catálogo local (DuckDB o SQLite) y carpeta de datos; se abre como cualquier base |
| 8.2 | Sus versiones: lista con fecha, qué cambió y quién (si lo dice), en el explorador |
| 8.3 | «Query as of…»: una versión o una fecha → `AT (VERSION => n)` / `AT (TIMESTAMP => …)` en el editor |
| 8.4 | Mantenimiento: compactar, expirar versiones y limpiar archivos, con la confirmación de Dec-33 |

### Fase 9 · Cerrar → **5.12.0** (sin publicar)

| # | Qué |
|---|---|
| 9.1 | Pruebas reales (`scripts/poc512/`): un proyecto dbt real de punta a punta, un `dbt build` programado con la aplicación cerrada, un lago con versiones |
| 9.2 | Todas las `probar*.mjs` y el instalador local para el autor |
| 9.3 | Documentación de usuario ES/EN (DBT Studio, linaje, lagos); `CLAUDE.md` |
| 9.4 | Versión 5.12.0 en los cuatro sitios y su CHANGELOG «sin publicar» |
| 9.5 | I marcada como hecha en `candidatos_v6.md`; lo siguiente, el plan de la 5.13.0 (E) |

---

## 6. Las pantallas

| Pantalla | Dónde | Fase |
|---|---|---|
| Selector de *target* y aviso **PRODUCTION** | Barra de DBT Studio; confirmación al escribir | 2 |
| Plantillas con explicación (incremental, *snapshot*) | Diálogo de plantillas de DBT Studio | 2 |
| Barra de modelo (Compiled · Preview · Run · Run +downstream · Test) | Encima del editor, sólo en un modelo de dbt | 3 |
| Completado, avisos y ayuda al pasar el ratón | El editor, en un modelo de dbt y en `schema.yml` | 3b |
| Linaje con resultados | `DbtLineageGraph` | 4 |
| Descripciones | Explorador de base (tablas y columnas) | 5 |
| «Use in dbt» y «Promote to dbt model» | Menú de una fuente; menú del editor y de una celda | 6 |
| Schedule… para dbt | DBT Studio | 7 |
| New lake…, versiones, «Query as of…», mantenimiento | Bienvenida/explorador; explorador de base | 8 |

La bienvenida no cambia (decisión del autor): «New lake…» va en el explorador y en el
menú, no en la bienvenida.

## 7. Riesgos, y qué los cubre

| Riesgo | Qué lo cubre |
|---|---|
| El entorno de dbt del usuario trae otro motor (DuckDB 2.0 desde el 2026-10-21) | Dec-36: el entorno de AmoxSQL fija el mismo motor; para los demás, el aviso de versión de I1 |
| Arrancar dbt tarda segundos y la vista previa se haría lenta | Dec-28: la vista previa corre en el motor de AmoxSQL |
| Un comando guardado (programación, línea de comandos) acaba en un shell | Dec-26: lista de argumentos, sin shell |
| Expirar versiones de un lago borra datos sin vuelta atrás | Dec-33 |
| Rutas de una máquina en un archivo que viaja en git | Dec-31: `env_var` |
| dbt-duckdb no admite algo de lo que se supone (persist_docs en vistas, frescura sobre archivos, AT TIMESTAMP en 1.5.6) | Fase 0 antes de cada fase que lo usa; si falla, la decisión se reescribe en la bitácora |

## 8. Decisiones del autor (respondidas el 2026-10-21)

1. **El entorno de dbt: AmoxSQL lo crea** → Dec-36.
2. **DuckDB 2.0: no en este tramo.** Todo con el motor actual (1.5.6).
3. **Se empieza en producción; dev sólo si el ingeniero lo crea** → Dec-29, reescrita.
4. **El orden de las fases, como está.**
5. **Añadido a su petición: I12, el completado de dbt** → fase 3b, Dec-35.

## 9. Lo que queda fuera de la 5.12.0

- Construir dentro de AmoxSQL lo que dbt ya hace (dependencias, incrementales, tests,
  entornos): se integra, no se rehace.
- Un editor de `schema.yml` con formularios: se edita como texto, con autocompletado.
- Un servicio de dbt en la nube, o adaptadores que no sean DuckDB.
- La frescura y los contratos de una fuente fuera de dbt: son de la familia E (E2).

---

## 10. Bitácora

| Fecha | Fase | Qué |
|---|---|---|
| 2026-10-21 | — | Plan escrito leyendo `main` tras la 5.11.0. Hallazgos que lo moldean: dbt corre como texto de shell con un tope de 5 minutos; el entorno elegido vive en `localStorage`; el incremental ya existe y el *snapshot* no; nadie lee `run_results.json` ni `catalog.json`; AmoxSQL sólo lee comentarios de tabla con marca de procedencia. Decisiones Dec-26 a Dec-34; cuatro preguntas para el autor (§8) |
| 2026-10-21 | — | **Respuestas del autor (§8):** AmoxSQL crea el entorno de dbt (Dec-36); nada de DuckDB 2.0 en este tramo; se empieza en `prod` y dev sólo si se crea (Dec-29 reescrita: la confirmación escrita, sólo cuando hay otro *target*); el orden, como está. Empieza la implementación |
| 2026-10-21 | 3b | **Añadido a petición del autor: I12, el completado de dbt.** Hoy sólo nombres dentro de `ref`/`source` y 8 atajos que exigen que el archivo ya tenga Jinja. Fase 3b (macros con firma, `config()` con sus valores, Jinja y `target`/`this`, columnas a través de `ref()`, avisos de `ref` inexistente, ayuda al pasar el ratón, `schema.yml`) y Dec-35 (sale del manifiesto, de los YAML y del esquema que AmoxSQL ya tiene; nunca lanza dbt); prueba 0.8 en la fase 0 |
