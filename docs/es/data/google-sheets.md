# Google Sheets

**🌐 [English](../../en/data/google-sheets.md) · Español**

> Consulta tus hojas de cálculo de Google directamente con SQL: pega la URL, elige una pestaña y AmoxSQL genera el `read_gsheet(...)` por ti.

<!-- 📷 CAPTURE: docs/images/data/gsheets-section.png — Sección de Google Sheets al final del explorador de archivos, con una hoja conectada desplegada mostrando sus pestañas como tablas -->

## Qué es

La sección de Google Sheets vive al final del [Explorador de archivos](file-explorer.md). Conecta hojas de cálculo de Google por su URL y las trata como fuentes de datos: cada **pestaña** de la hoja aparece como una "tabla" que puedes consultar con SQL.

Por debajo usa la función `read_gsheet('<id>', sheet='<pestaña>')` de DuckDB, así que las hojas se leen en vivo — sin descargar ni importar. Necesitas la configuración de gsheets (una clave de cuenta de servicio) hecha una vez en Ajustes.

## Cuándo usarlo

- Para analizar datos que viven en Google Sheets sin exportarlos a CSV primero.
- Para unir una hoja con tus tablas locales en una misma query.
- Si prefieres una copia local persistente, exporta la hoja a CSV e [impórtala](importing-data.md) como tabla.

## Cómo usarlo

### Configurar (una vez)
1. En **Ajustes**, configura la integración de Google Sheets con una **clave de cuenta de servicio** (service account).
2. Comparte cada hoja que quieras leer con el correo de esa cuenta de servicio.

La sección solo aparece si la integración está configurada o si ya tienes hojas conectadas.

### Conectar una hoja
1. En la sección **Google Sheets**, pulsa el botón **+** (Añadir).
2. Pega la **URL** de la hoja y confirma.
3. La hoja aparece en la lista con sus pestañas.

### Consultar una pestaña
1. Despliega la hoja para ver sus **pestañas** (cada una con icono de tabla).
2. Haz clic en una pestaña para abrir una pestaña SQL con `SELECT * FROM read_gsheet('<id>', sheet='<pestaña>') LIMIT 100`.
3. O usa el botón de copiar para llevar el snippet `read_gsheet(...)` al portapapeles y pegarlo en tu propia query.

### Gestionar hojas
Cada hoja conectada tiene acciones para **abrir en Google Sheets** (en el navegador) y **quitar** de la lista. El botón de refrescar vuelve a leer estado y pestañas.

## Referencia de opciones

| Acción | Qué hace |
|---|---|
| + Añadir | Conecta una hoja pegando su URL |
| Refrescar | Recarga el estado y las pestañas |
| Clic en pestaña | Abre una pestaña SQL con el `read_gsheet(...)` de esa pestaña |
| Copiar snippet | Copia `read_gsheet('<id>', sheet='<pestaña>')` |
| Abrir en Google Sheets | Abre la hoja en el navegador |
| Quitar | Elimina la hoja de la lista |

## Tips y gemas

- **Lectura en vivo:** cada consulta lee la hoja tal cual está en ese momento; no hay copia local que se quede desactualizada.
- **El snippet es reutilizable:** copia `read_gsheet(...)` y úsalo dentro de JOINs o CTEs como cualquier tabla.
- **Comparte con la cuenta de servicio:** si una hoja no carga, casi siempre es porque no está compartida con el correo de la cuenta de servicio.
- **Pestañas = tablas:** cada pestaña de la hoja es una fuente independiente; elige la que necesites.

## Relacionado

- [Explorador de archivos](file-explorer.md) · [Importar datos](importing-data.md) · [Extensiones de DuckDB](duckdb-extensions.md)
- [Editor SQL](../editor/sql-editor.md) · [Configuración](../reference/configuration.md)
