# Proveedores y modelos

**🌐 [English](../../en/ai/providers-and-models.md) · Español**

> Elige quién piensa por ti: un modelo local con Ollama (privado) o uno en la nube. El *tier* del modelo decide qué puede hacer la IA.

<!-- 📷 CAPTURE: docs/images/ai/settings-ai-providers.png — La pestaña Ajustes → IA con el selector de proveedor, la clave de API y el modelo por defecto. -->

## Qué es

AmoxSQL no está atado a un solo motor de IA. Puedes conectar un modelo **local** (con Ollama, sin que nada salga de tu equipo) o un proveedor de **nube** con tu API key. Todo se configura en **Ajustes → IA**: el proveedor, las claves y el modelo por defecto.

Cada modelo se clasifica en un **tier** (low / medium / high / cloud) que determina sus capacidades — tool-calling, gráficos, notebooks, memoria, razonamiento — y cuánto contexto maneja. No tienes que memorizarlo: la IA se adapta al modelo que elijas.

## Cuándo usar cada camino

- **Ollama (local)** cuando la privacidad importa o no quieres depender de internet ni de una clave.
- **Nube** cuando quieres el máximo de capacidad y ventana de contexto para análisis grandes.
- Si no tienes ninguno, existe el camino de [Skills externas](introduction.md) para pegar el contexto en un chat de IA cualquiera.

## Cómo usarlo

### Configurar un modelo local (Ollama)
1. Instala Ollama y ábrelo.
2. En **Ajustes → IA**, elige el proveedor **Ollama**.
3. Descarga un modelo desde el propio IDE (la lista muestra los instalados y permite bajar más).
4. Selecciónalo como **modelo por defecto**.

### Configurar un proveedor de nube
1. En **Ajustes → IA**, elige el proveedor (Gemini, Anthropic, OpenAI o MiniMax).
2. Pega tu **API key**. Para Google Vertex, configura proyecto/ubicación (usa credenciales ADC).
3. Elige el modelo por defecto de la lista descubierta en vivo.

### Cambiar de modelo sobre la marcha
El selector de modelo del composer (tanto en el Asistente como en Deep Dive) te deja cambiar de modelo por conversación.

### Usar un modelo nuevo ("Custom Model…")
Si el proveedor lanzó un modelo que aún no está en la lista, usa **Custom Model…** y escribe su identificador exacto. AmoxSQL le asignará capacidades por su nombre.

## Referencia

### Proveedores

| Proveedor | Tipo | Autenticación |
|---|---|---|
| **Ollama** | Local | Ninguna — corre en tu equipo; descarga de modelos desde el IDE |
| **Google Gemini** | Nube | API key **o** Vertex/ADC |
| **Anthropic** | Nube | API key |
| **OpenAI** | Nube | API key |
| **Google Vertex** | Nube | Proyecto + ubicación (credenciales ADC) |
| **MiniMax** | Nube | API key (modelos M con razonamiento avanzado siempre activo) |

### Tiers de modelo y capacidades

| Tier | Ejemplos | Tools | Gráficos | Notebooks | Pasos |
|---|---|---|---|---|---|
| **low** (<3B) | phi3:mini, gemma3:1b | No | No | No | 1 (prompt-only) |
| **medium** | qwen3:8b, llama3.1:8b | Sí | Sí | Sí | 5 |
| **high** (20B+) | qwen3:32b, gpt-oss:20b | Sí | Sí | Sí | 10 |
| **cloud** | Gemini, Anthropic, OpenAI, MiniMax | Sí | Sí | Sí | 15 |

Las capacidades (`supportsToolCalling`, `supportsCharts`, `supportsNotebooks`, `supportsMemory`, razonamiento) y el tamaño de contexto se derivan del tier. Los modelos low caen al [modo prompt-only](prompt-only-mode.md).

### Razonamiento (thinking)

Algunos modelos exponen su razonamiento. En los **modelos M de MiniMax** el razonamiento avanzado está **siempre activo** y se muestra en el inspector de [Deep Dive](deep-dive.md). En los modelos locales de Ollama puedes activarlo/desactivarlo **por modelo (Auto / Activado / Desactivado)** — ver [Rendimiento de la IA local](rendimiento-local.md), porque el razonamiento cambia calidad por latencia.

## Tips y gemas

- **Descarga modelos sin salir del IDE:** la gestión de modelos de Ollama vive en Ajustes → IA.
- **El seguimiento de uso** te muestra el consumo de tokens de los proveedores de nube.
- **Custom Model… es una vía de escape:** úsala en cuanto salga un modelo nuevo, sin esperar a una actualización.
- **Puedes forzar el tier:** si crees que un modelo está mal clasificado, un override de tier en la config lo ajusta.
- **Contexto = tier:** los modelos de nube manejan ventanas mucho mayores, ideales para bases grandes.

## Relacionado

- [La IA de AmoxSQL](introduction.md) · [Herramientas del agente](agent-tools.md) · [Modo prompt-only](prompt-only-mode.md)
- [Rendimiento de la IA local](rendimiento-local.md) — mantén rápidos los modelos locales
- [Deep Dive](deep-dive.md) · [Asistente del editor](editor-assistant.md)
- [Configuración](../reference/configuration.md)
