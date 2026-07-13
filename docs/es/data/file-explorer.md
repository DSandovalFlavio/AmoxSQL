# Explorador de archivos

**🌐 [English](../../en/data/file-explorer.md) · Español**

> El árbol de archivos de tu proyecto: crea, renombra, mueve y abre archivos, e importa datos a la base — todo desde la barra lateral, sin salir de AmoxSQL.

<!-- 📷 CAPTURE: docs/images/data/file-explorer.png — Panel del explorador de archivos con la cabecera de acciones, buscador, breadcrumb y la lista de archivos mostrando iconos por tipo y badges de git -->

## Qué es

El explorador de archivos es el panel de la izquierda que navega la carpeta de tu proyecto (el workspace). Muestra tus scripts `.sql`, notebooks `.sqlnb`, gráficos `.amoxvis`, decks `.amoxdeck`, datos (CSV, Parquet, JSON, Excel) y cualquier otro archivo, con un icono de color por tipo.

Es tu punto de entrada a los datos: desde aquí abres archivos, los importas a la base de datos, los consultas directamente o copias sus nombres de columna. También gestiona el ciclo de vida de los archivos (crear, renombrar, mover, duplicar, borrar) sin tocar el explorador del sistema operativo.

Los archivos de base de datos (`.duckdb`, `.db`) se ocultan a propósito: se conectan desde la pantalla de proyecto, no se abren como texto. Si tu proyecto es un repositorio git, cada archivo muestra su estado con un badge.

## Cuándo usarlo

- Para abrir cualquier archivo del proyecto, o crear uno nuevo.
- Para llevar un CSV/Parquet/JSON/Excel a la base como tabla (ver [Importar datos](importing-data.md)) o consultarlo en el sitio sin importarlo.
- Para reorganizar el proyecto: mover, renombrar, duplicar o borrar archivos en bloque.
- Para el esquema ya cargado en la base, usa el [Explorador de base de datos](database-explorer.md); este panel es para archivos en disco.

## Cómo usarlo

### Navegar
1. Haz clic en una carpeta para entrar; usa el **breadcrumb** superior o el botón **Subir** (flecha) para volver.
2. Escribe en **Buscar archivos…** para filtrar la carpeta actual por nombre.
3. El botón **Refrescar** vuelve a leer la carpeta desde disco.

### Abrir un archivo
Haz doble uso del clic según el tipo:
- `.sql`, `.sqlnb`, `.md`, `.amoxdeck` → se abren en el editor/notebook/deck.
- `.amoxvis` → abre el editor de gráficos.
- `.xlsx`/`.xls` → **siempre** abren como Consulta directa (Direct Query).
- `.csv`, `.parquet`, `.json` → siguen tu ajuste de acción por defecto (vista previa o consulta directa).

### Crear archivos y carpetas
En la cabecera del panel tienes botones para **Nuevo SQL**, **Nuevo Notebook**, **Nuevo Markdown**, **Nuevo Report Flow Deck** y **Nueva carpeta**. Sobre una carpeta, el menú contextual añade **Nuevo archivo aquí** y **Nueva carpeta aquí**.

### Ordenar y agrupar
El botón de orden **cicla** entre cinco modos: por defecto (carpetas primero), por nombre, por categoría, por extensión y por tamaño. En modo categoría/extensión, los archivos se agrupan con encabezados y contador.

### Operaciones de archivo
Clic derecho (o el botón de tres puntos) abre el menú contextual:
- **Cortar / Copiar / Pegar** (también `Ctrl+X` / `Ctrl+C` / `Ctrl+V`).
- **Duplicar**, **Mover a…** (selector de carpeta), **Renombrar** (`F2`).
- **Añadir a .gitignore**, **Eliminar** (borra en bloque si hay varios seleccionados).
- **Revelar en el Explorador** (abre la carpeta en tu sistema), **Copiar ruta relativa**, **Copiar nombre**.

Puedes **arrastrar** un archivo sobre una carpeta para moverlo. Selecciona varios con `Ctrl+clic` o `Shift+clic` para operar en bloque.

### Acciones sobre archivos de datos
Para CSV/TSV/Parquet/JSON/Excel, el menú añade acciones de datos:
- **Importar a la base…** — crea una tabla (ver [Importar datos](importing-data.md)).
- **Vista rápida** — 100 filas en un modal (CSV/Parquet/JSON).
- **Consulta directa** — abre una pestaña SQL con el `SELECT * FROM '<ruta>'` (o `read_xlsx(...)` para Excel) más comentarios con las columnas; para CSV/Parquet/JSON se ejecuta al instante.
- **Copiar nombres de columna** — al portapapeles como comentario SQL (para Excel, por hoja).
- **Metadata para IA…** — genera contexto del archivo (ver [Metadata para IA](../ai/metadata-for-ai.md)).

Sobre un `.sql`, el menú ofrece **Exportar resultados…**, que lee la query del archivo y abre el diálogo de export (ver [Guardar resultados](../results/saving-results.md)).

## Referencia de opciones

### Cabecera y menú contextual
| Acción | Qué hace |
|---|---|
| Nuevo SQL / Notebook / Markdown / Deck / Carpeta | Crea un archivo del tipo indicado en la carpeta actual |
| Orden (cicla) | default · nombre · categoría · extensión · tamaño |
| Buscar | Filtra la carpeta actual por nombre |
| Cortar / Copiar / Pegar | Mueve o copia archivos (`Ctrl+X/C/V`) |
| Duplicar · Mover a… · Renombrar | Copia con sufijo · elige carpeta destino · `F2` |
| Añadir a .gitignore | Añade el patrón del archivo/carpeta al `.gitignore` |
| Revelar en el Explorador | Abre la ubicación en tu sistema operativo |
| Copiar ruta relativa · Copiar nombre | Copia la ruta (con `/`) o solo el nombre |
| Eliminar | Borra el archivo o toda la selección (con confirmación) |

### Badges de estado git
| Badge | Significado |
|---|---|
| M | Modificado |
| A | Añadido |
| D | Borrado |
| ? | Sin seguimiento |

## Tips y gemas

- **Excel siempre es Consulta directa:** al abrir un `.xlsx` no se importa; se genera una query `read_xlsx(...)` para que decidas.
- **El tamaño se muestra en línea** junto a cada archivo (se puede ocultar en Ajustes del editor).
- **Copiar nombres de columna entiende hojas:** en un Excel copia las columnas de cada hoja etiquetadas por su nombre.
- **La sección de Google Sheets** vive al final del panel; conecta hojas por URL (ver [Google Sheets](google-sheets.md)).

## Atajos y formatos relacionados

| Atajo | Acción |
|---|---|
| F2 | Renombrar el archivo seleccionado |
| Delete | Eliminar la selección |
| Ctrl+C · Ctrl+X · Ctrl+V | Copiar · Cortar · Pegar |
| Ctrl+clic · Shift+clic | Selección múltiple (individual · rango) |

## Relacionado

- [Explorador de base de datos](database-explorer.md) · [Importar datos](importing-data.md) · [Google Sheets](google-sheets.md)
- [Guardar resultados](../results/saving-results.md) · [Metadata para IA](../ai/metadata-for-ai.md)
- [Formatos de archivo](../reference/file-formats.md) · [Configuración](../reference/configuration.md)
