# Precisión y salvaguardas

**🌐 [English](../../en/ai/accuracy-and-guardrails.md) · Español**

> Por qué puedes fiarte de los números: AmoxSQL rodea a la IA de comprobaciones automáticas que detectan gráficos engañosos, joins que inflan totales y cifras inventadas — y corrigen o avisan antes de que lleguen a ti.

<!-- 📷 CAPTURE: docs/images/ai/guardrails-caveat.png — Respuesta de la IA mostrando un aviso de "cifra no verificada" y una advertencia de fan-out en el resultado de una query -->

## Qué es

Un modelo de lenguaje, por sí solo, puede equivocarse con confianza: elegir un gráfico que engaña, sumar sobre un join mal hecho, o citar un número que no salió de ninguna query. AmoxSQL no confía ciegamente en la IA: la envuelve en una serie de **salvaguardas** que verifican su trabajo contra el motor local y contra tus resultados reales.

Algunas **corrigen** en silencio (una línea de tendencia que no tiene sentido se elimina antes de dibujarla). Otras **avisan** — a la IA, para que rectifique, o a ti, con una advertencia visible. El objetivo es simple: que los números que ves resistan un segundo vistazo.

## Cuándo aplica

- En **cualquier** conversación con la IA (Asistente o Deep Dive) que ejecute SQL o genere gráficos.
- No tienes que activar nada: las salvaguardas corren solas. Esta página explica **qué** hacen para que sepas qué significan los avisos cuando aparecen.

## Cómo funciona

### Verificación de hallazgos (cifras inventadas)
Cuando la IA cierra con hallazgos que citan cifras ("+41%", "$50k"), AmoxSQL comprueba que esos números **aparezcan de verdad** en los resultados de las queries que ejecutó (con una tolerancia por redondeo). Si una cifra no se puede verificar, se añade un **aviso** para que la revises antes de actuar. No bloquea la respuesta — solo la marca.

### Detección de fan-out en joins (totales inflados)
Un JOIN cuya llave no es única en el lado derecho duplica filas y **infla** silenciosamente los `SUM`, `AVG` y `COUNT`. Tras cada query con JOIN, AmoxSQL compara el número de filas del resultado con el de las tablas base; si el resultado es mucho mayor de lo esperado, emite una **advertencia de fan-out** sugiriendo `DISTINCT`, agrupar antes de unir, o verificar la unicidad de la llave.

### Linters de gráficos (visualizaciones engañosas)
Al construir un gráfico, AmoxSQL revisa decisiones que engañan al lector y las corrige o las señala:
- **Línea de tendencia sin sentido:** se elimina si se calcularía sobre varias series (promediaría series no relacionadas).
- **Ranking arcoíris:** pintar cada barra de un color distinto oculta el orden — sugiere un color único con énfasis en el líder.
- **Paleta secuencial en barras sin ordenar:** una escala de intensidad implica magnitud ordenada; avisa si las barras no están ordenadas por valor.
- **Rojo en una métrica neutral:** el rojo lee como alarma; se reserva para pérdidas/churn/bajo meta, no para revenue o volumen.
- **Donut con demasiadas rebanadas (>7):** ilegible — sugiere un ranking de barras.

### Autocorrección de SQL
Si una query falla (por ejemplo, un nombre de tabla mal escrito), la IA **no se rinde**: recibe el error y una directiva para verificar los nombres con `list_tables` y reintentar. Reintenta hasta 3 veces antes de reportar el problema.

### Vigilante de bloqueos (stall watchdog)
Si el flujo de la IA se **congela** (un proveedor deja de responder), un vigilante lo detecta tras un período de silencio, aborta esa iteración y **reanuda** el análisis desde donde iba, en vez de dejarte con un spinner eterno.

### Contexto de renderizado (colores que se leen)
La IA conoce tu **tema y color de acento activos** (claro/oscuro). Así elige paletas de gráfico que se lean bien sobre tu fondo real y armonicen con tu acento, en lugar de colores que se pierden o chocan. Ver [Temas y apariencia](../user-guide/themes-and-appearance.md).

### Prompt caching (velocidad y costo)
Con proveedores compatibles (Anthropic), la parte estable de las instrucciones de la IA se **cachea**, de modo que los turnos siguientes son más rápidos y baratos. No cambia las respuestas; solo el rendimiento.

## Referencia

| Salvaguarda | Qué previene | Corrige o avisa |
|---|---|---|
| Verificación de hallazgos | Cifras que no salieron de una query | Avisa (caveat visible) |
| Detección de fan-out | Totales inflados por joins duplicadores | Avisa (en el resultado) |
| Linter de línea de tendencia | Tendencia sobre series no relacionadas | Corrige (la elimina) |
| Linters de color/formato | Gráficos que engañan al lector | Avisa (la IA rectifica) |
| Autocorrección de SQL | Quedarse atascado en un error de query | Corrige (reintenta ≤3) |
| Vigilante de bloqueos | Streams congelados / spinners eternos | Corrige (reanuda) |
| Contexto de renderizado | Colores ilegibles en tu tema | Previene (elige mejor) |
| Prompt caching | Turnos lentos/caros | Optimiza |

## Tips y gemas

- **Un aviso no significa "está mal", significa "revísalo".** La verificación de hallazgos es conservadora: marca lo que no pudo confirmar, no lo que es falso.
- **La advertencia de fan-out es de las más valiosas.** Un total inflado por un join es de los errores más difíciles de ver a ojo; que la app lo cace te ahorra conclusiones equivocadas.
- **Los linters de gráficos empujan hacia un buen diseño**, alineado con [Story Flow](../visualization/story-flow.md): un color por ranking, rojo solo para lo negativo, nada de donuts con 12 rebanadas.
- **Combínalas con el [contexto como código](context-as-code.md)** para el máximo de precisión: las salvaguardas atrapan errores; el contexto evita que ocurran al fijar métricas y joins correctos.

## Relacionado

- [Herramientas del agente](agent-tools.md) · [Contexto como código](context-as-code.md) · [Deep Dive](deep-dive.md)
- [Story Flow](../visualization/story-flow.md) · [Temas y apariencia](../user-guide/themes-and-appearance.md)
