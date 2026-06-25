# Deep Dive — Modelo de interacción humano ↔ agente analista

Si el agente es un **analista de datos**, una sesión no es de una sola vía (pides → entrega). Es una **conversación sobre artefactos**: el analista humano debe poder **señalar** cualquier cosa que el agente produjo (un gráfico, una query, un número, un paso, un hallazgo) y **conversar sobre eso**. Este doc plantea las 50 formas de interacción posibles y qué falta.

Leyenda: ✅ posible hoy · ⚠️ parcial / indirecto · ❌ falta

## Parte 1 — ¿El agente comunica bien sus resultados, paso a paso?

Sí, ya en gran parte (tras el rediseño): hilo conversacional limpio, inspector **dividido por fases del plan**, cada fase con **💡 conclusión**, SQL+tabla, gráficos inline y razonamiento desagrupado; síntesis final en el chat. Eso cubre el "explica paso por paso lo que fuiste haciendo". ✅

**Lo que falta es la otra mitad: poder responderle al agente señalando un artefacto.** Hoy, para preguntar por un gráfico tienes que **describirlo con palabras** ("el de ciudades…"); no puedes *apuntarlo*. Esa es la brecha central de interacción.

## Parte 2 — El concepto clave: **referencia (deixis) sobre artefactos**

Todo lo que el agente produce debería ser **direccionable y mencionable**: gráfico, query, número/celda, paso del plan, hallazgo, tabla/columna, notebook. Y desde cualquiera de ellos debería poder **iniciarse una conversación**:

> *"Sobre **[este gráfico]** tengo una duda: ¿por qué Q4 sube tanto?"* → el agente recibe el gráfico + su query como contexto y responde.

Mecanismos para lograrlo:
- **"Ask about this"** en cada artefacto (botón/hover) → inyecta una **referencia‑chip** en el input (ej. `@chart:s7`, `@query:s5`, `@finding:3`) + foco en el input.
- **@/# menciones** en el input que autocompletan artefactos de la sesión (`@s5`, `#grafico-ciudades`, `@tabla:sales`).
- **Selección de texto/número** en una respuesta → "preguntar sobre esto".
- **Quick‑actions contextuales** por artefacto (explicar / rehacer distinto / profundizar / validar).

El backend ya tiene la base: las citaciones (`queryId`), los artifacts persistidos, el `display_chart`/`execute_sql` con ids. Falta la **capa de referencia** que empaqueta ese artefacto como contexto del siguiente turno.

## Las 50 interacciones de una sesión de análisis

### A. Señalar un artefacto y preguntar (deixis — el núcleo)
1. *"Explícame **este gráfico**"* ❌ (no hay forma de apuntarlo)
2. *"Cambia **este gráfico** a barras / agrégale meta"* ⚠️ (en assistant sí; en diving no por referencia)
3. *"¿**Este gráfico** representa bien los datos?"* ❌
4. *"¿Por qué **esta query** hace este JOIN?"* ❌ (puedes verla, no preguntarle apuntándola)
5. *"Modifica **esta query**: filtra 2024"* ⚠️ ("Open in editor" la abre; no se lo pides al agente sobre ella)
6. *"¿De dónde sale **este número** ($193M)?"* ⚠️ (citación → modal con la query, read-only)
7. *"Desglosa **este número** por mes"* ❌
8. *"Explícame **el paso s5**"* ❌
9. *"Rehaz **s5** con granularidad semanal"* ❌
10. *"¿**Este hallazgo** (Pareto) es real o ruido?"* ❌
11. *"Profundiza en **San Francisco**"* ⚠️ (vía chip de follow-up si lo sugiere)
12. *"¿Qué hay en **la columna Purchase Address**?"* ⚠️ (describe_table, no por referencia directa)
13. *"Compara **este gráfico** con **este otro**"* ❌ (referencia múltiple)
14. *"Combina lo de **s5** y **s7**"* ❌

### B. Dirigir el análisis en vuelo (mientras corre)
15. Pausar / cancelar ✅
16. *"Mejor enfócate en churn"* (redirigir) ❌
17. Saltar un paso ✅ (skip en el panel del plan)
18. *"Agrega un paso para X"* ❌
19. Aprobar/editar el plan **antes** de ejecutar ⚠️ (se ve, se puede skip; no aprobar)
20. Responder una aclaración (`ask_user`) ✅

