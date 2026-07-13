# Configuración

**🌐 [English](../../en/reference/configuration.md) · Español**

> El modal de Ajustes de AmoxSQL: apariencia, editor, comportamiento, IA, integraciones de almacenamiento, workspace, atajos, tours y "Acerca de" — todo en un solo lugar.

<img src="../../../images/09_settings_modal.png" alt="Modal de Ajustes de AmoxSQL" width="100%" />

## Qué es

Ajustes es el panel central de configuración de AmoxSQL. Se abre con **Ctrl+,** (o el engrane en la barra) y agrupa todas las preferencias en pestañas a la izquierda. Un buscador en la parte superior filtra las pestañas por nombre.

Las pestañas se dividen en dos bloques: **Configurar** (Apariencia, Editor, Comportamiento, IA, Integraciones de almacenamiento, Workspace) y **Ayuda e info** (Atajos, Story Flow, Data Flow, Acerca de). La mayoría de los cambios se aplican en vivo.

La configuración persiste en `~/.amoxsql/config.json`; las preferencias de UI se guardan además en `localStorage` (ver [Dónde se guarda](#dónde-se-guarda-la-configuración)).

## Cómo usarlo

1. Abre Ajustes con **Ctrl+,** o el engrane.
2. Elige una pestaña en la columna izquierda (o escribe en el buscador para filtrarlas).
3. Ajusta las opciones; los cambios se reflejan al instante.
4. Cierra con **Escape** o el botón de cierre.

## Apariencia

Controla el aspecto visual de la app. Ver [Temas y apariencia](../user-guide/themes-and-appearance.md).

| Opción | Qué controla |
|---|---|
| Tema | Modo claro/oscuro y temas Amox Dark/Light |
| Color de acento | Color de énfasis de la UI |
| Fuente de UI | Tipografía de la interfaz |
| Zoom de UI | Escala global de la interfaz (también con Ctrl +/-/0) |

## Editor

Configura el [Editor SQL](../editor/sql-editor.md). Los cambios se aplican al editor en vivo.

| Opción | Qué controla |
|---|---|
| Familia y tamaño de fuente | Tipografía del código (6 familias incluidas) |
| Minimapa | Mapa de navegación a la derecha |
| Word wrap | Ajuste de línea |
| Números de línea | Mostrar/ocultar |
| Tamaño de tabulación | Ancho de indentación |
| Zoom con rueda del mouse | Ctrl + rueda para acercar/alejar |
| Colorización de pares de brackets | Colorear paréntesis emparejados |
| Guías de indentación | Líneas verticales de indentación |
| Estilo/parpadeo del cursor | Apariencia del cursor |
| Estilo de formateo | Reglas del formateador SQL (mayúsculas de keywords, líneas entre queries…) |

## Comportamiento

Preferencias de flujo de trabajo.

| Opción | Qué controla |
|---|---|
| Autoguardado | Guarda los archivos automáticamente al editar |
| Pantalla de bienvenida | Mostrar u ocultar la pantalla de bienvenida al iniciar |
| Acción por defecto para archivos de datos | Qué hace AmoxSQL al abrir un CSV/Parquet/Excel (p. ej. previsualizar, importar) |

## IA

Configura proveedores, claves y modelos del asistente. Ver [Proveedores y modelos](../ai/providers-and-models.md).

| Opción | Qué controla |
|---|---|
| Proveedor activo | Ollama (local) o nube: Google Gemini, Anthropic, OpenAI, Google Vertex |
| Claves de API | Credenciales por proveedor de nube |
| Modelo | Modelo a usar por proveedor (los de Ollama se descubren localmente) |
| Parámetros | Ajustes por modelo según su perfil de capacidad |

> Las claves de API se guardan en tu `config.json` local; no salen de tu equipo salvo hacia el proveedor que elijas.

## Integraciones de almacenamiento

Conecta almacenamiento en la nube para importar y exportar datos. Ver [Google Sheets](../data/google-sheets.md) y [Exportar datos](../data/exporting-data.md).

| Integración | Qué habilita |
|---|---|
| S3 | Leer/escribir datos en almacenamiento compatible con S3 |
| GCS | Leer/escribir datos en Google Cloud Storage |
| Google Sheets | Importar/exportar hojas de cálculo de Google Sheets |

## Workspace

Un asistente para configurar el proyecto/espacio de trabajo activo (rutas, base de datos, contexto). Ver [Proyectos y conexiones](../user-guide/projects-and-connections.md).

| Opción | Qué controla |
|---|---|
| Asistente de workspace | Guía paso a paso para configurar el proyecto activo |

## Atajos

Pestaña de solo referencia con el set completo de atajos de teclado, agrupados por categoría. Es el mismo contenido de [Atajos de teclado](keyboard-shortcuts.md).

## Story Flow

Ayuda y reinicio del tour de la sección de visualización. Ver [Story Flow](../visualization/story-flow.md).

| Opción | Qué controla |
|---|---|
| Reiniciar tour de Story Flow | Vuelve a mostrar el recorrido guiado la próxima vez que entres |

## Data Flow

Ayuda y reinicio del tour del editor de pipelines. Ver [Data Flow](../data-flow/data-flow.md).

| Opción | Qué controla |
|---|---|
| Reiniciar tour de Data Flow | Vuelve a mostrar el recorrido guiado la próxima vez que entres |

## Acerca de

Información de la app: versión, autor, licencia y enlaces. Sin opciones configurables.

## Dónde se guarda la configuración

| Ubicación | Qué guarda |
|---|---|
| `~/.amoxsql/config.json` | Configuración principal: proveedores/claves de IA, integraciones, preferencias del servidor |
| `localStorage` | Preferencias de UI del renderer (ver abajo) |

Claves principales de `localStorage` (nivel alto):

| Clave | Guarda |
|---|---|
| `amoxsql-theme` · `amoxsql-accent` | Tema y color de acento |
| `amoxsql-ui-font` · `amoxsql-ui-zoom` | Fuente y zoom de la UI |
| `amoxsql-editor-settings` · `amoxsql-editor-layout` | Preferencias y layout del editor |
| `amoxsql-formatter-config` | Estilo del formateador SQL |
| `amoxsql-recent-projects` | Proyectos recientes |
| `amoxsql-*-tour-seen` | Banderas de tours vistos (getting-started, Story Flow, Data Flow, etc.) |

## Tips y gemas

- **Busca en Ajustes:** el campo de búsqueda superior filtra las pestañas por nombre; útil cuando no recuerdas dónde vive una opción.
- **Reinicia un tour cuando quieras:** las pestañas Story Flow y Data Flow te dejan volver a ver el recorrido guiado.
- **La configuración es portátil:** al ser un JSON en `~/.amoxsql/`, puedes respaldarla o versionarla.

## Relacionado

- [Temas y apariencia](../user-guide/themes-and-appearance.md) · [Editor SQL](../editor/sql-editor.md)
- [Proveedores y modelos](../ai/providers-and-models.md) · [Atajos de teclado](keyboard-shortcuts.md)
- [Proyectos y conexiones](../user-guide/projects-and-connections.md) · [Formatos de archivo](file-formats.md)
