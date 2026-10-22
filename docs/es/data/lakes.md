# Lagos (DuckLake)

**🌐 [English](../../en/data/lakes.md) · Español**

> Un lago guarda cada cambio como una versión: consultas una tabla como estaba ayer, ves qué cambió entre dos versiones y lo mantienes sabiendo antes qué se va a borrar.

## Qué es

Un lago DuckLake es una base de datos que vive en la carpeta del proyecto como **un catálogo** (un archivo) y **una carpeta con los datos** (`<catálogo>.files/`). Cada escritura deja una versión nueva; las anteriores siguen consultables hasta que las expiras.

Hay dos clases:

| Clase | Archivo | Para qué |
|---|---|---|
| **Simple** | `<nombre>.ducklake` | El catálogo es un archivo de DuckDB. Sólo un programa escribe a la vez |
| **Shared with dbt** | `<nombre>.ducklake.sqlite` | El catálogo es SQLite: dbt puede escribir mientras AmoxSQL lo tiene abierto |

## Cuándo usarlo

- Cuando necesitas **saber cómo estaban los datos** antes de una carga («¿qué decía esta tabla el lunes?»).
- Cuando una carga salió mal y quieres **ver exactamente qué cambió**.
- Cuando dbt y AmoxSQL trabajan sobre los mismos datos a la vez.

## Cómo usarlo

### Crear y abrir

1. En el [explorador de base](database-explorer.md), pulsa el botón de lago de la cabecera (**New lake…**).
2. Escribe el nombre y elige **Simple** o **Shared with dbt**.
3. Ábrelo como cualquier base, desde el selector de bases.

La primera vez hay que descargar la extensión del lago, y necesita internet.

### Las versiones

Con un lago abierto, el árbol del explorador tiene **Lake versions**: cada versión, de la más nueva a la más vieja, con su fecha y lo que cambió en palabras («inserted into: main.ventas»). En cada tabla de una versión:

- **As it was** abre una consulta con la tabla en esa versión (`AT (VERSION => n)`).
- **What changed** abre una consulta con las filas que cambiaron en esa versión; un `UPDATE` sale con el antes y el después.

En el menú de una tabla del lago, **As it was…** pide una versión o una fecha y abre la consulta.

### Mantenimiento

La llave inglesa de **Lake versions** abre el mantenimiento. **Antes de hacer nada**, dice lo que va a pasar:

- **Compact** junta archivos de datos pequeños en otros más grandes: las consultas van más rápido y no se pierde nada.
- **Expire versions older than N days**: cuántas versiones expiran y **desde qué fecha** se podrá seguir consultando «como estaba».
- **Remove data files no version uses any more**: cuántos archivos y cuántos MB se borran.

Si va a borrar algo, el botón dice **Compact and remove**, en rojo. No hay papelera: una versión expirada ya no se consulta.

## Tips y gemas

- **Las escrituras pequeñas no crean archivos:** quedan dentro del catálogo hasta que crecen.
- **Expirar no libera los archivos que la versión de hoy sigue usando:** se liberan al compactar.
- **Un archivo con borrados (tras un UPDATE) no se compacta.**
- **El lago con dbt:** en `profiles.yml`, el *target* de dbt apunta al mismo `.ducklake.sqlite`; AmoxSQL y dbt escriben sin esperar uno al otro.

## Relacionado

- [Explorador de base](database-explorer.md) · [DBT Studio](../dbt/dbt-studio.md) · [Extensiones de DuckDB](duckdb-extensions.md)
