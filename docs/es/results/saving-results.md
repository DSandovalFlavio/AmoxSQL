# Guardar resultados

**🌐 [English](../../en/results/saving-results.md) · Español**

> Cuatro formas de sacar tus resultados de la tabla: descargar lo que ves, exportar la query completa, materializarla como tabla, o guardarla en el Baúl.

## Qué es

AmoxSQL ofrece varias maneras de conservar o compartir un resultado, y es importante distinguirlas porque **no todas guardan lo mismo**. La diferencia clave: unas operan sobre las **filas ya cargadas en la tabla** (rápido, en memoria) y otras **re-ejecutan la consulta completa** contra el motor.

## Cuándo usar cada una

| Quieres… | Usa | Alcance |
|---|---|---|
| Copiar/bajar rápido lo que estás viendo | **Download** (tabla) | Filas cargadas (filtradas/ordenadas) |
| Exportar el resultado completo a un archivo o la nube | **Export** (editor) | Query completa, re-ejecutada |
| Dejar el resultado como objeto consultable en la BD | **Save as table…** | Query completa, materializada |
| Archivar el análisis para la IA y tu histórico | **Vault** | Metadatos + SQL |

## Cómo usarlo

### 1. Download — las filas que ves (instantáneo)
En la barra de la [tabla de resultados](results-table.md), el menú **Download ▾** baja **solo las filas cargadas en la tabla** (con tus filtros y orden aplicados), sin volver a consultar el motor:

- **Export CSV** — CSV con marca BOM y encabezados.
- **Export JSON** — todas las filas como JSON.
- **Copy to Clipboard** — copia en formato TSV (pegable en una hoja de cálculo).

El trabajo se hace en un *Web Worker* para no congelar la interfaz. Es la vía más rápida para llevarte una muestra.

### 2. Export — la query completa (a archivo o nube)
El botón **Export** de la barra del [editor](../editor/sql-editor.md) **re-ejecuta la consulta completa** y la escribe a un archivo (CSV, Parquet, Excel) o a un destino en la nube. A diferencia de Download, no se limita a las filas mostradas: exporta **todo** lo que devuelve la query. El detalle está en [Exportar datos](../data/exporting-data.md).

### 3. Save as table — materializar en la base de datos
El botón **Save as table…** abre un diálogo para crear un objeto nuevo en DuckDB a partir de la **query completa**:

1. Escribe un **nombre**.
2. Elige **Table** (materializa las filas) o **View** (guarda la definición, se recalcula al consultarla).
3. Guarda. El esquema se refresca y el nuevo objeto aparece en el [Explorador de base de datos](../data/database-explorer.md).

Internamente ejecuta `CREATE TABLE|VIEW "nombre" AS <tu query>`.

### 4. Vault — guardar en el Baúl de análisis
El botón **Vault** guarda el análisis (título, etiquetas, el SQL y un resumen del resultado) en el **Baúl de análisis**, tu histórico consultable y disponible para la IA. Ver [Baúl de análisis](../ai/analysis-vault.md).

## Referencia

| Acción | Dónde | Re-ejecuta la query | Salida |
|---|---|---|---|
| **Download → CSV** | Tabla de resultados | No | `.csv` (filas mostradas) |
| **Download → JSON** | Tabla de resultados | No | `.json` (filas mostradas) |
| **Download → Clipboard** | Tabla de resultados | No | TSV al portapapeles |
| **Export** | Barra del editor | Sí | Archivo (CSV/Parquet/Excel) o nube |
| **Save as table…** | Tabla de resultados | Sí | Tabla o vista en DuckDB |
| **Vault** | Tabla de resultados | No | Entrada en el Baúl |

## Tips y gemas

- **Download vs Export es la confusión clásica:** si filtraste o la tabla está truncada ("primeras N filas"), **Download** baja solo esas filas; para el conjunto íntegro usa **Export** (re-ejecuta) o añade tu propio `LIMIT`.
- **Table vs View:** una **tabla** congela los datos ahora; una **vista** siempre refleja los datos actuales al consultarla, pero recomputa cada vez.
- **CSV con BOM:** el CSV incluye la marca BOM para que los acentos se vean bien al abrirlo en hojas de cálculo.
- **El Baúl no guarda todas las filas:** almacena el SQL y un resumen (recuento y columnas), pensado para reencontrar y reutilizar análisis, no como copia de datos.

## Relacionado

- [Tabla de resultados](results-table.md) · [Exportar datos](../data/exporting-data.md)
- [Baúl de análisis](../ai/analysis-vault.md) · [Explorador de base de datos](../data/database-explorer.md)
- [Comparar resultados](compare-results.md)
