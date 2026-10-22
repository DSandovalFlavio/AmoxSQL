# El contrato de una fuente

**🌐 [English](../../en/data/source-contracts.md) · Español**

> Lo que el archivo de una fuente tiene que traer: sus columnas, de qué tipo es cada una y unas reglas. Si el cliente cambia «Importe» por «Monto», el proceso se para antes de entregar nada y dice qué cambió.

## Qué es

Un proceso que corre solo cada mañana no tiene a nadie mirando. Si el Excel del cliente llega con una columna renombrada, o con un «N/A» entre los importes, el proceso puede entregar un archivo con una columna vacía y nadie se entera. El **contrato** de una [fuente](sources.md) evita eso: antes del primer paso, el proceso comprueba que el archivo trae lo que debe.

## Cuándo usarlo

- Cuando una fuente la lee un **proceso programado** o que corre sin ti.
- Cuando el archivo lo hace **otra persona** (un cliente, otra área) y su forma puede cambiar.
- Cuando una columna **no puede venir vacía** o sólo admite ciertos valores.

## Cómo usarlo

1. En el explorador de base, clic derecho sobre la fuente → **Add a contract…**
2. Pulsa **Take today's columns**: llena el contrato con las columnas que trae hoy el archivo y su tipo (texto, número, fecha, sí/no). Quita las que no importan y desmarca **Required** en las que pueden faltar.
3. Añade reglas si hace falta:

   | Regla | Qué pide |
   |---|---|
   | No empty values | La columna no tiene celdas vacías |
   | No repeated values | Ningún valor se repite (un folio, un código) |
   | Within a range | Entre un mínimo y un máximo (un importe no negativo) |
   | Only these values | Sólo los valores de una lista (las tiendas que existen) |
   | At least N rows | El archivo trae al menos N filas |

4. Elige qué pasa si no se cumple:
   - **Stop the process** (de serie): no corre nada y lo dice.
   - **Warn and go on**: corre y queda «con un aviso».
5. **Check now** lo comprueba contra el archivo de hoy, sin guardar. Luego **Save**.

Con **Strict**, una columna que el contrato no nombra también es un fallo.

## Lo que dice cuando falla

Cada fallo se dice en una línea, con ejemplos:

- `the column "Importe" is missing — "Monto" is new: was it renamed?`
- `"Importe" has 1 value that is not a number: «N/A»`
- `"Tienda" has 2 values that are not allowed: «centro»`
- `it has 0 rows (at least 1 expected)`

Esa línea va al aviso del sistema, a la ficha de la ejecución (el primer paso, **Source contract**) y a **Needs attention**, en la bienvenida y en la ficha del workspace ([ver](../data-flow/scheduling.md#cuando-algo-falla-needs-attention)).

## Cuándo se comprueba

- Al correr un proceso de Data Flow que lee la fuente, con un nodo de fuente o con `fuentes."x"` en un SQL, **antes del primer paso**.
- Al correr dbt desde AmoxSQL, si el proyecto usa esa fuente de AmoxSQL ([ver](../dbt/amoxsql-sources-in-dbt.md)).
- Con **Check now**.

Una consulta en el editor **no** lo comprueba: sería releer el archivo en cada consulta.

## Números y fechas, como son

Con contrato, un Excel o un CSV se lee **como texto** y cada columna se convierte a su tipo. Eso evita dos trampas de los Excel de verdad:

- **Una celda vacía en la primera fila** ya no vuelve texto toda la columna.
- **Un «N/A» entre números** ya no hace fallar la lectura con un error del motor: se cuenta y se nombra.

Una fecha se reconoce escrita como `2026-10-01` o `01/10/2026`, o como fecha de Excel. Lo que llega a los pasos siguientes tiene el tipo del contrato: número decimal o fecha. Un Parquet, un JSON o un lago ya traen sus tipos: sólo se comprueban.

## Tips y gemas

- **Empieza siempre con «Take today's columns».** Nadie escribe un contrato desde cero.
- **El contrato viaja con la fuente:** si la fuente es del workspace, vale para todos sus proyectos.
- **Comprobarlo cuesta poco:** en un Excel de 50.000 filas, menos de un segundo.

## Relacionado

- [Fuentes de datos](sources.md) · [Programar procesos](../data-flow/scheduling.md) · [Data Flow](../data-flow/data-flow.md)
