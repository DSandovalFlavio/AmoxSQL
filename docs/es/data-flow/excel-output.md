# Salida a Excel

**🌐 [English](../../en/data-flow/excel-output.md) · Español**

> El nodo **Excel** deja el resultado como lo espera el cliente: un libro con formato, con una hoja por paso, o su propia plantilla con los datos de este mes.

<img src="../../images/data-flow/excel-node.png" alt="los ajustes del nodo Excel con «A new workbook», tres hojas y un formato de columna" width="100%" />

## Qué es

Un nodo de Data Flow que escribe un `.xlsx`. Tiene dos modos:

- **Un libro nuevo.** Cada nodo conectado es una hoja. Cada columna toma el formato de su tipo, así que no se formatea nada a mano:
  - las fechas son fechas de Excel;
  - un `DECIMAL(18,2)` lleva dos decimales;
  - los enteros van sin separador de miles, para que años y códigos queden como son;
  - un identificador demasiado largo para que Excel lo guarde exacto va como texto.

  El encabezado va en negrita, fijo al desplazar y con filtro. Cada columna tiene el ancho de su contenido.
- **Rellenar una plantilla.** El cliente ya tiene su libro con fórmulas, gráficos y formato. AmoxSQL lo copia y sólo escribe las celdas de datos que le indicas. Todo lo demás queda exactamente como estaba: otras hojas, imágenes, estilos y las macros de un `.xlsm`.

## Cuándo usarlo

- Cierre mensual: *Resumen*, *Detalle* y *Notas* en un solo libro.
- El reporte del cliente ya existe y sólo le faltan los números del periodo.
- Alguien trabaja en Excel y necesita el resultado listo para usar, sin rehacer el formato.

## Cómo usarlo

1. Añade el nodo **Excel** (grupo *Output*) y conéctale los nodos cuyos resultados van al libro.
2. Elige **What to write**.
3. **Un libro nuevo:**
   - Ordena y nombra las hojas. Una hoja que no nombras toma el nombre de su nodo.
   - Si una columna necesita un aspecto concreto, abre **Column formats** y fuérzalo: moneda, porcentaje, entero, dos decimales, fecha o texto.
4. **Rellenar una plantilla:** elige la plantilla (`.xlsx`, `.xlsm`, `.xltx`). Para cada nodo conectado, di adónde va:
   - **Una tabla de la plantilla** (lo recomendado). Sus columnas se emparejan por nombre, o por posición si los nombres no coinciden. La tabla crece o encoge con las filas nuevas. Sus columnas calculadas se rellenan con su fórmula, y la fila de totales baja con ella.
   - **Una hoja, desde una celda** (`B5`). Los datos de la vez anterior se limpian. Una columna de al lado con una fórmula en todas las filas se arrastra hasta la última fila nueva. Si quieres, se escriben antes los nombres de las columnas.
5. **Save as:** dónde se deja el libro. Los `${parámetros}` valen en el nombre: `salidas/cierre_${mes}.xlsx`.

## Lo que sigue a los datos en una plantilla

Cuando los datos crecen o encogen, lo que apuntaba a las filas de la vez anterior apunta a las nuevas:

- los rangos de los gráficos;
- los nombres definidos;
- el formato condicional;
- la validación de datos;
- el origen de una tabla dinámica, que además se refresca al abrir el libro.

El libro se recalcula al abrirse, así que las fórmulas enseñan los números de esta ejecución.

## Opciones

| Opción | Qué hace |
|---|---|
| What to write | Un libro nuevo, o rellenar una plantilla |
| Sheets | Orden, nombre y formatos forzados por columna |
| Template | El libro del cliente que se rellena |
| Goes into | Una tabla de la plantilla, o una hoja y su primera celda |
| Write the column names first | Sólo desde una celda: escribe los encabezados en esa celda y los datos debajo |
| Save as | La ruta del libro; admite parámetros |
| Add a “Data as of …” line | Una línea bajo cada tabla con la fecha de los datos (en las propiedades va siempre) |

## La fecha de los datos

El libro dice de cuándo son sus datos: la fecha del **archivo más nuevo que leyó el proceso** (una fuente, un archivo o una carpeta importados), no la del día en que corrió. El cierre de septiembre corrido el 2 de octubre con el Excel que llegó el 30 dice «30 Sep».

- **Siempre** va en las propiedades del libro (Archivo → Información → Propiedades → Avanzadas): «Data as of» y «Made by».
- **Add a “Data as of …” line under each table** añade una línea debajo de cada tabla, con una fila en blanco: la cabecera, los datos y el filtro no se mueven.
- **En una plantilla**, define un nombre `datos_al` sobre una celda (Fórmulas → Definir nombre): esa celda recibe la fecha. Con formato de fecha va como fecha; si no, como texto.
- Un dato remoto (una dirección web, un bucket) no tiene una fecha fiable y no cuenta. Si el proceso no leyó ningún archivo, no se escribe nada.

La misma fecha sale en el aviso («… · data as of 30 Sep 2026 · 4 s») y en lo que publica el nodo **Publish** (`amoxsql.datos_al`).

## Trucos y joyas

- **Una tabla es el destino más seguro:** crece y encoge, y los gráficos y fórmulas que la usan la siguen.
- **Nunca escribe sobre lo que no es suyo:** si los datos fueran a llegar a algo de debajo (un pie de página), la ejecución se para y dice en qué celda. El archivo anterior queda como estaba.
- **Nadie lee medio archivo:** el libro se escribe aparte y se cambia al final. Si alguien lo tiene abierto en Excel, AmoxSQL espera unos segundos y luego dice quién lo tiene.
- **El límite de Excel:** una hoja admite como máximo 1 048 575 filas más el encabezado. Por encima, la ejecución se para con un error claro antes de escribir nada.
- **Sin extensiones:** el libro lo escribe AmoxSQL. **Export File** en formato Excel y el botón **Export** del editor usan el mismo escritor.

## Relacionado

- [Referencia de nodos](node-reference.md)
- [Exportar datos](../data/exporting-data.md)
- [Publicar un archivo](../data/sources.md)
