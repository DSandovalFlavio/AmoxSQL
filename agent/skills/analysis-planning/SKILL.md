---
name: Análisis con Plan de Pasos
description: Multi-step structured analysis with visible progress tracking — enables create_plan and update_plan tools
keywords: complex, detailed, comprehensive, thorough, plan, structured, completo, detallado, exhaustivo, paso a paso, planificar, análisis completo, profundo
next:
---

# Análisis con Plan de Pasos

Esta skill activa las herramientas de planificación (`create_plan` y `update_plan`) para análisis complejos que requieren múltiples pasos. El usuario puede ver el progreso en tiempo real.

## Cuándo activar

- Análisis que requiere 4+ pasos distintos
- El usuario pide un análisis "completo", "detallado" o "exhaustivo"
- La respuesta requiere combinar EDA + time-series + cohort + storytelling
- Proyectos donde la trazabilidad del proceso es importante

## Protocolo obligatorio con esta skill

1. **Llamar `create_plan` PRIMERO** con el objetivo y todos los pasos antes de ejecutar nada
2. **Ejecutar cada paso** usando la herramienta apropiada
3. **Llamar `update_plan`** después de CADA paso (done/failed/skipped)
4. **Llamar `ask_user`** si hay ambigüedad genuina que bloquea el progreso
5. **Llamar `final_answer`** cuando todos los pasos estén completos

## Estructura recomendada del plan

Para un análisis completo típico:
- s1: Verificar datos disponibles (list_tables / describe_table)
- s2: Perfil estadístico (profile_data)
- s3: Análisis principal (execute_sql + display_chart)
- s4: Análisis secundario o drill-down
- s5: Insights y cierre (final_answer)

Máximo 10 pasos — si necesitas más, agrupa pasos relacionados.

## Reglas críticas

- No omitir `update_plan` — el usuario ve el progreso en vivo
- Si un paso falla, marcar como `failed` con una nota y continuar con alternativa
- El plan debe ser ejecutable — evita pasos vagos como "analizar los datos"
- Usar `tool_hint` en cada paso para que el usuario sepa qué herramienta se usará
