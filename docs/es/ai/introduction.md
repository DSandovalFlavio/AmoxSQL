# La IA de AmoxSQL

**🌐 [English](../../en/ai/introduction.md) · Español**

> Un analista de datos dentro del IDE: le hablas en lenguaje natural, él escribe y ejecuta DuckDB SQL sobre tus datos. Funciona local-first (con Ollama) o en la nube.

<img src="../../../images/07_ai_sidebar.png" alt="La IA de AmoxSQL" width="100%" />

## Qué es

La IA de AmoxSQL convierte preguntas en lenguaje natural en SQL de DuckDB, lo ejecuta contra tus tablas y archivos, y te devuelve la respuesta con números, tablas y gráficos. No es un chatbot genérico: conoce tu esquema, sigue las reglas de tu proyecto y trabaja sobre el motor local.

Vive en **dos superficies** con niveles distintos de autonomía:

- **Asistente del editor** — una barra lateral compacta (Ctrl+L) ligada al archivo `.sql` o `.sqlnb` abierto. Genera, explica y optimiza la query actual, propone ediciones y gráficos. Tú conduces; él ayuda. Ver [Asistente del editor](editor-assistant.md).
- **Deep Dive** — un analista autónomo a pantalla completa sobre **toda** la base de datos local. Planifica los pasos, explora por su cuenta, narra los hallazgos y puede construir un notebook. Ver [Deep Dive](deep-dive.md).

Hay además un **tercer camino sin modelo local ni clave**: descarga una *Skill* de AmoxSQL y el contexto *Metadata para IA* de tus datos, y pégalos en cualquier chat de IA externo que uses. Así aprovechas la IA aunque no tengas Ollama ni una API key configurada.

## Cuándo usarla

- **Asistente** cuando estás escribiendo SQL o ajustando un gráfico y quieres una mano concreta ("¿por qué esta query da 0 filas?", "grafica esto por región").
- **Deep Dive** cuando tienes una pregunta de negocio y quieres el análisis completo hecho por ti ("¿por qué cayeron las ventas en Q3?", "dame un overview de este dataset").
- **Camino externo** cuando no puedes instalar un modelo local ni pagar una API, pero sí tienes acceso a un chat de IA en el trabajo.

## Cómo empezar

1. Abre **Ajustes → IA** (ver [Configuración](../reference/configuration.md)) y elige un camino:
   - **Local (privado):** instala Ollama y descarga un modelo desde el propio IDE. Ver [Proveedores y modelos](providers-and-models.md).
   - **Nube:** pega una API key (Google Gemini, Anthropic, OpenAI o MiniMax) o configura Google Vertex.
2. Elige el **proveedor** y el **modelo por defecto** en esa misma pantalla.
3. Abre una superficie:
   - **Asistente:** botón **Assist** de la barra del editor, o **Ctrl+L**.
   - **Deep Dive:** su pestaña dedicada.
4. Escribe tu pregunta en lenguaje natural y envía. La IA mira tu esquema, escribe DuckDB SQL, lo ejecuta y responde.

> **¿Sin modelo local ni clave?** Ve a **Ajustes → IA → External AI Skills**, descarga una Skill (`.md`), súbela a tu chat de IA como instrucción, y usa **Metadata para IA** (menú Export del editor o toolbar de resultados) para copiar el contexto de tus datos y pegarlo en el chat.

## Referencia

### Las dos superficies

| Superficie | Dónde | Alcance | Autonomía |
|---|---|---|---|
| **Asistente del editor** | Barra lateral (Ctrl+L) | El archivo abierto | Reactivo — tú conduces |
| **Deep Dive** | Pestaña a pantalla completa | Toda la base de datos | Autónomo — planifica y explora |

### Qué necesitas para arrancar

| Camino | Requisito | Privacidad |
|---|---|---|
| Local | Ollama + un modelo descargado | Nada sale de tu equipo |
| Nube | API key (Gemini/Anthropic/OpenAI/MiniMax) o Vertex/ADC | Las queries van al proveedor |
| Externo | Un chat de IA cualquiera + Skill descargable + Metadata para IA | Tú controlas qué pegas |

## Tips y gemas

- **Local es privado de verdad:** con un modelo de Ollama, ni tus datos ni tus preguntas salen de tu máquina — el motor y el modelo corren en local.
- **Promueve una conversación:** puedes escalar un chat del Asistente a Deep Dive sin perder el contexto.
- **Arrastra contexto:** suelta una tabla o un archivo sobre el chat para que la IA lo tenga presente.
- **Los números citan su fuente:** en la prosa, los valores enlazan a la query que los produjo (clic → "Source Query").
- **El tier del modelo manda:** modelos pequeños (<3B) usan un [modo prompt-only](prompt-only-mode.md) más simple; los medianos y de nube desbloquean tools, gráficos y notebooks.

## Relacionado

- [Asistente del editor](editor-assistant.md) · [Deep Dive](deep-dive.md)
- [Proveedores y modelos](providers-and-models.md) · [Herramientas del agente](agent-tools.md)
- [Modo prompt-only](prompt-only-mode.md) · [Metadata para IA](metadata-for-ai.md)
- [Skills](skills.md) · [Contexto como código](context-as-code.md) · [Memoria](memory.md)
