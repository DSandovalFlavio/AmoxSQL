# Linaje de dbt

**🌐 [English](../../en/dbt/lineage.md) · Español**

> El grafo del proyecto dbt con lo que pasó en cada modelo la última vez: si construyó, cuánto tardó, cuántas filas tiene y qué tests fallan. Desde un nodo, ver las filas que rompen un test o correr desde ahí.

## Qué es

La sección **Lineage** de [DBT Studio](dbt-studio.md) dibuja el proyecto desde su `manifest.json`: fuentes, semillas, modelos y *snapshots*, coloreados por tipo. Desde la 5.12, cada nodo lleva además **su último resultado**. **Open in tab** lo abre a pantalla completa.

## Cuándo usarlo

- Para saber **qué falló y dónde** tras un `dbt build`.
- Para ver **qué es lento** y cuántas filas deja cada modelo.
- Para **ver las filas** que rompen un test, o reconstruir desde un modelo.

## Cómo usarlo

### Lo que dice cada nodo

- **Un punto de color**: terminó, falló, se saltó o no se ha corrido.
- **Tiempo · filas**: cuánto tardó y cuántas filas tiene. Las filas las cuenta AmoxSQL (dbt no las da) en tablas, incrementales, semillas y *snapshots*; una vista no se cuenta, porque contarla es correrla.
- **Sus tests**: «3 tests», «1 failing», «2 warnings».
- **SLOW**: los tres más lentos, si pasan de un segundo.

El linaje recuerda el último estado de **cada** nodo: un `dbt run --select x` actualiza `x` y no borra lo que se sabía de los demás.

### El panel de un nodo

Un clic abre su panel (doble clic abre su archivo):

- El resultado, cuándo y el error si lo hubo.
- La lista de sus tests. **See rows** abre una consulta nueva con las filas que rompen ese test y la corre. Necesita `store_failures` (los proyectos que crea AmoxSQL lo traen); si no está, el panel dice cómo activarlo.
- **Open**: el archivo del modelo.
- **Run from here**: `dbt build --select <modelo>+`.
- **Build up to here**: `dbt build --select +<modelo>`.

Estos botones piden el nombre del *target* si escriben en producción y hay otro, y dicen al terminar cómo fue.

## Tips y gemas

- **Sin manifiesto no hay grafo:** si ves «No manifest found», corre `dbt compile` o `dbt build` primero.
- **El linaje se refresca solo** al terminar cualquier comando de dbt, se lance desde donde se lance.

## Relacionado

- [DBT Studio](dbt-studio.md) · [Modelos en el editor](models-in-the-editor.md)
