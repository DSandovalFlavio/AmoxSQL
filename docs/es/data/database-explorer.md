# Explorador de base de datos

**🌐 [English](../../en/data/database-explorer.md) · Español**

> El árbol del esquema de tu base de datos: navega schemas, tablas y columnas, arrástralos al editor y opera sobre cada tabla (vista previa, detalles, calidad, DDL) sin escribir SQL.

<img src="../../../images/03_database_explorer.png" alt="Explorador de base de datos de AmoxSQL" width="100%" />

## Qué es

El explorador de base de datos muestra lo que **ya está cargado** en el motor DuckDB: schemas, tablas, vistas y sus columnas con tipo. A diferencia del [Explorador de archivos](file-explorer.md) (que lista archivos en disco), este panel refleja el estado de la base.

Cada columna lleva un icono según su tipo (entero, número, texto, fecha/hora, booleano). Puedes buscar en tablas, vistas y nombres de columna a la vez, y arrastrar tablas o columnas directamente al editor para construir queries rápido.

Cuando la base tiene un solo schema, se muestra una lista plana de tablas; con varios schemas, se agrupan bajo nodos plegables con su contador.

## Cuándo usarlo

- Para explorar la estructura de la base: qué tablas y columnas existen y de qué tipo son.
- Para insertar nombres de tabla/columna en el editor arrastrándolos.
- Para inspeccionar una tabla (esquema, perfil, DDL, muestra) o correr un chequeo de calidad sin escribir SQL.
- Para ver la estructura como diagrama con relaciones, usa el [Diagrama ER](er-diagram.md); para archivos aún no importados, el [Explorador de archivos](file-explorer.md).

## Cómo usarlo

### Navegar y buscar
1. Haz clic en un schema para plegar/desplegar sus tablas (en bases multi-schema).
2. Haz clic en una tabla para desplegar sus columnas con tipo.
3. Escribe en el buscador para filtrar por tabla, vista o columna; las coincidencias por columna auto-despliegan su tabla.
4. El icono de copiar junto a cada tabla/columna copia su nombre.

### Arrastrar al editor
Arrastra una tabla o una columna al editor SQL para insertar su nombre en el cursor — ideal para armar `SELECT`, `JOIN` o listas de columnas sin teclear.

### Ver el diagrama ER
El botón de diagrama (icono de flujo) abre el [Diagrama ER](er-diagram.md) del schema. En bases de un solo schema está en la cabecera; en multi-schema, cada fila de schema tiene el suyo.

### Operar sobre una tabla
Clic derecho sobre una tabla abre el menú:
- **Select Top 100** — inserta `SELECT * FROM tabla LIMIT 100` en el editor.
- **Vista previa** — abre un modal con filas de la tabla.
- **Copiar nombre** — nombre calificado por schema al portapapeles.
- **Ver detalles** — abre el modal de detalles (pestañas Schema, Profile, Details, Preview, DDL).
- **Chequeo de calidad** — abre el informe de calidad de datos.
- **Drop Table…** — elimina la tabla (pide confirmación).

### Detalles de tabla
El modal de **Ver detalles** tiene cinco pestañas: **Schema** (campos, tipo, nulos, clave, default), **Profile** (nulos %, únicos, min/max por columna vía SUMMARIZE), **Details** (nombre, nº de filas, formato), **Preview** (hasta 200 filas paginadas de 100) y **DDL** (el `CREATE TABLE` para copiar).

### Chequeo de calidad
El **Chequeo de calidad** corre comprobaciones automáticas: `SUMMARIZE`, filas duplicadas, % de nulos, cardinalidad (únicos) y detección de posibles IDs vs. categóricos. Devuelve una puntuación global y una tabla de checks por columna (completitud y unicidad).

## Referencia de opciones

### Menú contextual de tabla
| Acción | Qué hace |
|---|---|
| Select Top 100 | Inserta `SELECT * FROM <tabla> LIMIT 100` en el editor |
| Vista previa | Muestra filas de la tabla en un modal |
| Copiar nombre | Copia el nombre (calificado por schema si aplica) |
| Ver detalles | Abre el modal con Schema · Profile · Details · Preview · DDL |
| Chequeo de calidad | Ejecuta el informe de calidad de datos |
| Drop Table… | Elimina la tabla (con confirmación) |

### Iconos por tipo de columna
| Icono | Tipo |
|---|---|
| # | Entero / número |
| Texto (A) | Cadena / texto |
| Calendario | Fecha / hora |
| Check | Booleano |

## Tips y gemas

- **Búsqueda por columna:** escribir el nombre de una columna revela en qué tablas aparece, y las despliega solas.
- **La caché evita el parpadeo:** al volver a una pestaña, el esquema aparece al instante desde caché mientras se revalida en segundo plano.
- **DDL listo para copiar:** la pestaña DDL de una tabla te da su `CREATE TABLE` exacto para recrearla o versionarla.
- **Vistas y tablas se distinguen** por su icono (ojo para vistas).

## Relacionado

- [Diagrama ER](er-diagram.md) · [Explorador de archivos](file-explorer.md) · [Importar datos](importing-data.md)
- [Data Profiler](../results/data-profiler.md) · [Editor SQL](../editor/sql-editor.md)
