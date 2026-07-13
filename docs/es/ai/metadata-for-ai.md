# Metadata para IA

**🌐 [English](../../en/ai/metadata-for-ai.md) · Español**

> ¿No tienes un modelo local ni una API key, pero sí acceso a un chat de IA en el trabajo? Exporta el contexto de tus datos y una Skill de AmoxSQL, pégalos ahí, y conviertes cualquier chat externo en un analista de DuckDB.

<!-- 📷 CAPTURE: docs/images/ai/metadata-for-ai.png — Modal "Metadata for AI" con el slider de filas de muestra, el toggle de perfil estadístico, el aviso de tamaño y el preview del Markdown generado -->

## Qué es

**Metadata para IA** es un puente hacia asistentes de IA externos. Genera un documento Markdown listo para pegar que describe tus datos: el **motor** (DuckDB), la **query o archivo de origen**, el **esquema** (columnas y tipos), una **muestra de filas** y, opcionalmente, un **perfil estadístico** (% de nulos, valores únicos, min/max, valores más frecuentes). Con ese contexto, un chat de IA que no ve tus datos puede escribirte SQL de DuckDB correcto.

Se complementa con las **Skills descargables**: archivos Markdown que instalas como instrucción del asistente externo para que se comporte como un analista de AmoxSQL. Hay dos:

- **Básica** — un analista de DuckDB que responde con SQL ejecutable.
- **Avanzada** — lo anterior más **configuraciones de gráfico para [Story Flow](../visualization/story-flow.md)** en JSON, derivadas automáticamente del esquema de configuración de gráficos de AmoxSQL para que estén siempre al día.

Todo esto es el "tercer camino" de la IA: no necesitas Ollama ni una clave configurada en AmoxSQL. Ver [Introducción a la IA](introduction.md).

## Cuándo usarlo

- Cuando **no puedes instalar** un modelo local ni pagar/configurar una API, pero tienes un chat de IA a mano.
- Cuando prefieres un modelo externo muy potente para un análisis puntual y no te importa el copiar/pegar manual.
- Si tienes un modelo local o una clave configurada, el [Asistente del editor](editor-assistant.md) y el [Deep Dive](deep-dive.md) son más cómodos — trabajan directo sobre los datos, sin pegar nada.

## Cómo usarlo

### Generar el contexto de datos
1. Abre **Metadata para IA** (*Metadata for AI…*) desde el menú **Export** del editor sobre una query, o desde el menú contextual de un archivo en el [Explorador de archivos](../data/file-explorer.md).
2. Ajusta las **filas de muestra** con el slider (5–200; por defecto 20).
3. Marca **Incluir perfil estadístico** si quieres nulos, únicos, min/max y top valores.
4. Si el origen es un Excel, elige la **hoja** en el selector.
5. Pulsa **Generar contexto**. Verás un preview con el número de columnas, filas totales y el tamaño estimado.
6. **Copia** al portapapeles o **descarga** como `amoxsql-context.md`.

### Descargar una Skill
1. Ve a **Ajustes → IA → Skills**.
2. Descarga la Skill **básica** o la **avanzada** (un archivo `.md`).

### Usarlo en un chat externo
1. Pega (o adjunta) la Skill descargada como instrucción/system del asistente externo.
2. Pega el documento de **Metadata para IA** de tus datos.
3. Haz tu pregunta. El asistente responde con un bloque SQL (y, con la Skill avanzada, un bloque JSON de gráfico).
4. Copia el SQL a AmoxSQL y ejecútalo. Para el gráfico, abre Story Flow sobre el resultado y usa **Pegar JSON**.

## Referencia

### Opciones del modal

| Opción | Qué controla | Rango / default |
|---|---|---|
| Filas de muestra | Cuántas filas de ejemplo se incluyen | 5–200 · default 20 |
| Incluir perfil estadístico | Añade nulos %, únicos, min/max, top valores | Desactivado |
| Hoja de Excel | Qué hoja leer (solo archivos Excel) | Primera hoja |
| Copiar / Descargar | Al portapapeles o como `amoxsql-context.md` | — |

### Qué contiene el documento

| Sección | Contenido |
|---|---|
| Motor | DuckDB (para que el asistente use su dialecto) |
| Origen | La query ejecutada o el archivo/hoja |
| Esquema | Nombres de columna y tipos |
| Muestra | Las filas de ejemplo |
| Perfil (opcional) | Nulos %, únicos, min/max, valores frecuentes |

### Skills descargables (Ajustes → IA → Skills)

| Skill | Qué hace |
|---|---|
| Básica (*AmoxSQL Data Skill*) | Analista de DuckDB: responde con SQL ejecutable |
| Avanzada (*AmoxSQL Data & Viz Skill*) | SQL + JSON de gráfico para Story Flow, con la lista de tipos, paletas y campos auto-derivada |

## Tips y gemas

- **Ojo al aviso de tamaño.** Por encima de ~12 KB, el documento puede exceder el límite de algunos chats. Baja las filas de muestra o desactiva el perfil si te pasas.
- **El JSON lleva solo la configuración, no los datos.** Story Flow renderiza el JSON contra el resultado del SQL que tú ejecutaste, así que tus datos nunca salen de tu máquina.
- **La Skill avanzada no se queda obsoleta.** Su lista de tipos de gráfico, paletas y campos se genera desde el propio esquema de AmoxSQL cada vez que la descargas.
- **Excel: elige la hoja correcta** antes de generar — el contexto describe solo la hoja seleccionada.

## Relacionado

- [Introducción a la IA](introduction.md) · [Modo solo-prompt](prompt-only-mode.md) · [Story Flow](../visualization/story-flow.md)
- [Exportar datos](../data/exporting-data.md) · [Explorador de archivos](../data/file-explorer.md)
