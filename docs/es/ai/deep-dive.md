# Deep Dive

**🌐 [English](../../en/ai/deep-dive.md) · Español**

> Tu analista autónomo: le das una pregunta de negocio y planifica, explora tu base de datos por su cuenta, narra los hallazgos y cierra con una tarjeta de conclusiones.

<!-- 📷 CAPTURE: docs/images/ai/deep-dive-overview.png — Deep Dive como informe: el índice a la izquierda, la respuesta arriba y cada paso con su gráfico, y «How I got this» abierto a la derecha. -->

## Qué es

Deep Dive es el modo de IA de máxima autonomía. Vive en una **pestaña a pantalla completa** y trabaja sobre **toda la base de datos local**, no sobre un solo archivo. En lugar de responder una query, ejecuta un análisis: formula un plan, explora los datos paso a paso, verifica lo que encuentra y te lo cuenta como una historia.

Se lee como **un informe que se escribe solo**:

1. **El informe**, en una columna de lectura: tu pregunta, la **respuesta** arriba en cuanto existe y, debajo, **How I got there**: cada paso del plan con su narración, sus gráficos y su conclusión.
2. **El índice**, a la izquierda: el plan. Cada paso lleva a su sección y muestra su estado. Debajo, los entregables: los gráficos de la sesión, sus notebooks, guardar como notebook y exportar a Markdown.
3. **How I got this**, bajo demanda a la derecha: las consultas de una parte del informe con sus filas, lo demás que hizo el analista y su razonamiento ahí.

## Cuándo usarlo

- Tienes una pregunta abierta de negocio: *"¿por qué cayó el churn?"*, *"encuentra los drivers de ingresos"*.
- Quieres un overview completo de un dataset que no conoces.
- Necesitas un notebook con el análisis narrado y sus gráficos.
- Para una ayuda puntual sobre la query que estás escribiendo, usa el [Asistente del editor](editor-assistant.md).

## Cómo usarlo

### Lanzar un análisis
1. Abre la pestaña **Deep Dive**.
2. Escribe tu pregunta, o elige una de las que propone: salen de las métricas de tu proyecto (`context/metrics.yml`), su glosario y sus columnas, en el idioma del proyecto, y cada una dice de dónde sale. Debajo se ven las tablas que puede mirar y, para el analista, *See the tables* y *Profile the data*.
3. Envía. El agente crea un plan y empieza a ejecutar.

### Leer el análisis
1. Mientras trabaja, cada paso aparece en el informe con lo que va encontrando, y el encabezado dice en qué paso va (*Analyzing · step 2 of 4*). **Stop** lo detiene.
2. Al terminar, la **respuesta** sube arriba: la conclusión, de qué sale (pasos hechos, consultas, gráficos, salvedades), los hallazgos con su valor y qué hacer después.
3. El **índice** muestra los pasos numerados con su estado (pendiente, en progreso, hecho, saltado, no hecho). Un paso al que el analista no llegó antes de concluir dice **Not done**, nunca hecho. Haz clic en un paso para ir a su sección.

### Ver cómo lo obtuvo
- **How I got this**, en una sección, abre a la derecha sus consultas (el SQL, las filas, *Open in editor*, CSV) y el razonamiento del analista en esa parte.
- La lupa junto a un valor de la respuesta, o una cita en el texto, abre directamente la consulta que produjo ese número.
- **See the data**, en una línea de consultas, hace lo mismo. **Esc** cierra el panel.

### Dirigirlo mientras trabaja
- **Una indicación:** escribe en la caja mientras analiza (*Give the analyst an instruction…*) y pulsa Enter. La toma en el paso siguiente y queda en el informe donde la tomó. Con la caja vacía, el botón es **Stop**.
- **Saltar un paso:** al pasar el ratón sobre un paso pendiente del índice aparece **Skip**, también mientras corre.
- **Pause** termina el paso en curso y se detiene; **Continue** retoma el mismo plan. **Stop** corta en el acto; lo hecho se conserva igual.
- Mientras trabaja, el informe dice qué está haciendo y desde hace cuánto (*Running a query… 4 s*).

