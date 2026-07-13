# Herramientas del agente

**🌐 [English](../../en/ai/agent-tools.md) · Español**

> Las manos de la IA: cómo consulta tus datos, dibuja gráficos, escribe notebooks y valida su propio SQL, todo con guardas de seguridad.

<!-- 📷 CAPTURE: docs/images/ai/agent-tools-inspector.png — El inspector de Deep Dive mostrando una tool call execute_sql con su SQL, el resultado y el tiempo de ejecución. -->

## Qué es

Cuando la IA de AmoxSQL trabaja con un modelo capaz (tier medium o superior), no solo escribe texto: **usa herramientas**. Cada herramienta es una acción concreta — ejecutar SQL, describir una tabla, dibujar un gráfico — que el agente encadena para resolver tu pregunta. Ves cada llamada en el inspector de [Deep Dive](deep-dive.md) o en los bloques colapsables del [Asistente](editor-assistant.md).

Las herramientas traen **guardas** integradas: `execute_sql` limita las filas y tiene timeout, `display_chart` corrige elecciones de gráfico erróneas con linters, y `read_file`/`write_file` bloquean rutas fuera del proyecto.

## Cuándo importa

- Cuando quieres **entender qué hizo** la IA: cada paso es una tool call auditable.
- Cuando una respuesta te parece rara: abre la tool call y mira el SQL exacto y su resultado.
- Los modelos de tier low no usan tools; ver [Modo prompt-only](prompt-only-mode.md).

## Cómo usarlo

No invocas las herramientas directamente — el agente las elige. Pero puedes:

1. **Inspeccionar cada llamada:** en Deep Dive, el inspector muestra el SQL legible y la tabla; en el Asistente, expande el bloque de la tool call.
2. **Corregir el rumbo:** si el agente eligió mal, pídele que rehaga el paso o usa **Ask about this** sobre ese paso.
3. **Confiar en las guardas:** los avisos (por ejemplo un *join-fanout* o un gráfico mal elegido) aparecen en el resultado de la herramienta.

## Referencia

### Herramientas de datos

| Herramienta | Qué hace |
|---|---|
| `execute_sql` | Ejecuta SQL de DuckDB. Filas limitadas, timeout de 30 s, aviso de *join fan-out* si un JOIN infla las filas |
| `list_tables` | Lista las tablas con conteo de columnas y filas |
| `describe_table` | Columnas, tipos y filas de muestra de una tabla |
| `attach_file` | Registra un CSV/JSON/Parquet/Excel como vista consultable |
| `profile_data` | Perfil estadístico de una tabla (nulos, únicos, min/max, top valores) |
| `read_file` | Lee un archivo de texto o lista un directorio del proyecto (máx. 50 KB) |
| `validate_sql` | Valida una query sin ejecutarla (EXPLAIN); útil antes de una consulta costosa |

### Herramientas de salida

| Herramienta | Qué hace |
|---|---|
| `display_chart` | Genera un gráfico totalmente configurado (overlays, storytelling, razonamiento de color); linters del servidor corrigen elecciones malas |
| `build_notebook` | Construye un notebook `.sqlnb` con celdas y gráficos (Deep Dive) |
| `write_file` | Propone una edición del archivo activo o escribe/anexa un archivo (Asistente) |

### Herramientas de control

| Herramienta | Qué hace |
|---|---|
| `create_plan` / `update_plan` | Crea y actualiza el plan visible de pasos |
| `final_answer` | Cierra el análisis con la NarrativeCard estructurada (Deep Dive) |
| `ask_user` | Pausa para pedirte una aclaración cuando no puede seguir |
| `suggest_followups` | Propone 2-4 preguntas de seguimiento (Asistente) |

### Guardas destacadas

| Guarda | Qué previene |
|---|---|
| Tope de filas + timeout en `execute_sql` | Congelar el motor con un `SELECT *` gigante |
| Aviso de *join fan-out* | Confiar en filas infladas por claves no únicas |
| Linters de `display_chart` | Líneas con 2 puntos, arcoíris de barras, rojo en métricas neutras, donuts con >7 rebanadas |
| Bloqueo de rutas en `read_file`/`write_file` | Leer o escribir fuera del proyecto |

## Tips y gemas

- **Las tools corren en un carril de BD dedicado:** las consultas del agente no bloquean las tuyas.
- **`display_chart` piensa como periodista de datos:** elige el tipo por el mensaje y la forma del dato, no por el tipo de columna.
- **`validate_sql` no toca los datos:** solo planifica, ideal antes de una query pesada.
- **El *join-fanout* es tu amigo:** si aparece, añade `DISTINCT` o `GROUP BY` — el JOIN produjo más filas de las esperadas.
- **`write_file` en modo overwrite no guarda en disco:** carga la propuesta en el editor para que revises.

## Relacionado

- [Deep Dive](deep-dive.md) · [Asistente del editor](editor-assistant.md) · [Proveedores y modelos](providers-and-models.md)
- [Story Flow](../visualization/story-flow.md) · [Notebooks](../notebooks/notebooks.md)
- [Precisión y guardas](accuracy-and-guardrails.md) · [Modo prompt-only](prompt-only-mode.md)
