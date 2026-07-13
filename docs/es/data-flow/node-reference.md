# Referencia de nodos

**🌐 [English](../../en/data-flow/node-reference.md) · Español**

> El catálogo completo de los 33 tipos de nodo de [Data Flow](data-flow.md), organizados por intención tal como aparecen en la paleta.

<!-- 📷 CAPTURE: docs/images/data-flow/node-palette.png — La paleta de nodos de Data Flow expandida, mostrando los grupos por intención (Data Sources, SQL, Filter & Order, Columns, Clean & Format, Reshape & Aggregate, Combine & Enrich, Output, Quality & Control) con sus nodos. -->

## Qué es

Cada paso de un pipeline es un **nodo**. La paleta izquierda los agrupa por *intención*, ordenada como fluye un pipeline (de origen a salida): primero traes datos, luego los filtras y transformas, después los combinas y por último los escribes o validas.

Esta página lista los 33 nodos por grupo. Cada nodo también trae su propia documentación dentro de la app: selecciona un nodo y abre la pestaña **info** de su panel de configuración, o pulsa el icono de ayuda en la paleta.

## Cuándo usarlo

- Como referencia rápida al construir un pipeline: qué nodo hace qué.
- Cuando dudas entre dos nodos parecidos (Pivot vs. Unpivot, Join vs. Merge, Filter vs. una consulta SQL).
- Para descubrir capacidades menos obvias (ventanas, enriquecimiento con IA, lectura de buckets en la nube).

Para el flujo de construir, conectar y ejecutar, ver [Data Flow](data-flow.md) y [Ejecutar y motor](running-and-engine.md).

## Cómo usarlo

1. Arrastra un nodo de la paleta al lienzo, o arrastra una tabla/archivo desde los exploradores para crear un nodo de origen automáticamente.
2. Selecciona el nodo y llena sus campos en la pestaña **basic**.
3. Consulta la pestaña **info** para ver opciones, ejemplos y consejos de ese nodo concreto.

## Referencia de nodos

### Data Sources (orígenes de datos)
Nodos de arranque: no tienen entrada, producen una tabla.

| Nodo | Qué hace |
|---|---|
| **Import File** | Carga un archivo local (CSV, TSV, Parquet, JSON, Excel) en una tabla; los tipos se detectan solos |
| **Import Folder** | Carga y apila todos los archivos que coinciden con un patrón (p. ej. `*.csv`) de una carpeta en una sola tabla, unidos por nombre de columna |
| **Table Source** | Referencia una tabla o vista existente como origen, sin copiar nada |
| **HTTP Fetch** | Lee un archivo (CSV, JSON, Parquet) directamente desde una URL pública |
| **Cloud Bucket** | Lee CSV/Parquet/JSON de un bucket S3 o GCS (credenciales en Ajustes); admite patrones glob |
| **Google Sheet** | Lee una pestaña de una hoja de cálculo de Google en una tabla (cuenta de servicio en Ajustes) |

### SQL
Para lo que los nodos visuales no cubren.

| Nodo | Qué hace |
|---|---|
| **SQL Query** | Ejecuta cualquier SQL de DuckDB que escribas; el resultado es la salida del nodo |
| **SQL File** | Ejecuta un archivo `.sql` del proyecto tal cual (reutilizable y versionable) |

### Filter & Order (filtrar y ordenar)

| Nodo | Qué hace |
|---|---|
| **Filter** | Conserva solo las filas que cumplen tus condiciones (comparaciones, LIKE, IN, BETWEEN, nulos), combinadas con AND/OR — sin SQL |
| **Deduplicate** | Elimina filas duplicadas; con columnas clave conserva la primera o la última por clave |
| **Sample** | Toma un subconjunto de filas: un número fijo, un porcentaje o estratificado por grupo |
| **Sort** | Ordena las filas por una o más columnas, ascendente o descendente |

### Columns (columnas)

| Nodo | Qué hace |
|---|---|
| **Select Columns** | Elige qué columnas conservar y, opcionalmente, renómbralas |
| **Add Column** | Crea columnas calculadas con expresiones, mediante un constructor sin código |
| **Rename Table** | Renombra la tabla de salida a un nuevo nombre |
| **Type Cast** | Convierte columnas a otro tipo de dato (VARCHAR, INTEGER, DATE, etc.) |

