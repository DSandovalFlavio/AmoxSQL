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

### Importar Excel (.xlsx / .xls)
El Excel usa un diálogo propio que primero **inspecciona las hojas**:
1. Clic derecho sobre el `.xlsx` → **Importar a la base…**.
2. Marca las **hojas** que quieres importar.
3. Elige la **estrategia**:
   - **Fusionar hojas (Merge)** — combina las hojas seleccionadas en una tabla (con una columna que marca la hoja de origen).
   - **Tablas individuales** — una tabla por hoja.
4. Opcional: **Limpiar nombres de columna**. Pulsa importar.

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
| Selección de hojas | Qué hojas importar | Todas |
| Estrategia | Fusionar (una tabla) · Individual (una por hoja) | Fusionar |
| Nombre de tabla (Fusionar) | Nombre de la tabla combinada | Derivado del archivo |
| Limpiar nombres de columna | Normaliza los nombres | Activado |

## Tips y gemas

- **Fusionar añade el origen:** al fusionar hojas de Excel se agrega una columna que identifica de qué hoja vino cada fila.
- **Un patrón, muchos archivos:** importar una carpeta usa un glob (`*.csv`), ideal para lotes de exportaciones diarias.
- **Los tipos vienen del motor:** DuckDB infiere los tipos al leer, así que no tienes que declararlos.
- **¿Solo mirar?** No importes: usa Consulta directa o Vista rápida desde el explorador de archivos.

## Relacionado

- [Explorador de archivos](file-explorer.md) · [Explorador de base de datos](database-explorer.md) · [Exportar datos](exporting-data.md)
- [Extensiones de DuckDB](duckdb-extensions.md) · [Google Sheets](google-sheets.md) · [Formatos de archivo](../reference/file-formats.md)
