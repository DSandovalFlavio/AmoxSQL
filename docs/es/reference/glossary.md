# Glosario

**🌐 [English](../../en/reference/glossary.md) · Español**

> Los términos propios de AmoxSQL en una línea cada uno, con enlace a la página que los desarrolla.

## Qué es

AmoxSQL tiene vocabulario propio: los nombres de sus estudios (Story Flow, Report Flow, Data Flow), sus formatos de archivo y algunos conceptos de datos e IA. Este glosario los define brevemente y enlaza a la referencia completa. Ordenado alfabéticamente.

## Términos

| Término | Definición |
|---|---|
| **`.amoxdeck`** | Deck de presentación markdown-first (front-matter + slides separados por `---` + gráficos embebidos). Ver [Formatos de archivo](file-formats.md) y [Report Flow](../reports/report-flow.md). |
| **`.amoxvis`** | Archivo JSON con la configuración de un gráfico; lleva su propia consulta, así que es autosuficiente. Ver [Formatos de archivo](file-formats.md). |
| **`.sqlchain`** | Pipeline de transformación guardada como grafo dirigido acíclico (DAG) en JSON. Ver [Data Flow](../data-flow/data-flow.md). |
| **`.sqlnb`** | SQL Notebook: celdas de SQL/Markdown/input más entorno, en JSON v3.0. Ver [Notebooks](../notebooks/notebooks.md). |
| **Analysis Vault** | Bóveda donde la IA guarda hallazgos y análisis a lo largo de las conversaciones. Ver [Analysis Vault](../ai/analysis-vault.md). |
| **Autocompletado** | Sugerencias de tablas, columnas y funciones según el contexto de la cláusula, resueltas contra el motor. Ver [Autocompletado](../editor/autocomplete.md). |
| **Contexto como código** | Semántica del dominio en archivos (`metrics.yml`, `joins.yml`, `glossary.md`, `examples/`) que alimenta a la IA. Ver [Contexto como código](../ai/context-as-code.md). |
| **Data Flow** | El estudio visual de pipelines: nodos conectados que transforman datos; guarda `.sqlchain`. Ver [Data Flow](../data-flow/data-flow.md). |
| **Deep Dive** | Modo de IA que entra en un bucle de razonamiento y ejecuta consultas hasta cumplir el objetivo. Ver [Deep Dive](../ai/deep-dive.md). |
| **Direct Query** | Consultar un archivo de datos (CSV/Parquet/Excel) en su sitio, sin importarlo a la base de datos. Ver [Importar datos](../data/importing-data.md). |
| **DuckDB** | El motor analítico local que ejecuta todo el SQL; embebido, rápido y sin servidor. Ver [Local-first](../concepts/local-first.md). |
| **Editor Assistant** | El asistente de IA integrado en el editor (panel Assist). Ver [Editor Assistant](../ai/editor-assistant.md). |
| **In-memory** | Modo por defecto (`:memory:`): trabajas sin un archivo de base de datos persistente. Ver [Proyectos y conexiones](../user-guide/projects-and-connections.md). |
| **Lane (carril)** | Uno de los tres carriles de conexión de DuckDB (`main`, `meta`, `ai`) sobre una única instancia, para que el autocompletado y la IA no se encolen detrás de tus queries. Ver [Arquitectura](../concepts/architecture.md). |
| **Stage (etapa)** | Cada una de las seis etapas del flujo de Story Flow (Tipo → Datos → Formato → Estilo → Historia → Export). Ver [Story Flow](../visualization/story-flow.md). |
| **Local-first** | Filosofía de AmoxSQL: tus datos y archivos viven en tu equipo, sin nube obligatoria. Ver [Local-first](../concepts/local-first.md). |
| **Metadata para IA** | Exportación del esquema/perfil de tu base como contexto para pegar en otra herramienta de IA. Ver [Metadata para IA](../ai/metadata-for-ai.md). |
| **Modo prompt-only** | Ruta de respaldo cuando el modelo activo no soporta tool-calling: mapea tablas virtuales y extrae bloques SQL. Ver [Modo prompt-only](../ai/prompt-only-mode.md). |
| **Notebook** | Análisis narrado por celdas (SQL, Markdown, input); archivo `.sqlnb`. Ver [Notebooks](../notebooks/notebooks.md). |
| **Proyecto** | Una carpeta con tus archivos SQL, notebooks, contexto y config; la unidad de trabajo. Ver [Proyectos y conexiones](../user-guide/projects-and-connections.md). |
| **Read-only / read-write** | Modo de conexión a un archivo de base de datos: solo lectura (protegido) o lectura-escritura. Ver [Proyectos y conexiones](../user-guide/projects-and-connections.md). |
| **Report Flow** | El estudio de presentaciones: decks `.amoxdeck` con gráficos refrescables, exportables a Office. Ver [Report Flow](../reports/report-flow.md). |
| **`RULES.md`** | Archivo de reglas de comportamiento que la IA lee y sigue en cada conversación. Ver [Contexto como código](../ai/context-as-code.md). |
| **Capa semántica** | El conjunto de métricas, joins y glosario que da a la IA un vocabulario de negocio compartido. Ver [Contexto como código](../ai/context-as-code.md). |
| **Skill** | Procedimiento reutilizable (`agent/skills/<id>/SKILL.md`) que la IA activa para seguir un método. Ver [Skills](../ai/skills.md). |
| **Story Flow** | El estudio de visualización: gráficos en un flujo de seis etapas con capa de storytelling. Ver [Story Flow](../visualization/story-flow.md). |
| **Tier (nivel de modelo)** | Clasificación de capacidad de un modelo de IA (low/medium/high) que habilita ciertos modos. Ver [Proveedores y modelos](../ai/providers-and-models.md). |
| **Workspace** | El espacio de trabajo activo (proyecto, base de datos, contexto), configurable con su asistente. Ver [Configuración](configuration.md). |

## Relacionado

- [Formatos de archivo](file-formats.md) · [Configuración](configuration.md) · [Atajos de teclado](keyboard-shortcuts.md)
- [Introducción a la IA](../ai/introduction.md) · [Story Flow](../visualization/story-flow.md) · [Data Flow](../data-flow/data-flow.md)
