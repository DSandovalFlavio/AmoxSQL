# Importar datos

**🌐 [English](../../en/data/importing-data.md) · Español**

> Convierte archivos CSV, Parquet, JSON y Excel en tablas de tu base DuckDB — una carpeta entera, varias hojas, o consúltalos directamente sin importar.

<!-- 📷 CAPTURE: docs/images/data/import-modal.png — Diálogo "Importar a la base" mostrando el nombre de tabla, el schema destino opcional y la casilla de limpiar columnas -->

## Qué es

Importar datos crea una **tabla persistente** en la base a partir de un archivo (o de una carpeta de archivos del mismo tipo). Es lo que quieres cuando vas a consultar los mismos datos muchas veces, unirlos con otras tablas o transformarlos.

AmoxSQL usa la lectura nativa de DuckDB por debajo (`SELECT * FROM '<ruta>'`), así que la importación es rápida y respeta los tipos. Para Excel hay un flujo dedicado que inspecciona las hojas antes de importar.

Como alternativa, DuckDB puede **leer los archivos directamente** sin crear una tabla: útil para una exploración puntual (ver Consulta directa más abajo).

## Cuándo usarlo

- **Importa** cuando vayas a reutilizar los datos, hacer JOINs o construir sobre ellos.
- **Consulta directa** cuando solo quieras echar un vistazo o correr una query única sobre un archivo.
- Para exportar tablas o resultados a archivo/nube, ver [Exportar datos](exporting-data.md).

## Cómo usarlo

### Importar un archivo (CSV / Parquet / JSON)
1. En el [Explorador de archivos](file-explorer.md), clic derecho sobre el archivo → **Importar a la base…**.
2. En el diálogo, revisa el **nombre de tabla** (se sugiere a partir del archivo).
3. Opcional: indica un **schema destino** — si no existe, se crea.
4. Deja marcado **Limpiar nombres de columna** para normalizar espacios y caracteres raros a guiones bajos.
5. Pulsa **Importar**. Se crea la tabla y aparece en el [Explorador de base de datos](database-explorer.md).

### Importar una carpeta (por tipo)
1. Clic derecho sobre una carpeta → **Importar carpeta a la base…**.
2. Elige el **tipo de archivo** (CSV, Parquet o JSON): se importan todos los que coincidan con ese patrón (por ejemplo, `*.csv`).
3. Los archivos se combinan en una sola tabla.

### Importar Excel (.xlsx)
El Excel de un cliente rara vez empieza en A1: lleva un título, una línea de «generado el…», los encabezados en la fila 4 y notas al pie. El diálogo de Excel enseña la hoja **tal como es**, con letras y números de fila:
1. Clic derecho sobre el `.xlsx` → **Importar a la base…**.
2. Marca las **hojas** que quieres importar; clic en el nombre de una para verla.
3. **Clic en el número de la fila** donde están los nombres de columna (y, si hace falta, en la **letra** de la última columna). `A4:E` lee desde la fila 4 hasta la primera fila vacía. Debajo ves al momento lo que se va a leer, con sus tipos.
4. Opcional: **rellenar hacia abajo** las columnas con celdas combinadas, **limpiar los nombres** de columna.
5. Con varias hojas: **una tabla con columna `_hoja`** (para hojas con la misma forma, una por mes) o **una tabla por hoja**. Pulsa importar.

Lo elegido **se recuerda en el proyecto**: la próxima vez sale ya marcado, y el nodo Import File de Data Flow lee ese archivo igual. Lo que no es un libro dice qué es: un `.xls` antiguo o un libro con contraseña (guárdalo como `.xlsx`), uno dañado, o un **CSV con extensión `.xlsx`**, que se ofrece importar como CSV. La tabla recuerda de qué archivo, hoja y rango salió (ver [Fuentes de datos](sources.md)).

### Consulta directa (sin importar)
Desde el menú contextual del archivo, **Consulta directa** abre una pestaña SQL con la lectura ya escrita (`SELECT * FROM '<ruta>'` o `read_xlsx(...)`) más comentarios con las columnas. Para CSV/Parquet/JSON se ejecuta al instante; para Excel te deja lanzarla tú.

## Referencia de opciones

### Diálogo de importación (CSV/Parquet/JSON y carpeta)
| Opción | Qué hace | Default |
|---|---|---|
| Nombre de tabla | Nombre de la tabla a crear | Derivado del archivo |
| Schema (opcional) | Schema destino; se crea si no existe | `main` |
| Limpiar nombres de columna | Espacios y caracteres → guiones bajos | Activado |
| Tipo de archivo (solo carpeta) | CSV · Parquet · JSON a importar por patrón | CSV |

### Diálogo de Excel
| Opción | Qué hace | Default |
|---|---|---|
| Selección de hojas | Qué hojas importar | La primera (o las de la última vez) |
| Rango | Desde la fila de encabezados hasta la última columna; sin fila final, hasta la primera fila vacía | Hoja entera |
| La primera fila tiene los nombres | Si la primera fila del rango son los nombres de columna | Activado |
| Limpiar nombres de columna | Minúsculas y sin espacios | Desactivado |
| Rellenar hacia abajo | Columnas cuyas celdas vacías toman el valor de arriba (celdas combinadas) | Ninguna |
| Estrategia (varias hojas) | Una tabla con `_hoja` · Una tabla por hoja | Una tabla |
| Nombre de tabla | Nombre de la tabla | Derivado del archivo |

## Tips y gemas

- **Fusionar añade el origen:** al unir hojas de Excel se agrega la columna `_hoja` con la hoja de cada fila (hasta la 5.9 se llamaba `source_duck`; las tablas ya importadas no cambian).
- **Un archivo que usas en varios proyectos** conviene definirlo como [fuente](sources.md): se lee por su nombre y no se copia.
- **Un patrón, muchos archivos:** importar una carpeta usa un glob (`*.csv`), ideal para lotes de exportaciones diarias.
- **Los tipos vienen del motor:** DuckDB infiere los tipos al leer, así que no tienes que declararlos.
- **¿Solo mirar?** No importes: usa Consulta directa o Vista rápida desde el explorador de archivos.

## Relacionado

- [Explorador de archivos](file-explorer.md) · [Explorador de base de datos](database-explorer.md) · [Exportar datos](exporting-data.md)
- [Extensiones de DuckDB](duckdb-extensions.md) · [Google Sheets](google-sheets.md) · [Formatos de archivo](../reference/file-formats.md)
