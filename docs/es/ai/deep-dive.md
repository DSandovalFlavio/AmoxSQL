# Deep Dive

**🌐 [English](../../en/ai/deep-dive.md) · Español**

> Tu analista autónomo: le das una pregunta de negocio y planifica, explora tu base de datos por su cuenta, narra los hallazgos y cierra con una tarjeta de conclusiones.

<!-- 📷 CAPTURE: docs/images/ai/deep-dive-overview.png — La ventana de Deep Dive con sus tres regiones: conversación a la izquierda, inspector de pasos en el centro y el inventario/plan de sesión a la derecha. -->

## Qué es

Deep Dive es el modo de IA de máxima autonomía. Vive en una **pestaña a pantalla completa** y trabaja sobre **toda la base de datos local**, no sobre un solo archivo. En lugar de responder una query, ejecuta un análisis: formula un plan, explora los datos paso a paso, verifica lo que encuentra y te lo cuenta como una historia.

La ventana tiene **tres regiones**:

1. **Conversación** — el hilo narrado: apertura, hallazgos por paso y cierre.
2. **Inspector de pasos** — por cada paso, el SQL legible, la tabla de resultado, los gráficos en línea y el razonamiento del agente.
3. **Inventario de sesión** — a la derecha, con el **panel del Plan**, el contexto de la conversación y los artefactos generados (gráficos, notebooks, análisis guardados).

## Cuándo usarlo

- Tienes una pregunta abierta de negocio: *"¿por qué cayó el churn?"*, *"encuentra los drivers de ingresos"*.
- Quieres un overview completo de un dataset que no conoces.
- Necesitas un notebook con el análisis narrado y sus gráficos.
- Para una ayuda puntual sobre la query que estás escribiendo, usa el [Asistente del editor](editor-assistant.md).

## Cómo usarlo

### Lanzar un análisis
1. Abre la pestaña **Deep Dive**.
2. Escribe tu pregunta (o usa una acción rápida del estado inicial: *Show all tables*, *Describe schema*, *Sample data*).
3. Envía. El agente crea un plan y empieza a ejecutar.

### Seguir el plan y los pasos
1. El **panel del Plan** (derecha) muestra los pasos con su estado (pendiente, en progreso, hecho, saltado).
2. Haz clic en cualquier paso o turno para **fijar** el inspector en él; si no fijas nada, el inspector sigue el paso en vivo.
3. En el inspector ves el SQL, el resultado y los gráficos de ese paso.

### Saltar pasos del plan
Al pasar el ratón sobre un paso aparece un botón para **saltarlo**; los pasos saltados se marcan como "skipped by user" y el agente sigue sin ellos.

### Preguntar sobre algo concreto ("Ask about this")
Puedes anclar cualquier gráfico, query, paso o hallazgo como contexto de tu siguiente pregunta:
1. Escribe **@** o **#** en el composer para elegir un artefacto de la sesión, **o**
2. Selecciona texto o un número en una respuesta y pulsa el botón flotante **Ask about this**.
3. Con la referencia adjunta aparecen acciones rápidas: **Explain**, **Redo differently**, **Go deeper**, **Validate**.

### Continuar cuando se agota el presupuesto
Deep Dive mide su trabajo en iteraciones. Si las agota sin cerrar, ofrece un banner con cuatro salidas:

| Botón | Qué hace |
|---|---|
| **Continuar** | Sigue con un presupuesto fresco |
| **Con instrucciones…** | Continúa enfocado según el texto que escribas |
| **Finalizar con lo que hay** | Fuerza la síntesis con lo ya recopilado |
| **Cancelar** | Detiene el análisis |

Si reabres una conversación cuyo plan quedó pausado, Deep Dive lo detecta y vuelve a ofrecerte continuar.

### Construir un notebook
Cuando lo pides (o cuando encaja en el análisis), el agente crea un notebook `.sqlnb` con el análisis y sus gráficos, y lo abre. Ver [Notebooks](../notebooks/notebooks.md).

## Referencia

### Las tres regiones

| Región | Contenido |
|---|---|
| Conversación | Narrativa con arco: apertura → hallazgo por paso → cierre |
| Inspector de pasos | SQL legible + tabla de resultado + gráficos + razonamiento |
| Inventario de sesión | Panel del Plan, contexto arrastrado, artefactos, nombre de sesión |

### Cómo narra (el arco)

| Fase | Qué hace el agente |
|---|---|
| Apertura | Con el plan, plantea la hipótesis y el enfoque |
| Por paso | Narra el hallazgo y por qué importa antes de marcarlo hecho |
| Verificación | Comprueba si un hallazgo es real o ruido |
| Cierre | La **NarrativeCard**: `tldr`, hallazgos con su *so_what*, causa probable, acciones y salvedades |

### Salud del proceso

| Mecanismo | Qué garantiza |
|---|---|
| Presupuesto de iteraciones | El plan dimensiona cuántas iteraciones tiene el análisis |
| Turno de cierre garantizado | Si se agota, fuerza una síntesis en vez de quedar colgado |
| Watchdog anti-atasco | Si un paso se congela, aborta esa iteración y reanuda |
| Prosa primero | Nunca deja el chat con una tarjeta pelada sin narrativa |

## Tips y gemas

- **La NarrativeCard abre expandida:** los hallazgos, el "¿por qué?" y las salvedades se ven sin clics.
- **@ y # son tu mando a distancia:** referencia por nombre cualquier chart/query/paso sin buscarlo.
- **"Finalizar con lo que hay" existe por algo:** si ya tienes suficiente, no hace falta gastar más iteraciones.
- **Los artefactos se guardan solos:** cada gráfico, notebook o análisis aparece en el inventario de la sesión.
- **Fija un paso para estudiarlo:** haz clic en él y el inspector deja de saltar al paso en vivo.

## Relacionado

- [Asistente del editor](editor-assistant.md) · [Herramientas del agente](agent-tools.md) · [Proveedores y modelos](providers-and-models.md)
- [Skills](skills.md) · [Contexto como código](context-as-code.md) · [Memoria](memory.md)
- [Notebooks](../notebooks/notebooks.md) · [Story Flow](../visualization/story-flow.md)
