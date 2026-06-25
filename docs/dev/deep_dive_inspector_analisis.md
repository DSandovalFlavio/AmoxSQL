# Deep Dive — Inspector: ¿qué espera aprender un analista por fase?

Análisis centrado en el usuario (un analista que delega un análisis y quiere **validar, aprender y confiar** en cada fase, más allá del resumen final). 50 preguntas que se haría, si la vista actual las responde, y cómo resolverlo si no.

Leyenda: ✅ visible hoy · ⚠️ parcial / mal presentado · ❌ falta

## A. Intención y conclusión de cada fase (el "qué" y el "y entonces")
1. ¿Qué intentaba responder este paso? ⚠️ (el título del paso está, pero abreviado)
2. ¿Tuvo éxito o falló? ✅ (badge DONE/failed)
3. **¿Qué concluyó/aprendió en este paso?** ❌ en el inspector (solo está como nota chiquita en el panel del plan a la derecha) — **la brecha #1**
4. ¿Cómo alimenta este paso al siguiente? ❌
5. ¿Cuál es el titular de una línea de esta fase? ❌ en el inspector
6. ¿Qué decidió NO hacer en este paso y por qué? ⚠️ (a veces en razonamiento)
7. ¿Hubo un hallazgo inesperado en esta fase? ❌ (se diluye)

## B. El método / SQL (validar correctitud)
8. ¿Qué SQL exacto corrió? ⚠️ (está en "Input" como JSON crudo, no formateado)
9. ¿El SQL es correcto (joins/filtros/group by)? ⚠️ (hay que leer JSON)
10. ¿Usó las columnas correctas? ⚠️
11. ¿Manejó nulos / duplicados? ⚠️
12. ¿Cuántas filas devolvió? ✅ (meta "N rows")
13. ¿Cuánto tardó? ✅ ("Nms")
14. ¿Alguna query falló? ✅ (badge error)
15. ¿Reintentó tras un error? ¿qué cambió? ⚠️ (se ve la query corregida pero no el diff)
16. ¿La agregación es sólida (sum vs avg, distinct)? ⚠️
17. ¿Muestreó o usó todo el dataset? ⚠️
18. ¿Puedo abrir esa query en el editor para ajustarla? ❌
19. ¿Puedo copiar el SQL? ⚠️ (solo del JSON)

## C. Los datos / resultados (ver la evidencia)
20. ¿Cómo se ve el resultado (una tabla)? ❌ (hoy es JSON truncado a 800 chars) — **brecha #2**
21. ¿Top / bottom valores? ❌
22. ¿Los números exactos detrás de la afirmación? ⚠️ (truncado)
23. ¿Puedo exportar/copiar el resultado? ❌
24. ¿Los tipos de columna son correctos? ⚠️
25. ¿Distribución / rangos? ⚠️ (solo si hizo profile)
26. ¿Puedo ver TODAS las filas (no solo preview)? ❌

## D. El gráfico (validación visual)
27. ¿Qué gráfico creó? ✅ (inline en el paso)
28. ¿El tipo de gráfico es apropiado? ✅ (se ve)
29. ¿El gráfico coincide con los datos? ✅
30. ¿Puedo exportarlo (PNG) / editar config? ✅
31. ¿De qué query salió este gráfico? ⚠️ (no hay salto explícito)

## E. Razonamiento (el porqué de las decisiones)
32. ¿Por qué eligió este enfoque? ⚠️ (en "Reasoning" arriba, pero global, no por paso)
33. ¿Qué hipótesis consideró? ⚠️
34. ¿Dónde dudó? ⚠️
35. ¿El razonamiento se lee bien? ❌ (contraste bajo, "se pierde por el color") — **brecha #3**
36. ¿Qué razonamiento corresponde a ESTE paso? ❌ (está todo junto arriba)

## F. Calidad de datos y caveats (confianza)
37. ¿Hubo nulos/duplicados/outliers? ¿dónde? ⚠️ (si el paso de calidad lo hizo, en su SQL)
38. ¿Marcó riesgos de calidad? ⚠️ (a veces en la nota del plan / caveats finales)
39. ¿Qué supuestos hizo? ⚠️ (caveats finales, no por fase)
40. ¿Interpretó bien fechas/unidades? ⚠️
41. ¿La muestra es representativa? ⚠️

