# Variables

**🌐 [English](../../en/editor/variables.md) · Español**

> Define valores reutilizables `${var}` una vez y AmoxSQL los sustituye en tu SQL cada vez que ejecutas, analizas o exportas.

## Qué es

Las variables de sesión te dejan parametrizar una query sin editar el SQL a mano. Escribes `${nombre}` donde quieras un valor, lo defines una vez en el panel de **Variables** del editor, y AmoxSQL lo resuelve justo antes de correr la query.

Cada variable tiene tres campos: **nombre**, **valor** y **tipo** (`text`, `date` o `number`). Las variables viven en la sesión del editor y se aplican a todas las acciones que ejecutan SQL desde esa pestaña.

Ojo: estas variables `${...}` del editor son **distintas** de las variables de entorno `{{var}}` de un [Notebook](../notebooks/notebooks.md), que son propias de cada archivo `.sqlnb`.

## Cuándo usarlo

- Cuando pruebas la misma query con distintos parámetros: cambia el valor de `${fecha_inicio}` y vuelve a ejecutar, sin tocar el SQL.
- Para fechas, umbrales o IDs que se repiten en varias cláusulas de la misma query.
- Cuando quieres compartir una query "plantilla" y que otra persona solo cambie los valores.

## Cómo usarlo

### Abrir el panel
En la barra de acciones del editor, pulsa **Variables**. El botón muestra un contador con cuántas variables tienes definidas. El botón **+** de al lado añade una variable nueva directamente.

<!-- 📷 CAPTURE: docs/images/editor/variables-bar.png — panel de variables desplegado bajo la barra de acciones -->

### Definir una variable
1. Pulsa **+** para añadir una fila.
2. Escribe el **nombre** (solo letras, números y guion bajo).
3. Escribe el **valor**. Si el tipo es `date`, aparece un selector de fecha.
4. Elige el **tipo** en el desplegable: `text`, `date` o `number`.
5. El icono de papelera elimina la variable.

### Usar la variable en SQL
Escribe `${nombre}` en cualquier parte de tu query:

```sql
SELECT *
FROM pedidos
WHERE fecha >= ${fecha_inicio}
  AND region = ${region}
  AND monto > ${umbral};
```

Al ejecutar, AmoxSQL reemplaza cada `${...}` por su valor antes de enviar la query al motor.

### Cuándo se resuelven
La sustitución ocurre en toda acción que dispare SQL desde el editor: **Run**, **Analyze** (plan de ejecución), la [exportación de datos](../data/exporting-data.md) y también la [depuración de CTEs](cte-debugging.md).

## Referencia de tipos

| Tipo | Cómo se sustituye | Ejemplo (valor → SQL) |
|---|---|---|
| `text` | Valor crudo, sin comillas. **Tú** decides si entrecomillar en el SQL | `norte` → `norte` (usa `'${region}'` para entrecomillar) |
| `date` | Valor entre comillas simples automáticamente | `2026-01-01` → `'2026-01-01'` |
| `number` | Valor crudo, sin comillas | `1000` → `1000` |

> Para texto que debe ir entrecomillado en SQL, envuelve el placeholder tú mismo: `WHERE region = '${region}'`. Las fechas ya se entrecomillan solas, así que escribe `WHERE fecha >= ${fecha_inicio}` sin comillas alrededor.

## Tips y gemas

- **Reutiliza el mismo `${nombre}`** cuantas veces quieras en la query: todas las apariciones se reemplazan.
- **El contador del botón** te recuerda de un vistazo cuántas variables están activas.
- **Distinto de los Notebooks:** si tu flujo necesita variables que persistan con el archivo y se compartan entre celdas, usa el entorno `{{var}}` del [Notebook](../notebooks/notebooks.md) en lugar de estas.
- **Number crudo para expresiones:** como `number` no entrecomilla, puedes usarlo dentro de cálculos (`monto * ${factor}`).

## Atajos / formatos

- Sintaxis en SQL: `${nombre_variable}`.
- No hay atajo de teclado dedicado; se maneja desde el botón **Variables** de la barra de acciones.

## Relacionado

- [Editor SQL](sql-editor.md) · [Depurar CTEs](cte-debugging.md) · [Snippets](snippets.md)
- [Notebooks](../notebooks/notebooks.md) · [Exportar datos](../data/exporting-data.md)
