# DBT Studio

**🌐 [English](../../en/dbt/dbt-studio.md) · Español**

> El panel de AmoxSQL para proyectos dbt sobre DuckDB: prepara el entorno de dbt, elige el *target*, crea el proyecto con ejemplos, corre comandos con su resumen, los programa y enseña el linaje con lo que pasó en cada modelo.

<img src="../../../images/08_dbt_studio.png" alt="DBT Studio en AmoxSQL" width="100%" />

## Qué es

**DBT Studio** es el panel de AmoxSQL para trabajar con un proyecto dbt que corre sobre DuckDB. Tiene seis secciones: **Setup**, **Config**, **Models**, **Sources**, **Lineage** y **Commands**. Los archivos del proyecto (`dbt_project.yml`, `profiles.yml`, los modelos `.sql` y sus YAML) viven en tu carpeta como siempre.

Desde la 5.12, dbt deja de ser un panel aparte. Un modelo abierto en el editor tiene su barra para compilarlo, verlo y correrlo ([Modelos en el editor](models-in-the-editor.md)). El linaje dice qué pasó en cada nodo ([Linaje](lineage.md)). Las fuentes de AmoxSQL se usan en dbt sin copiar rutas ([Fuentes de AmoxSQL en dbt](amoxsql-sources-in-dbt.md)).

## Cuándo usarlo

- Cuando transformas datos en DuckDB **con dbt** y quieres hacerlo sin salir de AmoxSQL.
- Para **empezar un proyecto dbt** que funcione a la primera: el entorno, el proyecto con un ejemplo por capa y su base.
- Para **correr y programar** `dbt build` y ver, en una línea, cómo fue.

Si sólo quieres consultar DuckDB, usa el [Editor SQL](../editor/sql-editor.md).

## Cómo usarlo

### 1. El entorno de dbt (Setup)

dbt es un programa de Python. En **Environment** eliges con cuál corre este proyecto:

- **El de AmoxSQL.** **Set up dbt…** lo crea por ti: busca un Python 3.10 a 3.13 en la computadora, crea un entorno propio dentro de la carpeta de AmoxSQL e instala dbt con **la misma versión del motor que usa AmoxSQL** (DuckDB 1.5.6). Tarda un minuto o dos y enseña el progreso. Es la opción recomendada: dbt y AmoxSQL leen y escriben la misma base sin sorpresas de formato.
- **Un entorno de Python que ya tengas** (una carpeta con dbt instalado), **un entorno de Conda**, o **dbt en el PATH del sistema**.

La elección se guarda en el proyecto (`.amoxsql/project.json`), así que viaja con él. Si el paquete de DuckDB de ese entorno no es la versión del motor de AmoxSQL, el panel **Output** lo dice antes de correr.

### 2. El proyecto

Si la carpeta no tiene un proyecto dbt, escribe un nombre y pulsa **Initialize Project**. AmoxSQL crea un proyecto que **corre a la primera**:

- una semilla de ejemplo (`seeds/example_orders.csv`);
- un modelo por capa, encadenados con `ref()`: `stg_orders` → `int_orders_daily` → `fct_revenue_monthly`;
- tests en los YAML, `persist_docs` (las descripciones llegan a la base y al explorador) y `store_failures` (las filas que rompen un test se pueden ver);
- un único *target*, `prod`, marcado como producción.

El proyecto se detecta solo al abrir el panel.

### 3. El target (la barra bajo la cabecera)

La barra **Target** dice en qué base escriben los comandos. Un *target* de producción sale en rojo con **PRODUCTION**.

- Con un solo *target*, los comandos escriben en producción sin preguntar: es tu proyecto y no hay otro sitio.
- **Create a dev target** añade `dev`, una copia del activo con su propia base (`tienda.duckdb` → `tienda_dev.duckdb`), para probar antes de tocar producción. Sólo si tú lo creas.
- Si el proyecto no dice cuál es producción, la barra lo pregunta (**Which target is production?**) y propone `prod`.
- **Con otro *target* al lado**, un comando que escribe en producción (`run`, `build`, `seed`, `snapshot`, `--full-refresh`) pide que **escribas su nombre** antes de correr.

El *target* activo se guarda en el proyecto y se añade a cada comando como `--target`, salvo que el comando diga otro.

### 4. Comandos (Commands)