## G. Plan y progreso (orientación)
42. ¿Cuál es el plan general? ✅ (panel derecho)
43. ¿Qué paso estoy viendo? ✅ (header de sección)
44. ¿Qué pasos están done/pending/failed? ✅ (panel derecho + badges)
45. ¿Se desvió del plan? ¿por qué? ⚠️
46. ¿Saltó pasos? ¿por qué? ⚠️ (badge skipped, sin motivo prominente)

## H. Síntesis y navegación (usabilidad)
47. ¿Cuál es la respuesta final? ✅ (ahora en el chat)
48. ¿Cómo salto de un hallazgo a la query/paso que lo produjo? ⚠️ (citaciones en el chat → modal; no al paso del inspector)
49. ¿Puedo ver todos los gráficos juntos (galería)? ❌
50. ¿Puedo re-ejecutar un paso / guardar como notebook? ⚠️ (notebook sí desde el chat; re-run no)

## Resumen de brechas (lo que más duele)

1. **Conclusión por fase ausente en el inspector** (Q3/Q5/Q7): el analista no ve *qué se aprendió* en cada paso sin irse al panel del plan. **La más importante.**
2. **Queries y resultados mal presentados** (Q8/Q20): SQL como JSON crudo y datos truncados, en vez de SQL formateado + tabla de resultados + acciones. (El usuario lo percibe como "se perdieron las queries".)
3. **Razonamiento de bajo contraste y global** (Q35/Q36): se pierde visualmente y no se asocia al paso.
4. **Sin saltos** finding→query→paso, ni galería de gráficos (Q31/Q48/Q49).
5. **Calidad/caveats no surgen por fase** (F): solo al final.

## Propuesta: rediseñar la "tarjeta de fase" del inspector

Cada paso del plan se vuelve una **tarjeta de fase** rica:

```
┌ s5 · Analizar tendencia temporal de ventas               [DONE] ┐
│ 💡 Insight: ventas anuales casi idénticas ($33.9–34.5M),        │  ← conclusión del paso (Q3)
│    estacionalidad clara (picos Oct–Dic). [posible dato sintético]│
│                                                                  │
│ ▸ Reasoning (de este paso, si se puede mapear)        [colapsa] │  ← Q36 (best-effort)
│                                                                  │
│ SQL ─ DATE_TRUNC('month', …)              70 rows · 240ms       │  ← SQL formateado (Q8)
│   [tabla de resultados · preview 10 filas]  [View data][Editor] │  ← tabla + acciones (Q20/18/23)
│                                                                  │
│ 📊 [chart inline]                                               │  ← Q27 (ya está)
└──────────────────────────────────────────────────────────────┘
```

Cambios concretos:
- **A. Insight por fase (prioridad 1)**: extraer la `note` del `update_plan(step, done, note)` (o del step del plan) y mostrarla **prominente** en el header de la tarjeta de fase. Eso responde "qué aprendió" sin salir del inspector.
- **B. Restaurar render de SQL (prioridad 1)**: en vez de `ToolCallBlock` con JSON, mostrar el **SQL formateado** + **tabla de resultados** (preview) + acciones **View data / Open in editor / Copy**. (Reusar el render de `sqlCalls` que ya existe en `ChatMessage`, extraído a un componente.)
- **C. Razonamiento (prioridad 2)**: subir el contraste; si se puede inferir, mostrar el razonamiento por fase; si no, mantenerlo arriba pero más legible.
- **D. Saltos y galería (prioridad 3)**: del chart → su query; de un hallazgo (chat) → su paso (inspector); botón "ver todos los gráficos".
- **E. Calidad por fase (prioridad 3)**: si un paso detecta nulos/dupes/outliers, un badge/resumen en la tarjeta.

## Orden sugerido de implementación
1. **Insight por fase** + **render de SQL con tabla** (las 2 brechas que más molestan).
2. Contraste del razonamiento.
3. Saltos finding→paso, galería de gráficos.
4. Calidad por fase, re-run.