### Clean & Format (limpiar y formatear)

| Nodo | Qué hace |
|---|---|
| **Clean / Replace** | Estandariza texto: trim, minúsculas/mayúsculas, reemplazo, regex, rellenar nulos, normalizar acentos… |
| **Date / Time** | Kit de fechas: parsear texto→fecha, extraer partes, truncar, formatear, sumar/restar, diferencias y edad |
| **Flatten / Unnest** | Extrae campos JSON anidados a columnas, o explota un array en filas |

### Reshape & Aggregate (reformar y agregar)

| Nodo | Qué hace |
|---|---|
| **Group & Aggregate** | Resume filas por grupos con SUM, COUNT, AVG, MEDIAN, PERCENTILE, STRING_AGG…, con HAVING opcional |
| **Window Functions** | Aplica ROW_NUMBER, RANK, LAG, totales acumulados sobre particiones — sin colapsar filas |
| **Pivot** | Convierte valores de filas en columnas (largo → ancho), como una tabla dinámica |
| **Unpivot** | Convierte columnas en filas (ancho → largo), el inverso de pivotar |

### Combine & Enrich (combinar y enriquecer)

| Nodo | Qué hace |
|---|---|
| **Join Tables** | Une dos tablas por una o más columnas clave (LEFT, INNER, RIGHT, FULL; claves compuestas) |
| **Merge Tables** | Apila dos o más tablas de la misma forma (UNION ALL conserva duplicados; UNION los quita) |
| **AI Enrich** | Aplica un LLM a cada fila: clasificar, extraer, resumir o redactar/ocultar datos personales (PII) |

### Output (salida)

| Nodo | Qué hace |
|---|---|
| **Create Table** | Materializa el resultado como una tabla persistente en la base de datos |
| **Export File** | Escribe el resultado a un archivo (CSV/Parquet/Excel/JSON), local o en la nube, opcionalmente particionado |

### Quality & Control (calidad y control)

| Nodo | Qué hace |
|---|---|
| **Assert** | Valida la calidad de los datos (no vacío, conteo de filas, sin nulos, unicidad o consulta propia) y **detiene el chain** si falla |
| **Schema Validation** | Comprueba que los datos tienen las columnas y tipos esperados; el modo estricto también rechaza columnas de más |
| **Checkpoint** | Pausa la ejecución aquí para inspeccionar y **reanudar** después (útil para revisiones o entregas entre personas) |
| **Notification** | Envía una notificación cuando el paso se ejecuta: aviso en la app (toast), línea a un archivo de log o webhook HTTP |

## Tips y gemas

- **Filtra pronto:** poner un Filter cerca del origen reduce todo lo que viene después.
- **Ventanas vs. agregación:** Group & Aggregate colapsa filas en una por grupo; Window Functions añade columnas y **conserva todas las filas**.
- **Join vs. Merge:** Join combina tablas *a lo ancho* por una clave; Merge las apila *a lo largo* (mismas columnas). Si tus entradas son muchos archivos en una carpeta, usa Import Folder en vez de Merge.
- **Sort + Deduplicate (keep last):** ordena por fecha descendente y deduplica conservando la última para quedarte con el registro más reciente por clave.
- **Unpivot para graficar:** el formato largo suele ser el que prefiere el visualizador Story Flow.
- **AI Enrich es una llamada por fila:** mantén *Max rows* moderado en tablas grandes; usa el proveedor/modelo de Ajustes → IA.
- **Assert antes de Output:** coloca aserciones justo antes de escribir para atajar datos malos antes de que salgan.
- **Excel, HTTP y nube usan extensiones de DuckDB** (spatial, httpfs, gsheets) que se instalan solas la primera vez; las fuentes en la nube requieren credenciales en Ajustes.

## Relacionado

- [Data Flow](data-flow.md) · [Ejecutar y motor](running-and-engine.md)
- [Editor SQL](../editor/sql-editor.md) · [Importar datos](../data/importing-data.md) · [Exportar datos](../data/exporting-data.md)