### Preguntar sobre algo concreto ("Ask about this")
Puedes anclar cualquier gráfico, query, paso o hallazgo como contexto de tu siguiente pregunta:
1. Escribe **@** o **#** en el composer para elegir un artefacto de la sesión, **o**
2. Selecciona texto o un número en una respuesta y pulsa el botón flotante **Ask about this**.
3. Con la referencia adjunta aparecen acciones rápidas: **Explain**, **Redo differently**, **Go deeper**, **Validate**.

### Cuando el analista te necesita
Si el analista te pregunta algo, o se queda sin iteraciones, aparece una tarjeta **justo encima de la caja donde escribes**. Elige una opción o escribe tu respuesta en la caja. La pestaña de la sesión muestra un punto ámbar y la lista de conversaciones dice **Waiting for you**, para que lo notes desde cualquier lado. Si reabres la conversación más tarde, la tarjeta sigue ahí.

Si se quedó sin iteraciones, la tarjeta ofrece cuatro formas de seguir:

| Botón | Qué hace |
|---|---|
| **Continue** | Sigue con un presupuesto fresco |
| **Continue with instructions…** | Continúa enfocado según el texto que escribas |
| **Finish with what it has** | Escribe las conclusiones con lo que ya tiene, sin consultas nuevas |
| **Leave it here** | Deja el análisis como está |

### Si la API falla a la mitad
- **Un límite por minuto** (la capa gratuita de Gemini permite 5 solicitudes por minuto): el análisis espera lo que pide el proveedor y repite el paso. El encabezado dice *Waiting for the quota · resumes in 31 s*. No tienes que hacer nada; **Stop** lo detiene.
- **Si aun así se corta** (cuota diaria, error del proveedor, Stop o la ventana que se cierra), lo hecho se conserva: los pasos terminados con sus gráficos siguen en el informe y una línea dice dónde y por qué se cortó. Encima de la caja aparece la tarjeta para seguir. Con una cuota por minuto, **Continue in 31 s** sigue solo al llegar a cero si lo pulsas. Con una cuota diaria, elige otro modelo en la caja y continúa. El error del proveedor está en **Details**.
- Continuar retoma el mismo plan donde quedó, no lo empieza de nuevo.

### Ver el SQL sin abrir nada
**Technical detail**, en el encabezado, pone el SQL de cada consulta y sus filas dentro de cada paso. Es para quien quiere auditarlo todo de un vistazo; se recuerda la próxima vez.

### Llevarlo a una presentación
**Send to Report Flow**, en el índice, crea un deck en `reports/`: la pregunta y la respuesta de portada, un resumen con los hallazgos, una lámina por gráfico (con la conclusión del paso como título), los siguientes pasos y las salvedades. Cada gráfico se guarda como `.amoxvis` en `charts/deep-dive/` con su consulta, así **Refresh all** lo actualiza. Desde Report Flow se exporta a PowerPoint o Word.

### Construir un notebook
Cuando lo pides (o cuando encaja en el análisis), el agente crea un notebook `.sqlnb` con el análisis y sus gráficos, y lo abre. Ver [Notebooks](../notebooks/notebooks.md).

## Referencia

### Las tres zonas

| Zona | Contenido |
|---|---|
| Índice | Tus preguntas, la respuesta, los pasos del plan con su estado, los entregables |
| Informe | Pregunta → respuesta → cada paso con su narración, gráficos y conclusión → la caja de texto |
| How I got this | Bajo demanda: consultas, filas y razonamiento de una parte del informe |

Si la ventana es estrecha, la barra lateral se pliega sola al abrir Deep Dive (vuelve con su botón o **Ctrl+B**) y **How I got this** se abre encima del informe.

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
- **"Finish with what it has" existe por algo:** si ya tienes suficiente, no hace falta gastar más iteraciones.
- **Los entregables están en el índice:** cada gráfico de la sesión lleva a donde está en el informe, y desde ahí se abre en Story Flow.
- **Al reabrir un análisis terminado** llegas directamente a su respuesta.

## Relacionado

- [Asistente del editor](editor-assistant.md) · [Herramientas del agente](agent-tools.md) · [Proveedores y modelos](providers-and-models.md)
- [Skills](skills.md) · [Contexto como código](context-as-code.md) · [Memoria](memory.md)
- [Notebooks](../notebooks/notebooks.md) · [Story Flow](../visualization/story-flow.md)
