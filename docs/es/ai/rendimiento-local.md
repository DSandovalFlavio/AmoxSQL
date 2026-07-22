# Rendimiento de la IA local

**🌐 [English](../../en/ai/local-performance.md) · Español**

> Que un modelo local con Ollama responda casi al instante: el modelo caliente en memoria, el contexto justo y el razonamiento bajo tu control. Aquí está todo lo que mueve la aguja.

## Qué es

Un modelo local con [Ollama](providers-and-models.md) corre en tu equipo, así que su velocidad depende de tu hardware y de cómo se le hable. AmoxSQL está afinado para exprimir ese rendimiento: mantiene el modelo cargado, le envía sólo el contexto necesario, reutiliza lo ya procesado y te deja apagar el razonamiento cuando no lo necesitas.

Dos cosas dominan la latencia local:

1. **La carga del modelo a memoria** — la primera vez que usas un modelo (o tras un rato sin usarlo) hay que subir sus pesos a memoria. Es el "arranque en frío" que se siente al cambiar de modelo.
2. **El procesamiento del prompt de entrada** — antes de escribir el primer token, el modelo "lee" todo lo que le mandas. Cuanto más largo el prompt, más tarda — y en CPU eso pesa mucho.

AmoxSQL ataca las dos.

## Cuándo prestarle atención

- El primer mensaje tras **cambiar de modelo** tarda mucho → es la carga a memoria (ver *warm-up*).
- Notas la IA más lenta en AmoxSQL que en la terminal de Ollama → suele ser contexto de más o razonamiento activado.
- Vas a usar **Deep Dive** sobre una base grande → conviene un modelo potente (y ver la nota de idoneidad).
- Tu equipo tiene poca **VRAM** (GPU) → el modelo puede derramar a CPU y volverse lento (el indicador te avisa).

## Cómo usarlo

### El indicador de estado del modelo

Junto al selector de modelo (en el Asistente y en Deep Dive) hay un punto de color:

| Punto | Significado |
|---|---|
| ● verde | **Caliente** — el modelo está en memoria (idealmente en VRAM). Respuesta casi instantánea. |
| ◐ ámbar | **Cargado pero en CPU** — parte del modelo no cupo en la VRAM y corre en CPU. Funciona, pero más lento. |
| ○ gris | **Frío** — no está cargado. El primer mensaje pagará la carga. |

Al seleccionar un modelo, AmoxSQL lo **precarga en segundo plano** (warm-up) mientras escribes tu pregunta, para que llegue caliente al primer mensaje.

### Razonamiento (thinking) por modelo

El "pensamiento" de un modelo mejora respuestas complejas, pero añade latencia: el modelo escribe un monólogo interno **antes** de responderte. En **Ajustes → IA → Rendimiento AI local** controlas esto por modelo:

- **Auto** — usa el default recomendado para ese modelo (para la familia qwen y ornith, Auto lo deja **apagado** en el flujo de herramientas, porque el pensamiento invisible es latencia pura).
- **Activado** — fuerza el razonamiento (útil para análisis difíciles).
- **Desactivado** — respuesta directa, sin monólogo previo.

Algunos modelos (como lfm2.5) **razonan siempre por diseño** y aparecen como "Siempre activo" (sin control).

### Modelo por modo

El **Asistente del editor** y **[Deep Dive](deep-dive.md)** recuerdan **su propio modelo**. La idea: un modelo pequeño y rápido para el Asistente (que sólo ve tu query activa), y uno más potente para Deep Dive (que explora toda la base). Elige el modelo en el selector de cada panel y cada uno guarda el suyo.

Si entras a Deep Dive con un modelo pequeño (<15B), verás un aviso suave: funcionará, pero un modelo local ≥25B o uno de nube da análisis mucho más profundos. Es una recomendación, nunca un bloqueo.

### Ajustes de runtime

En **Ajustes → IA → Rendimiento AI local**:

- **Modelo en memoria (keep-alive)** — cuánto se queda cargado tras usarlo. Por defecto `4h`, así no hay recargas entre consultas. `-1` = siempre; `30m`, `2h`, etc.
- **Ventana de contexto (num_ctx)** — tokens de contexto por modelo. `0` = automático (8k para modelos pequeños, 16k para el resto). Súbelo sólo si cabe en tu VRAM.
- **Extracción de memorias** — analizar cada conversación para recordar preferencias usa una llamada extra al modelo. En local compite por el único "slot" de Ollama, así que el default (**Solo en la nube**) la evita para modelos locales.

## Referencia

### Elegir modelo según tu hardware

| Tu equipo | Recomendado | Evita para uso fluido |
|---|---|---|
| GPU con **≥8 GB VRAM** | qwen3.5:9b, ornith:9b, gemma4:e4b caben en VRAM y vuelan | — |
| GPU con **2–4 GB VRAM** | lfm2.5, gemma4:e2b, qwen3.5:2b (pocos parámetros activos) | modelos densos de 9B+ (derraman a CPU) |
| **Sólo CPU** | lfm2.5 (≈1B activos), gemma4:e2b | modelos de 7B+ densos |

lfm2.5 y gemma4:e2b están pensados para ir rápido incluso sin GPU potente. Los modelos densos de 9B+ brillan cuando caben enteros en VRAM.

### Sacar el máximo de Ollama (fuera de AmoxSQL)

Estas mejoras viven en tu instalación de Ollama, no en AmoxSQL, pero se notan mucho:

- **Actualiza Ollama** a la última versión. Las versiones recientes reutilizan mejor lo ya procesado entre mensajes (cache de prefijo) y activan *flash attention* en más GPUs — de las mejoras de mayor impacto y coste cero.
- **`OLLAMA_FLASH_ATTENTION=1`** — atención más rápida y menos memoria al crecer el contexto.
- **`OLLAMA_KV_CACHE_TYPE=q8_0`** — reduce a la mitad la memoria del cache con pérdida de calidad despreciable (requiere flash attention).

Se configuran como variables de entorno del sistema antes de arrancar Ollama.

## Tips y gemas

- **Deja que se caliente:** al abrir el panel de IA o cambiar de modelo, AmoxSQL ya lo está precargando. Si el punto está en ○, espera a que pase a ● antes de mandar el primer mensaje.
- **Apaga el thinking para respuestas rápidas:** en tareas de SQL directo, "Desactivado" quita el monólogo previo y respondes antes.
- **Un modelo por modo:** pon lfm2.5 o gemma4:e2b en el Asistente y reserva el modelo grande para Deep Dive.
- **Vigila el punto ámbar:** si un modelo aparece ◐ (en CPU), estás pagando lentitud — prueba uno más pequeño o sube tu VRAM.
- **keep-alive largo = sin arranques en frío:** el default de 4h mantiene el modelo listo durante toda tu sesión.

## Relacionado

- [Proveedores y modelos](providers-and-models.md) · [La IA de AmoxSQL](introduction.md)
- [Asistente del editor](editor-assistant.md) · [Deep Dive](deep-dive.md)
- [Modo prompt-only](prompt-only-mode.md) · [Memoria](memory.md)
- [Configuración](../reference/configuration.md)
