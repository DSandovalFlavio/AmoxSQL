# Memoria

**🌐 [English](../../en/ai/memory.md) · Español**

> La IA recuerda tus preferencias y los hechos de tu negocio de una conversación a la siguiente — para que no tengas que repetir "los montos están en centavos" o "prefiero gráficos de barras" cada vez.

<!-- 📷 CAPTURE: docs/images/ai/memories-panel.png — Panel AI Memories mostrando una lista de memorias con badges "Rule" y "Fact", con botones de editar y borrar -->

## Qué es

La **memoria** es el recuerdo transversal de la IA. Al terminar cada turno, un proceso ligero en segundo plano lee la conversación y extrae dos tipos de dato que puedan servir en el futuro:

- **Reglas** (`global_rule`) — cómo quieres que la IA se comporte o formatee su salida ("responde en español", "siempre muestra el SQL", "prefiero cifras compactas").
- **Hechos** (`personal_fact`) — datos sobre ti, tu empresa o los matices de tu esquema ("los montos están en centavos", "la tabla `orders` excluye pedidos de prueba con `customer_id < 4`").

Esas memorias se guardan y se inyectan en las instrucciones de la IA en conversaciones **posteriores** (aunque sean de temas distintos), así no vuelves a explicar lo mismo. Se gestionan en el panel de **AI Memories**, donde puedes ver, editar y borrar cada una.

La extracción corre en segundo plano y no bloquea la respuesta. Solo se procesa cuando hubo mensajes recientes tuyos, para no gastar llamadas de más.

## Cuándo usarlo

- Cuando notas que **repites** las mismas instrucciones a la IA en cada sesión.
- Cuando tu esquema tiene **matices** que la IA debe recordar siempre pero que no quieres codificar en `RULES.md`.
- Si prefieres una definición formal y compartida por el equipo, usa mejor [Contexto como código](context-as-code.md): la memoria es personal y se aprende sola; el contexto es explícito y versionable.

## Cómo usarlo

### Dejar que aprenda
1. Conversa con la IA con normalidad. Cuando digas algo tipo "de ahora en adelante muéstrame siempre el SQL" o "los montos están en centavos", quedará como candidato a memoria.
2. Al cerrar el turno, la IA extrae reglas y hechos en segundo plano y los guarda.
3. En la siguiente conversación esos recuerdos ya forman parte de su contexto, sin que hagas nada.

### Gestionar las memorias
1. Abre el panel **AI Memories**.
2. Cada entrada muestra un badge (**Rule** o **Fact**) y su contenido.
3. Usa el lápiz para **editar** el texto o cambiar su categoría; usa la papelera para **borrar** una memoria que ya no aplica.
4. El botón de refrescar recarga la lista.

## Referencia

| Categoría | Badge | Qué captura | Ejemplo |
|---|---|---|---|
| `global_rule` | Rule | Preferencias de comportamiento/formato | "Responde siempre en español" |
| `personal_fact` | Fact | Hechos sobre ti o tus datos | "`amount` está en centavos MXN" |

| Acción | Dónde | Efecto |
|---|---|---|
| Ver | Panel AI Memories | Lista todas las memorias activas |
| Editar | Icono de lápiz | Cambia el texto o la categoría |
| Borrar | Icono de papelera | Elimina la memoria (deja de inyectarse) |
| Refrescar | Icono de refrescar | Recarga la lista desde la base de datos |

## Tips y gemas

- **Requiere un modelo capaz.** La memoria está disponible desde el tier medio hacia arriba (modelos con soporte de herramientas). Los modelos locales muy pequeños no la extraen. Ver [Proveedores y modelos](providers-and-models.md).
- **Todo se guarda en local.** Las memorias viven en la base de datos DuckDB de tu proyecto (esquema `amoxsql_ai`), nunca salen de tu máquina. Ver [Local-first](../concepts/local-first.md).
- **Edítala cuando cambie la realidad.** Si una regla deja de aplicar, bórrala o reescríbela desde el panel — es más rápido que "des-enseñársela" en un chat.
- **Memoria vs. contexto:** la memoria se aprende sola y es tuya; el [contexto como código](context-as-code.md) es explícito, revisable y compartido por el equipo. Úsalos juntos.

## Relacionado

- [Contexto como código](context-as-code.md) · [Deep Dive](deep-dive.md) · [Skills](skills.md)
- [Proveedores y modelos](providers-and-models.md) · [Local-first](../concepts/local-first.md)
