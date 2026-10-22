# Modelos de dbt en el editor

**🌐 [English](../../en/dbt/models-in-the-editor.md) · Español**

> Un modelo de dbt abierto en AmoxSQL se compila, se ve y se corre desde su propia barra. El editor completa `ref()`, `source()`, macros y columnas, avisa de lo que no existe y lleva a la definición con Ctrl+clic.

## Qué es

Cuando abres un `.sql` dentro de las carpetas de modelos, semillas, *snapshots*, tests o macros de un proyecto dbt, AmoxSQL sabe que es de dbt. Encima del editor aparece **la barra del modelo**, y el completado entiende Jinja y el proyecto.

## Cuándo usarlo

- Para **ver qué devuelve un modelo** sin construirlo.
- Para **leer el SQL que genera dbt** (el compilado).
- Para correr **este modelo**, lo que necesita o lo que depende de él, sin escribir el `--select`.
- Para escribir modelos con el completado de dbt, no sólo el de SQL.

## Cómo usarlo

### La barra del modelo

| Botón | Qué hace |
|---|---|
| **Compiled** | Enseña debajo, sólo para leer, el SQL que genera dbt para este modelo |
| **Preview** | Corre el compilado **aquí**, en el motor de AmoxSQL, y enseña las filas en la tabla de siempre. No construye nada |
| **Run** | `dbt run --select <modelo>` |
| **+Upstream** | Este modelo y todo lo que necesita, semillas incluidas: `dbt build --select +<modelo>` |
| **+Downstream** | Este modelo y lo que depende de él: `dbt run --select <modelo>+` |
| **Test** | `dbt test --select <modelo>` |

Al terminar, la barra dice en una línea cómo fue, con **Details** (la ficha de la ejecución) y **Stop** mientras corre. Si el comando escribe en producción y hay otro *target*, pide escribir su nombre ([ver](dbt-studio.md#3-el-target-la-barra-bajo-la-cabecera)).

**La vista previa es rápida.** dbt sólo compila si el archivo cambió desde la última vez; si no, la vista previa tarda lo que tarda la consulta. Si el modelo lee algo que todavía no está construido, lo dice («stg_orders reads example_orders, which is not built in «prod» yet. Build it first: «+Upstream»») en vez del error del motor.

Si la base del *target* es la que tienes abierta, la vista previa la usa. Si es otra, AmoxSQL la adjunta sólo para leer; dbt la puede seguir escribiendo.

### Ir a la definición

**Ctrl+clic** en `ref('stg_orders')` abre su modelo (o su semilla, o su *snapshot*), y en `source('ventas', 'pedidos')`, el YAML de la fuente. Vale también para un modelo nuevo que dbt aún no ha visto.

### El completado de dbt

Sale del manifiesto, de los YAML y de la base, **sin lanzar dbt**:

- **`ref('`** propone modelos, semillas y *snapshots*; **`source('`**, las fuentes y luego sus tablas.
- **Macros** del proyecto y de sus paquetes, con su firma y sus argumentos documentados. **`config(`** propone sus claves y sus valores (`materialized='incremental'`…).
- **`{{ `** y **`{% `**, **`var('`**, **`target.`** y **`this.`**.
- **Columnas reales** tras `alias.` de un `ref()` o un `source()` (también si se leen en una CTE), y las de todo lo que el modelo lee, con su tipo. Salen de lo construido.
- **Avisos**: un `ref` o un `source` que no existe se subraya, con «Did you mean …?».
- **Al pasar el ratón**: un modelo enseña sus columnas; una macro, su firma.
- **En `schema.yml`**: las claves según la sangría; `- name:` propone los modelos, o las columnas de ese modelo; los tests genéricos, con sus argumentos.

El catálogo se refresca al correr dbt.

### Llevar una consulta a dbt

Una consulta suelta (un `.sql` del proyecto que no es un modelo) tiene en su barra **Promote to dbt model**. En un cuaderno dentro de un proyecto dbt, cada celda tiene un botón **dbt**. Eliges la capa (staging, intermediate o marts) y el nombre, y AmoxSQL crea el modelo:

- cada tabla que es un modelo pasa a `{{ ref('…') }}`;
- cada fuente de AmoxSQL (`fuentes."ventas"`) pasa a `{{ source('amoxsql', 'ventas') }}`, y se añade al YAML;
- las CTE y las funciones de lectura se quedan; lo que no reconoce se marca con un comentario;
- **la consulta original no se toca.**

Ver [Fuentes de AmoxSQL en dbt](amoxsql-sources-in-dbt.md).

## Tips y gemas

- **Un archivo es de dbt por su carpeta**, aunque esté vacío: el completado de dbt está desde la primera letra.
- **Compiled + Preview** es la forma de depurar un modelo: lees lo que dbt generó y ves qué devuelve, sin escribir en la base.
- **+Upstream en una base nueva:** usa `build`, así que carga las semillas; con `run` fallaría.

## Relacionado

- [DBT Studio](dbt-studio.md) · [Linaje](lineage.md) · [Fuentes de AmoxSQL en dbt](amoxsql-sources-in-dbt.md)
- [Autocompletado](../editor/autocomplete.md) · [Editor SQL](../editor/sql-editor.md)