### C. Seguir el hilo de los resultados
21. *"¿Por qué?"* (causa) ⚠️ (chip a veces)
22. *"¿Y entonces qué? (implicación)"* ⚠️
23. *"¿Siguientes pasos?"* ✅ (final_answer / chips)
24. *"Reta este supuesto"* ❌
25. *"¿Hay caveats que se te escaparon?"* ⚠️

### D. Transformar / exportar salidas
26. Guardar gráfico en Story Flow ✅ ("Apply to chart" en assistant)
27. Guardar análisis como notebook ✅
28. Exportar un resultado (CSV) ✅ (recién)
29. Abrir una query en el editor ✅
30. Fijar/marcar un hallazgo ❌
31. Mandar un gráfico a un reporte ⚠️ (vía notebook)

### E. Referenciar contexto / datos
32. @-mención de una tabla como contexto ✅ (drop en input)
33. @-mención de un archivo ✅ (drop)
34. Referenciar otra conversación/análisis previo ❌
35. Referenciar una métrica/término del glosario (`.amoxsql/context`) ⚠️ (el agente lo usa, tú no lo invocas)

### F. Verificar / auditar (confianza)
36. *"Muéstrame el SQL detrás de esto"* ✅ (inspector)
37. *"Muéstrame las filas crudas"* ✅ (View data / Show all)
38. *"Re-ejecuta esto para confirmar"* ⚠️ (Open in editor)
39. *"¿Qué te saltaste?"* ⚠️ (skipped en plan)
40. *"¿Qué tan seguro estás?"* ❌

### G. Meta / navegación
41. Saltar al paso que produjo X ⚠️ (citación → modal, no al paso)
42. Buscar dentro del análisis ❌
43. Colapsar/expandir fases ⚠️ (colapsables sueltos)
44. Comparar dos corridas ❌
45. Renombrar/organizar la sesión ✅ (rename en sidebar)

### H. Refinamiento iterativo
46. *"Lo mismo pero del año pasado"* ⚠️ (texto libre)
47. *"Aplica esto a otra tabla"* ⚠️
48. *"Hazlo más ejecutivo / más técnico"* ⚠️
49. *"Agrega una línea de meta en X al gráfico"* ⚠️ (assistant)
50. *"Conviértelo en un dashboard"* ❌

## Diagnóstico

- **Comunicar resultados paso a paso** → ✅ logrado.
- **Seguir el hilo con texto libre** → ✅ (escribes y el agente responde con todo el contexto de la conversación).
- **Referenciar/señalar un artefacto específico para conversar sobre él** → ❌ **es lo que falta** y es lo que haría la interacción *fluida*. Hoy el ~60% de las 50 son ❌/⚠️ justo por esto.

## Propuesta de diseño: capa de **referencia de artefactos**

1. **IDs estables y visibles** por artefacto: paso (`s5`), query (`qr_…`), gráfico (su `queryId`+config), hallazgo (índice), tabla/columna. (Ya existen casi todos.)
2. **"Ask about this"** en cada artefacto del inspector y del chat → inserta una **chip de referencia** en el input + foco. El turno se envía con ese artefacto **empaquetado como contexto** (SQL, datos, config del chart, label del paso).
3. **Autocompletado @/#** en el input para mencionar artefactos de la sesión.
4. **Quick-actions por artefacto** (explicar · rehacer distinto · profundizar · validar) que pre-llenan el prompt.
5. **Selección de un número/texto** en una respuesta → "preguntar sobre esto".
6. (Servidor) un parámetro `referencedArtifacts` en el chat que inyecta esos artefactos al prompt del turno — reusando lo que ya hace `currentResult`/`currentChartConfig` en assistant, pero generalizado a cualquier artefacto de la sesión.

## Prioridad sugerida (cuando se implemente)
1. **"Ask about this" en gráficos** (tu caso exacto: "de este gráfico tengo tal duda") + chip de referencia en el input.
2. Extenderlo a **query, paso y hallazgo**.
3. **@/# menciones** + autocompletado.
4. Quick-actions contextuales + selección de número.

> Núcleo: hoy el agente *te habla*; falta que tú puedas *señalar lo que te dijo* y seguir desde ahí. Esa es la conversación analista‑agente completa.