1. Usa las **acciones rápidas** (Run All, Compile, Test, Debug, Docs) o el **constructor**: la acción (`run`, `build`, `compile`, `test`, `seed`, `snapshot`, `source freshness`, `docs generate`, `debug`, `deps`, `clean`, `parse`), `--select`, `--exclude` y `--full-refresh`.
2. Pulsa **Execute**. La salida llega en vivo a **Output**; los avisos de AmoxSQL salen en otro color.
3. Al terminar, **una línea dice cómo fue**: «dbt build · 3 models, 3 tests (1 warning), 1 seed · 9 s», o qué modelo o test falló y por qué. **Details** abre la ficha de la ejecución, con cada modelo y test como un paso.
4. **Stop** corta dbt y todo lo que lanzó. La base queda libre.

dbt corre **sin consola de por medio y sin tope de tiempo**: el comando se analiza como argumentos, y no se aceptan `&&`, `|`, `;`, redirecciones ni `$(`. Cada ejecución queda en el historial de AmoxSQL como cualquier proceso.

**Un test en *warn*:** dbt termina «bien» (código 0) aunque un test avise. AmoxSQL lo distingue: el resumen dice «Finished with 1 warning» y un aviso «sólo si falla» también salta.

**Sin bloqueos.** dbt escribe en la base `.duckdb` desde su propio proceso. Si va a abrir una base que AmoxSQL tiene adjunta (la principal, o la que adjuntó una vista previa), AmoxSQL la suelta y la vuelve a adjuntar al terminar, también si falla o lo cortas. Tus vistas de cuaderno, fuentes y extensiones siguen ahí. Mientras tanto, una consulta a esa base dice por qué espera.

### 5. Programar un comando

El botón de calendario junto a **Execute** abre **Schedule…** con el comando: cada noche, cada hora, el primer día hábil o al llegar un archivo, igual que un proceso de Data Flow. Debajo se listan las programaciones de dbt del proyecto. Ver [Programar procesos](../data-flow/scheduling.md#programar-dbt).

### 6. Plantillas (Models y Sources)

- **Models**: plantillas de staging, intermediate, mart, incremental, *snapshot* (en YAML, por fecha o comparando columnas) o básica. El diálogo explica en dos líneas qué es un incremental y qué es un *snapshot*.
- **Sources**: crear el YAML de una fuente de dbt, y **AmoxSQL sources in dbt** para usar las [fuentes con nombre](../data/sources.md) de AmoxSQL desde dbt ([ver](amoxsql-sources-in-dbt.md)).

## Referencia de secciones

| Sección | Qué hace |
|---|---|
| **Setup** | El entorno de dbt del proyecto (**Set up dbt…**), detectar o crear el proyecto |
| **Config** | Edita `profiles.yml` y resume `dbt_project.yml` |
| **Models** | Plantillas de modelos y de *snapshot* |
| **Sources** | YAML de fuentes de dbt y fuentes de AmoxSQL en dbt |
| **Lineage** | El grafo con el último resultado de cada nodo ([Linaje](lineage.md)) |
| **Commands** | Acciones rápidas, constructor, salida en vivo, resumen, Stop y programar |

## Tips y gemas

- **Desde la línea de comandos:** `AmoxSQL.exe dbt build --select +fct_ventas --project C:\mi-proyecto` corre dbt con el entorno y el *target* del proyecto, sin ventana. Ver [Línea de comandos](../data-flow/command-line.md#dbt).
- **La base de dbt en el explorador:** las vistas que crea dbt se leen al abrir su base en AmoxSQL; AmoxSQL la adjunta con el nombre que dbt usa (el del archivo) cuando sus vistas lo necesitan.
- **Descripciones:** con `persist_docs`, la descripción de cada modelo y columna aparece en el [explorador de base](../data/database-explorer.md#descripciones) y el asistente la lee.

## Atajos y formatos relacionados

| Formato / archivo | Detalle |
|---|---|
| `profiles.yml` | Los *targets*: cada uno con su base de DuckDB |
| `.amoxsql/project.json → dbt` | El entorno, el *target* activo y cuál es producción |
| `target/run_results.json`, `manifest.json` | Lo que lee AmoxSQL para el resumen y el linaje |
| `target/amox_ultimos.json` | El último estado de cada nodo, acumulado entre comandos |

## Relacionado

- [Modelos en el editor](models-in-the-editor.md) · [Linaje](lineage.md) · [Fuentes de AmoxSQL en dbt](amoxsql-sources-in-dbt.md)
- [Lagos (DuckLake)](../data/lakes.md) · [Programar procesos](../data-flow/scheduling.md) · [Línea de comandos](../data-flow/command-line.md)
